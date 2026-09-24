"""Motor de scoring do pipeline de vendas.

Lê os 4 CSVs do CRM, aprende com os deals já fechados (Won/Lost) o que a IDADE
de um deal diz sobre a chance e o momento de fechar, e pontua cada deal aberto.

Por que só a idade: na exploração, vendedor, conta, produto, setor, região,
manager e tamanho da conta (receita, funcionários) foram testados contra o
acaso e nenhum se distinguiu dele (ver `significance()` e
process-log/PROCESS.md). Tamanho da conta é contínuo, não categórico: em vez
de comparar grupos fixos, o teste acha o melhor corte binário possível (a
mesma primitiva de uma árvore de decisão / XGBoost) e mede se esse melhor
corte bate o acaso — ver `continuous_split_p`. Eles aparecem na tela como
contexto, mas não pesam no score.

Uso: python scoring.py [--ref AAAA-MM-DD] [--out caminho/data.json]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import random
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DEFAULT_OUT = ROOT / "app" / "public" / "data.json"

# Problemas de qualidade achados na exploração: sem isso 1.480 deals perdem o preço no join.
PRODUCT_FIXES = {"GTXPro": "GTX Pro"}
SECTOR_FIXES = {"technolgy": "technology"}

HORIZON = 30        # "fechar logo" = nos próximos 30 dias
PRIOR = 20          # peso, em deals, da taxa global na suavização (idades com pouca amostra)
WINDOW_MIN = 0.5    # janela de fechamento: idade em que >= 50% dos deals fecham no horizonte
SIM_RUNS = 2000     # sorteios do teste de significância
OPEN_STAGES = ("Prospecting", "Engaging")


# ─── carga ──────────────────────────────────────────────────────────────────

def _rows(data_dir: Path, name: str) -> list[dict]:
    with open(data_dir / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _day(s: str) -> date | None:
    return date.fromisoformat(s) if s else None


def load(data_dir: Path = DATA_DIR):
    """Junta as 4 tabelas (pipeline no centro) já com as correções de qualidade."""
    teams = {r["sales_agent"]: r for r in _rows(data_dir, "sales_teams.csv")}
    products = {r["product"]: r for r in _rows(data_dir, "products.csv")}
    accounts = {}
    for r in _rows(data_dir, "accounts.csv"):
        r["sector"] = SECTOR_FIXES.get(r["sector"], r["sector"])
        accounts[r["account"]] = r
    deals = []
    for r in _rows(data_dir, "sales_pipeline.csv"):
        product = PRODUCT_FIXES.get(r["product"], r["product"])
        team = teams[r["sales_agent"]]
        deals.append({
            "id": r["opportunity_id"],
            "agent": r["sales_agent"],
            "manager": team["manager"],
            "region": team["regional_office"],
            "product": product,
            "series": products[product]["series"],
            "price": int(products[product]["sales_price"]),
            "account": r["account"] or None,
            "stage": r["deal_stage"],
            "engage": _day(r["engage_date"]),
            "close": _day(r["close_date"]),
            "close_value": int(r["close_value"]) if r["close_value"] else None,
        })
    return deals, teams, products, accounts


# ─── o que o histórico ensina ───────────────────────────────────────────────

@dataclass(frozen=True)
class AgeCurve:
    """Para cada idade (dias desde o engajamento), o que aconteceu com os deals
    fechados que ainda estavam abertos nessa idade."""
    base_rate: float
    max_cycle: int            # maior ciclo já visto; acima disso não há histórico
    n: list[int]              # deals que sobreviveram a essa idade
    win: list[float]          # P(ganhar), suavizada para base_rate quando n é pequeno
    close_soon: list[float]   # P(fechar nos próximos HORIZON dias)
    win_soon: list[float]     # P(ganhar nos próximos HORIZON dias)
    window_start: int         # a partir daqui close_soon >= WINDOW_MIN até max_cycle


def fit_curve(closed: list[dict]) -> AgeCurve:
    cycles = [((d["close"] - d["engage"]).days, d["stage"] == "Won") for d in closed]
    base = sum(w for _, w in cycles) / len(cycles)
    max_cycle = max(c for c, _ in cycles)
    n, win, close_soon, win_soon = [], [], [], []
    # ponytail: O(idades × deals) ≈ 1M passos, instantâneo; ordenar + ponteiros se a base crescer 100x
    for age in range(max_cycle + 1):
        alive = [(c, w) for c, w in cycles if c > age]
        soon = [(c, w) for c, w in alive if c <= age + HORIZON]
        n.append(len(alive))
        win.append((sum(w for _, w in alive) + PRIOR * base) / (len(alive) + PRIOR))
        close_soon.append(len(soon) / len(alive) if alive else 0.0)
        win_soon.append(sum(w for _, w in soon) / len(alive) if alive else 0.0)
    start = max_cycle
    while start > 0 and close_soon[start - 1] >= WINDOW_MIN:
        start -= 1
    return AgeCurve(base, max_cycle, n, win, close_soon, win_soon, start)


# ─── pontuação de um deal aberto ────────────────────────────────────────────

def _pct(p: float) -> str:
    return f"{p:.0%}"


def _money(v: float) -> str:
    return "US$ " + f"{v:,.0f}".replace(",", ".")


def score_open(deal: dict, curve: AgeCurve, ref: date) -> dict:
    """Chance, momento, valor esperado, fila de ação e o porquê em português."""
    price = deal["price"]
    reasons: list[tuple[str, str]] = []

    if deal["stage"] == "Prospecting":
        # Sem data de engajamento: assume o relógio começando hoje, se o vendedor engajar.
        age, at = None, 0
        bucket = "prospectar"
        reasons.append(("i", "Ainda em prospecção: não há data de engajamento, então o relógio não começou"))
        reasons.append(("+", f"Se engajado agora: {_pct(curve.win_soon[0])} dos deals são ganhos em até {HORIZON} dias do engajamento"))
        action = "Faça o primeiro contato qualificado e passe para Engaging."
    else:
        age = (ref - deal["engage"]).days
        at = age
        if age >= curve.max_cycle:
            bucket = "decidir"
            reasons.append(("-", f"{age} dias em negociação: nenhum deal da base fechou depois de {curve.max_cycle} dias"))
            reasons.append(("-", "Sem histórico comparável: fica fora do forecast realista até ser requalificado"))
            action = "Requalifique ou encerre: confirme com o cliente se ainda existe decisão; se não, marque como perdido."
        elif age >= curve.window_start:
            bucket = "fechar"
            reasons.append(("+", f"{age} dias em negociação: {_pct(curve.close_soon[age])} dos deals nessa idade fecham em até {HORIZON} dias"))
            action = "Priorize esta semana: o deal está na janela em que os deals fecham."
        else:
            bucket = "avancar"
            reasons.append(("-", f"{age} dias em negociação: ainda cedo, só {_pct(curve.close_soon[age])} fecham nos próximos {HORIZON} dias (a janela começa aos {curve.window_start} dias)"))
            action = f"Mantenha contato e avance: faltam ~{curve.window_start - age} dias para a janela de fechamento."
        if bucket != "decidir":
            sign = "+" if curve.win[age] >= curve.base_rate else "-"
            reasons.append((sign, f"Deals que chegam a {age} dias ganham {_pct(curve.win[age])} das vezes (média geral {_pct(curve.base_rate)}; base de {curve.n[age]} deals)"))

    zombie = bucket == "decidir"
    win_prob = None if zombie else curve.win[at]
    close_soon = None if zombie else curve.close_soon[at]
    reasons.append(("i", f"Valor: {deal['product']} a {_money(price)} (preço de lista; deals ganhos fecham em média a 100% dele)"))
    if deal["account"] is None:
        reasons.append(("!", "Sem conta vinculada: cadastre a empresa para o deal entrar no histórico da conta"))
    return {
        "age": age,
        "bucket": bucket,
        "win_prob": win_prob,
        "close_soon": close_soon,
        "ev": 0 if zombie else round(price * win_prob),                  # valor esperado total
        "ev_soon": 0 if zombie else round(price * curve.win_soon[at]),   # receita esperada em HORIZON dias
        "reasons": [{"kind": k, "text": t} for k, t in reasons],
        "action": action,
    }


def add_scores(open_deals: list[dict]) -> None:
    """Score 0–100 = percentil da receita esperada nos próximos 30 dias entre os deals VIVOS.
    Zumbis ficam em 0 e fora do ranking: incluídos, os ~60% empatados em zero
    empurravam todo deal vivo para 62–100 e a escala deixava de diferenciar."""
    live = sorted(d["ev_soon"] for d in open_deals if d["bucket"] != "decidir")
    for d in open_deals:
        d["score"] = 0 if d["bucket"] == "decidir" else round(100 * bisect_left(live, d["ev_soon"]) / max(len(live) - 1, 1))


# ─── honestidade estatística ────────────────────────────────────────────────

def dispersion_p(closed: list[dict], key, rng: random.Random) -> tuple[int, float]:
    """p-valor: com que frequência o acaso puro (todos com a mesma taxa de ganho)
    produz diferenças entre grupos tão grandes quanto as observadas."""
    groups: dict = defaultdict(lambda: [0, 0])
    for d in closed:
        g = groups[key(d)]
        g[0] += 1
        g[1] += d["stage"] == "Won"
    counts = list(groups.values())
    base = sum(w for _, w in counts) / sum(n for n, _ in counts)

    def spread(pairs):
        return sum(n * (w / n - base) ** 2 for n, w in pairs)

    observed = spread(counts)
    hits = sum(
        spread([(n, rng.binomialvariate(n, base)) for n, _ in counts]) >= observed
        for _ in range(SIM_RUNS)
    )
    return len(counts), hits / SIM_RUNS


def best_gain_over_sorted(sorted_vals: list[float], wins: list[int]) -> float:
    """Ganho do melhor split binário sobre uma feature CONTÍNUA já ordenada por
    valor: a mesma primitiva que uma árvore de decisão (XGBoost, CART) avalia em
    cada nó. Uma única passada com somas acumuladas testa TODOS os thresholds
    candidatos em O(n), em vez de recomputar os dois grupos do zero para cada um."""
    n_total = len(sorted_vals)
    w_total = sum(wins)
    base = w_total / n_total
    best_gain = -1.0
    cum_n = cum_w = 0
    for i in range(n_total - 1):
        cum_n += 1
        cum_w += wins[i]
        if sorted_vals[i] == sorted_vals[i + 1]:
            continue  # só avalia threshold entre valores distintos
        left_n, left_w = cum_n, cum_w
        right_n, right_w = n_total - cum_n, w_total - cum_w
        gain = left_n * (left_w / left_n - base) ** 2 + right_n * (right_w / right_n - base) ** 2
        best_gain = max(best_gain, gain)
    return best_gain


def continuous_split_p(pairs: list[tuple[float, int]], rng: random.Random) -> tuple[int, float]:
    """p-valor do melhor split de uma feature contínua: ordena por valor UMA VEZ
    (o custo O(n log n) de todo o teste) e reusa essa ordem em cada rodada — cada
    permutação só embaralha os rótulos Won/Lost e faz uma passada O(n), sem
    reordenar (a mesma ideia do XGBoost: ordenar a feature uma vez, reusar a
    ordem em cada avaliação de split). Testar o MELHOR de muitos thresholds
    infla falso-positivo do mesmo jeito que comparar muitos vendedores; a
    permutação corrige isso simulando o acaso sobre o próprio procedimento de
    busca, não só sobre um split fixo."""
    rows = sorted(pairs, key=lambda vw: vw[0])
    sorted_vals = [v for v, _ in rows]
    wins = [w for _, w in rows]
    observed = best_gain_over_sorted(sorted_vals, wins)
    shuffled = wins[:]
    hits = 0
    for _ in range(SIM_RUNS):
        rng.shuffle(shuffled)
        if best_gain_over_sorted(sorted_vals, shuffled) >= observed:
            hits += 1
    return 2, hits / SIM_RUNS  # 2 = as duas metades do melhor split achado


def significance(closed: list[dict], accounts: dict, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    cycle = lambda d: (d["close"] - d["engage"]).days  # noqa: E731
    tests = [
        ("Idade do deal (fechou em até 15 dias ou não)", lambda d: cycle(d) <= 15, True,
         "Usado: é o único sinal sobre SE e QUANDO um deal fecha."),
        ("Mês de fim de trimestre", lambda d: d["close"].month % 3 == 0, False,
         "Real, mas diz quando os deals são registrados, não se um deal aberto vai fechar."),
        ("Vendedor", lambda d: d["agent"], False, ""),
        ("Conta", lambda d: d["account"], False, ""),
        ("Produto", lambda d: d["product"], False, ""),
        ("Setor da conta", lambda d: accounts[d["account"]]["sector"], False, ""),
        ("Região", lambda d: d["region"], False, ""),
        ("Manager", lambda d: d["manager"], False, ""),
        ("Vendedor × produto", lambda d: (d["agent"], d["product"]), False, ""),
    ]
    out = []
    for name, key, used, note in tests:
        groups, p = dispersion_p(closed, key, rng)
        out.append({"feature": name, "groups": groups, "p_value": p, "used": used,
                    "note": note or "Não usado: diferenças do tamanho que o acaso produz."})

    # Tamanho da conta é contínuo (não categórico): testado à parte, com o
    # melhor split binário em vez de grupos fixos — ver continuous_split_p.
    continuous = [
        ("Tamanho da conta (receita anual)", "revenue"),
        ("Tamanho da conta (funcionários)", "employees"),
    ]
    for name, field in continuous:
        pairs = [(float(accounts[d["account"]][field]), d["stage"] == "Won") for d in closed]
        groups, p = continuous_split_p(pairs, rng)
        out.append({"feature": name, "groups": groups, "p_value": p, "used": False,
                    "note": "Não usado: nem o melhor corte por tamanho de conta bate o acaso."})
    return out


def wilson(won: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Intervalo de confiança de 95% para uma taxa (robusto com amostra pequena)."""
    if n == 0:
        return 0.0, 1.0
    p = won / n
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return center - half, center + half


