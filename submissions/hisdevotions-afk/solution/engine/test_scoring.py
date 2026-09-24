"""Testes do motor. Rodam com `python -m pytest` ou, sem pytest, `python test_scoring.py`."""
import random
from datetime import date, timedelta

import scoring as s

REF = date(2017, 12, 31)


def _closed(cycle, won, start=date(2017, 1, 1)):
    return {"stage": "Won" if won else "Lost", "engage": start, "close": start + timedelta(days=cycle)}


def _open(stage="Engaging", age=None, price=1000, account="Acme"):
    return {"stage": stage, "engage": REF - timedelta(days=age) if age is not None else None,
            "price": price, "product": "X", "account": account}


# histórico sintético: tudo que passa de 60 dias fecha até o dia 100
TOY = s.fit_curve([_closed(5, False)] * 40 + [_closed(90, True)] * 50 + [_closed(100, False)] * 10, [])


def test_data_quality_fixes_applied():
    deals, _, products, accounts = s.load()
    assert all(d["product"] in products for d in deals), "join de produto quebrado"
    assert "technolgy" not in {a["sector"] for a in accounts.values()}
    assert sum(d["product"] == "GTX Pro" for d in deals) >= 1480


def test_curve_learns_from_survival():
    assert TOY.max_cycle == 100
    assert TOY.win[70] > TOY.base_rate            # quem sobrevive à fase de morte rápida ganha mais
    assert TOY.close_soon[70] == 1.0 and TOY.close_soon[10] == 0.0
    assert TOY.window_start <= 70 < 100


def test_zombie_has_no_value_and_goes_to_decide():
    r = s.score_open(_open(age=150), TOY, REF)
    assert r["bucket"] == "decidir" and r["ev"] == 0 and r["ev_soon"] == 0 and r["win_prob"] is None


def test_buckets_by_age_and_stage():
    assert s.score_open(_open(age=80), TOY, REF)["bucket"] == "fechar"
    assert s.score_open(_open(age=10), TOY, REF)["bucket"] == "avancar"
    p = s.score_open(_open(stage="Prospecting"), TOY, REF)
    assert p["bucket"] == "prospectar" and p["age"] is None


def test_window_outranks_young_deal_of_same_value():
    deals = [s.score_open(_open(age=80), TOY, REF), s.score_open(_open(age=10), TOY, REF)]
    assert deals[0]["score"] > deals[1]["score"]


def test_censoring_pulls_close_soon_down():
    # 40 deals reach age 89 and are STILL OPEN 30+ days later without closing.
    # Ignoring them (closed-only) would say close_soon[89] == 1.0; they prove
    # otherwise and must drag the estimate down.
    closed = [_closed(5, False)] * 20 + [_closed(90, True)] * 30
    blind = s.fit_curve(closed, [])
    honest = s.fit_curve(closed, open_ages=[130] * 40)  # observed 41+ days past age 89, never closed
    assert blind.close_soon[89] == 1.0
    assert honest.close_soon[89] < 0.5


def test_prospecting_and_zombie_have_no_score():
    zombie = s.score_open(_open(age=150), TOY, REF)
    prospect = s.score_open(_open(stage="Prospecting"), TOY, REF)
    assert zombie["score"] is None and prospect["score"] is None
    assert s.score_open(_open(age=80), TOY, REF)["score"] is not None


def test_every_deal_explains_itself_and_flags_missing_account():
    r = s.score_open(_open(age=80, account=None), TOY, REF)
    kinds = [x["kind"] for x in r["reasons"]]
    assert "+" in kinds and "!" in kinds and r["action"]


def _scored(**kwargs):
    d = _open(**kwargs)
    d.update(s.score_open(d, TOY, REF))  # como build() faz: mescla no dict original (mantém account etc.)
    return d


def test_suggest_decide_flags_no_account_and_stale_deals():
    # TOY.max_cycle == 100. Sem histórico de outcome pra zumbi (ainda abertos):
    # a sugestão só pode vir de conta vinculada + quanto além do maior ciclo.
    no_account = _scored(age=200, account=None)
    barely_over = _scored(age=101, account="Acme")   # 1 dia além
    way_over = _scored(age=180, account="Acme")      # 80 dias além
    stalled = [no_account, barely_over, way_over]
    s.suggest_decide(stalled, TOY.max_cycle)
    assert no_account["suggested_action"] == "encerrar"
    assert barely_over["suggested_action"] == "confirmar"   # pouco além da mediana, tem conta
    assert way_over["suggested_action"] == "encerrar"        # bem além da mediana
    assert "1 dia " in barely_over["action"]  # singular, não "1 dias"


def test_suggest_decide_empty_list_does_nothing():
    s.suggest_decide([], 100)  # não deve levantar exceção


def test_significance_separates_noise_from_signal():
    rng = random.Random(1)
    noise = [{"stage": "Won" if rng.random() < 0.6 else "Lost", "g": i % 5} for i in range(1000)]
    signal = [{"stage": "Won" if (i % 2 == 0) == (rng.random() < 0.9) else "Lost", "g": i % 2} for i in range(1000)]
    assert s.dispersion_p(noise, lambda d: d["g"], random.Random(2))[1] > 0.05
    assert s.dispersion_p(signal, lambda d: d["g"], random.Random(2))[1] < 0.01


def test_continuous_split_finds_signal_not_noise():
    rng = random.Random(3)
    noise = [(rng.random(), 1 if rng.random() < 0.6 else 0) for _ in range(500)]
    signal = [(v, 1 if (v > 0.5) == (rng.random() < 0.9) else 0) for v in [rng.random() for _ in range(500)]]
    assert s.continuous_split_p(noise, random.Random(4))[1] > 0.05
    assert s.continuous_split_p(signal, random.Random(4))[1] < 0.01


def test_wilson_interval():
    low, high = s.wilson(60, 100)
    assert 0.49 < low < 0.6 < high < 0.7


def test_real_data_end_to_end():
    data = s.build()
    m = data["meta"]
    assert m["reference_date"] == "2017-12-31" and m["max_cycle"] == 138
    open_deals = [d for d in data["deals"] if d["stage"] in s.OPEN_STAGES]
    assert len(open_deals) == 2089
    assert all(d["reasons"] for d in open_deals)
    assert all(d["score"] is None or 0 <= d["score"] <= 100 for d in open_deals)
    # zumbi e prospecção não têm histórico confiável para um score de curto prazo
    assert all(d["score"] is None for d in open_deals if d["bucket"] in ("decidir", "prospectar"))
    assert all(d["score"] is not None for d in open_deals if d["bucket"] in ("fechar", "avancar"))
    assert sum(d["bucket"] == "decidir" for d in open_deals) == 1301  # idade >= 138: aberto aos 138 só fecharia depois, e isso nunca aconteceu
    decidir = [d for d in open_deals if d["bucket"] == "decidir"]
    assert all(d["suggested_action"] in ("encerrar", "confirmar") for d in decidir)
    assert all(d["suggested_action"] is None for d in open_deals if d["bucket"] != "decidir")
    used = {t["feature"] for t in data["significance"] if t["used"]}
    assert used == {"Idade do deal (fechou em até 15 dias ou não)"}
    # teste global de vendedor deu p≈0,3: nenhum vendedor pode ser rotulado como diferente
    assert {a["verdict"] for a in data["agents"]} <= {"dentro da média", "sem histórico"}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
