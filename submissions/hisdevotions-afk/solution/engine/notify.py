"""Bot de notificação: manda a fila de prioridades do dia por Slack ou email.

Lê o data.json que scoring.py já gera — mesmas filas, mesmos motivos e mesma
ação recomendada que o app mostra na tela "Meu dia". Nenhum texto novo,
nenhuma chamada a LLM: o bot só reformata o que o motor já calculou.

Uso:
  python3 notify.py --agent "Hayden Neloms"                    # imprime no terminal (sem enviar)
  python3 notify.py --agent "Hayden Neloms" --webhook $URL      # manda pro Slack (incoming webhook)
  python3 notify.py --agent "Hayden Neloms" --to vendedor@ex.com  # manda por email (precisa de SMTP_HOST no ambiente)
  python3 notify.py                                             # digest da empresa inteira

Variáveis de ambiente aceitas no lugar das flags: SLACK_WEBHOOK_URL, NOTIFY_EMAIL_TO,
SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM.
"""
from __future__ import annotations

import argparse
import json
import os
import smtplib
import urllib.request
from email.message import EmailMessage
from pathlib import Path

import scoring as s

QUEUES = [
    ("fechar", "Feche esta semana", 6, lambda d: -d["ev_soon"]),
    ("decidir", "Decida o destino", 4, lambda d: -d["price"]),
    ("avancar", "Mantenha em movimento", 4, lambda d: -d["ev"]),
    ("prospectar", "Engaje", 4, lambda d: -d["ev_soon"]),
]


def _name(d: dict) -> str:
    return f"{d['account'] or 'Sem conta vinculada'} — {d['product']}"


def build_digest(data: dict, agent: str | None) -> str:
    """Mesma estrutura da tela 'Meu dia': 4 filas, cada uma com a ação de cada deal."""
    open_deals = [d for d in data["deals"] if d["stage"] in s.OPEN_STAGES and (agent is None or d["agent"] == agent)]
    lines = [f"Bom dia, {agent.split(' ')[0]}." if agent else "Semana da empresa inteira.", ""]
    for bucket, title, cap, key in QUEUES:
        queue = sorted((d for d in open_deals if d["bucket"] == bucket), key=key)
        lines.append(f"*{title}* ({len(queue)})")
        if not queue:
            lines.append("  (nenhum deal)")
        for d in queue[:cap]:
            lines.append(f"  - {_name(d)} — {s._money(d['ev_soon'])} em 30d: {d['action']}")
        lines.append("")
    no_account = sum(1 for d in open_deals if not d["account"])
    if no_account:
        lines.append(f"{no_account} deal(s) sem conta vinculada — cadastre a empresa no CRM.")
    return "\n".join(lines).strip()


def send_slack(webhook: str, text: str) -> None:
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(webhook, data=body, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10)


def send_email(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("SMTP_FROM", "pipeline-em-foco@localhost")
    msg["To"] = to
    msg.set_content(text)
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=10) as smtp:
        smtp.starttls()
        user = os.environ.get("SMTP_USER")
        if user:
            smtp.login(user, os.environ["SMTP_PASS"])
        smtp.send_message(msg)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--agent", help="nome exato do vendedor (sales_agent); omitido = digest da empresa inteira")
    ap.add_argument("--data", type=Path, default=s.DEFAULT_OUT, help="data.json gerado por scoring.py")
    ap.add_argument("--webhook", default=os.environ.get("SLACK_WEBHOOK_URL"), help="URL do incoming webhook do Slack")
    ap.add_argument("--to", default=os.environ.get("NOTIFY_EMAIL_TO"), help="email de destino (requer SMTP_HOST no ambiente)")
    args = ap.parse_args()

    data = json.loads(args.data.read_text(encoding="utf-8"))
    text = build_digest(data, args.agent)

    if not args.webhook and not args.to:
        print(text)
        return
    if args.webhook:
        send_slack(args.webhook, text)
        print(f"-> Slack ({args.webhook[:40]}...)")
    if args.to:
        send_email(args.to, f"Pipeline em Foco — {args.agent or 'empresa'}", text)
        print(f"-> email ({args.to})")


if __name__ == "__main__":
    main()