def agent_stats(deals: list[dict], teams: dict, base: float) -> list[dict]:
    """Taxa de ganho por vendedor. O intervalo é corrigido por Bonferroni: comparando
    35 pessoas a 95%, 1 ou 2 pareceriam "diferentes" por puro acaso."""
    z = NormalDist().inv_cdf(1 - 0.05 / (2 * len(teams)))
    out = []
    for name, t in teams.items():
        mine = [d for d in deals if d["agent"] == name and d["stage"] in ("Won", "Lost")]
        won = sum(d["stage"] == "Won" for d in mine)
        low, high = wilson(won, len(mine), z)
        verdict = ("sem histórico" if not mine else "acima da média" if low > base
                   else "abaixo da média" if high < base else "dentro da média")
        out.append({"name": name, "manager": t["manager"], "region": t["regional_office"],
                    "closed": len(mine), "won": won, "win_rate": won / len(mine) if mine else None,
                    "ci_low": low, "ci_high": high, "verdict": verdict})
    return out


# ─── montagem do JSON que o app lê ─────────────────────────────────────────

def build(data_dir: Path = DATA_DIR, ref: date | None = None) -> dict:
    deals, teams, products, accounts = load(data_dir)
    closed = [d for d in deals if d["stage"] in ("Won", "Lost")]
    ref = ref or max(x for d in deals for x in (d["engage"], d["close"]) if x)
    curve = fit_curve(closed)
    open_deals = [d for d in deals if d["stage"] in OPEN_STAGES]
    for d in open_deals:
        d.update(score_open(d, curve, ref))
    add_scores(open_deals)
    stats = significance(closed, accounts)
    agents = agent_stats(deals, teams, curve.base_rate)
    for d in deals:  # só depois das contas com data: serializa no próprio dict
        d["engage"] = d["engage"] and d["engage"].isoformat()
        d["close"] = d["close"] and d["close"].isoformat()
    return {
        "meta": {
            "reference_date": ref.isoformat(),
            "horizon_days": HORIZON,
            "base_rate": curve.base_rate,
            "max_cycle": curve.max_cycle,
            "window_start": curve.window_start,
            "closed_deals": len(closed),
            "data_fixes": [
                "Produto 'GTXPro' no pipeline corrigido para 'GTX Pro' (1.480 deals sem preço no join)",
                "Setor 'technolgy' corrigido para 'technology'",
            ],
        },
        "curve": [
            {"age": a, "n": curve.n[a], "win": curve.win[a],
             "close_soon": curve.close_soon[a], "win_soon": curve.win_soon[a]}
            for a in range(curve.max_cycle + 1)
        ],
        "significance": stats,
        "agents": agents,
        "accounts": list(accounts.values()),
        "products": list(products.values()),
        "deals": deals,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ref", type=date.fromisoformat, help="data de referência ('hoje'); padrão = última data do dataset")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    data = build(ref=args.ref)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    m = data["meta"]
    open_deals = [d for d in data["deals"] if d["stage"] in OPEN_STAGES]
    by_bucket = defaultdict(int)
    for d in open_deals:
        by_bucket[d["bucket"]] += 1
    print(f"ref={m['reference_date']} taxa_base={m['base_rate']:.1%} ciclo_max={m['max_cycle']}d "
          f"janela>={m['window_start']}d abertos={len(open_deals)} filas={dict(by_bucket)}")
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
