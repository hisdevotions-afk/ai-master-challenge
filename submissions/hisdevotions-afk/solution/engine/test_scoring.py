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
TOY = s.fit_curve([_closed(5, False)] * 40 + [_closed(90, True)] * 50 + [_closed(100, False)] * 10)


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
    deals = [_open(age=80), _open(age=10)]
    for d in deals:
        d.update(s.score_open(d, TOY, REF))
    s.add_scores(deals)
    assert deals[0]["score"] > deals[1]["score"]


def test_every_deal_explains_itself_and_flags_missing_account():
    r = s.score_open(_open(age=80, account=None), TOY, REF)
    kinds = [x["kind"] for x in r["reasons"]]
    assert "+" in kinds and "!" in kinds and r["action"]


def test_significance_separates_noise_from_signal():
    rng = random.Random(1)
    noise = [{"stage": "Won" if rng.random() < 0.6 else "Lost", "g": i % 5} for i in range(1000)]
    signal = [{"stage": "Won" if (i % 2 == 0) == (rng.random() < 0.9) else "Lost", "g": i % 2} for i in range(1000)]
    assert s.dispersion_p(noise, lambda d: d["g"], random.Random(2))[1] > 0.05
    assert s.dispersion_p(signal, lambda d: d["g"], random.Random(2))[1] < 0.01


def test_wilson_interval():
    low, high = s.wilson(60, 100)
    assert 0.49 < low < 0.6 < high < 0.7


def test_real_data_end_to_end():
    data = s.build()
    m = data["meta"]
    assert m["reference_date"] == "2017-12-31" and m["max_cycle"] == 138
    open_deals = [d for d in data["deals"] if d["stage"] in s.OPEN_STAGES]
    assert len(open_deals) == 2089
    assert all(0 <= d["score"] <= 100 and d["reasons"] for d in open_deals)
    live = [d["score"] for d in open_deals if d["bucket"] != "decidir"]
    assert min(live) == 0 and max(live) == 100, "escala precisa usar 0–100 entre deals vivos"
    assert sum(d["bucket"] == "decidir" for d in open_deals) == 1301  # idade >= 138: aberto aos 138 só fecharia depois, e isso nunca aconteceu
    used = {t["feature"] for t in data["significance"] if t["used"]}
    assert used == {"Idade do deal (fechou em até 15 dias ou não)"}
    # teste global de vendedor deu p≈0,3: nenhum vendedor pode ser rotulado como diferente
    assert {a["verdict"] for a in data["agents"]} <= {"dentro da média", "sem histórico"}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
