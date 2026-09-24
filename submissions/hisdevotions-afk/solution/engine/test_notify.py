"""Testes do bot de notificação. Rodam com `python -m pytest` ou `python test_notify.py`."""
import notify as n

DATA = {
    "deals": [
        {"stage": "Engaging", "agent": "Ana Lima", "bucket": "fechar", "account": "Acme", "product": "X",
         "action": "Priorize esta semana.", "ev_soon": 500, "ev": 500, "price": 1000},
        {"stage": "Engaging", "agent": "Ana Lima", "bucket": "decidir", "account": None, "product": "Y",
         "action": "Requalifique ou encerre.", "ev_soon": 0, "ev": 0, "price": 2000},
        {"stage": "Engaging", "agent": "Bea Costa", "bucket": "prospectar", "account": "Beta", "product": "Z",
         "action": "Engaje.", "ev_soon": 100, "ev": 100, "price": 300},
        {"stage": "Won", "agent": "Ana Lima", "bucket": None, "account": "Acme", "product": "X",
         "action": None, "ev_soon": 0, "ev": 0, "price": 1000},
    ],
}


def test_digest_filters_by_agent_and_open_stage():
    text = n.build_digest(DATA, "Ana Lima")
    assert "Acme" in text and "Beta" not in text  # só deals abertos da Ana; o Won dela não entra na fila


def test_digest_flags_missing_account():
    assert "sem conta vinculada" in n.build_digest(DATA, "Ana Lima").lower()


def test_digest_without_agent_is_company_wide():
    text = n.build_digest(DATA, None)
    assert "Acme" in text and "Beta" in text


def test_digest_shows_action_not_just_number():
    assert "Priorize esta semana." in n.build_digest(DATA, "Ana Lima")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
