import type { ReactNode } from "react";
import { useApp } from "./data";
import { link } from "./router";
import { money, pct } from "./format";
import type { Bucket, CurvePoint, Meta, OpenDeal, Reason } from "./types";

export const BUCKETS: Record<Bucket, { label: string; hint: string }> = {
  fechar: { label: "Fechar", hint: "Na janela em que os deals fecham" },
  decidir: { label: "Decidir", hint: "Parado além de qualquer ciclo já visto" },
  avancar: { label: "Avançar", hint: "Ainda cedo para fechar" },
  prospectar: { label: "Prospectar", hint: "Ainda não engajado" },
};

export const BUCKET_ORDER: Bucket[] = ["fechar", "avancar", "prospectar", "decidir"];

export function BucketTag({ bucket }: { bucket: Bucket }) {
  return <span className={`tag tag-${bucket}`}>{BUCKETS[bucket].label}</span>;
}

export function Score({ deal, size = "sm" }: { deal: OpenDeal; size?: "sm" | "lg" }) {
  if (deal.score == null)
    return (
      <span className={`score score-${size} score-none on-${deal.bucket}`} title="Sem score: fora do modelo (zumbi ou ainda sem histórico de conversão)">
        —
      </span>
    );
  return (
    <span className={`score score-${size} on-${deal.bucket}`} title="Chance de ganhar nos próximos 30 dias">
      {deal.score}
    </span>
  );
}

export function DealName({ deal }: { deal: { account: string | null; product: string } }) {
  return (
    <>
      <span className={deal.account ? "" : "no-account"}>{deal.account ?? "Sem conta vinculada"}</span>
      <span className="deal-product">{deal.product}</span>
    </>
  );
}

// ─── régua de idade: onde o deal está no ciclo histórico ────────────────────

export function AgeRuler({ age, meta, size = "sm" }: { age: number | null; meta: Meta; size?: "sm" | "lg" }) {
  const overflow = 40; // dias desenhados além do maior ciclo, a zona "sem histórico"
  const span = meta.max_cycle + overflow;
  const x = (a: number) => (Math.min(a, span - 2) / span) * 100;
  const h = size === "lg" ? 14 : 8;
  const label = age == null ? "não iniciado" : `${age} dias`;
  return (
    <div className={`ruler ruler-${size}`} aria-label={age == null ? "Deal não iniciado" : `Deal com ${age} dias em negociação`}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="0" width={x(meta.window_start)} height={h} className="z-avancar" />
        <rect x={x(meta.window_start)} y="0" width={x(meta.max_cycle) - x(meta.window_start)} height={h} className="z-fechar" />
        <rect x={x(meta.max_cycle)} y="0" width={100 - x(meta.max_cycle)} height={h} className="z-decidir" />
      </svg>
      {age != null && <span className="ruler-mark" style={{ left: `${x(age)}%` }} />}
      {size === "lg" ? (
        <div className="ruler-ticks">
          <span style={{ left: 0 }}>0</span>
          <span style={{ left: `${x(meta.window_start)}%` }}>{meta.window_start} dias: a janela abre</span>
          <span style={{ left: `${x(meta.max_cycle)}%` }}>{meta.max_cycle} dias: maior ciclo já visto</span>
        </div>
      ) : (
        <span className="ruler-label">{label}</span>
      )}
    </div>
  );
}

// ─── curva histórica: chance de ganhar e de fechar logo, por idade ──────────

const MIN_N = 30; // abaixo disso a curva é ruído de amostra pequena: não desenha

export function CurveChart({ curve, meta, age }: { curve: CurvePoint[]; meta: Meta; age?: number | null }) {
  const W = 900, H = 280, L = 44, B = 28, T = 10, R = 28;
  const x = (a: number) => L + (a / meta.max_cycle) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const line = (f: (c: CurvePoint) => number) =>
    curve.filter((c) => c.n >= MIN_N).map((c, i) => `${i ? "L" : "M"}${x(c.age).toFixed(1)},${y(f(c)).toFixed(1)}`).join("");
  const lastAge = curve.filter((c) => c.n >= MIN_N).at(-1)?.age ?? 0;
  const closeArea = `${line((c) => c.close_soon)}L${x(lastAge)},${y(0)}L${x(0)},${y(0)}Z`;
  const marker = age != null && age < meta.max_cycle ? curve[age] : null;
  return (
    <figure className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Chance de ganhar e de fechar em 30 dias conforme a idade do deal">
        <rect x={x(meta.window_start)} y={T} width={x(meta.max_cycle) - x(meta.window_start)} height={H - T - B} className="z-fechar" />
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} className="grid" />
            <text x={L - 6} y={y(p) + 4} textAnchor="end" className="axis">{pct(p)}</text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, meta.max_cycle].map((a) => (
          <text key={a} x={x(a)} y={H - 8} textAnchor="middle" className="axis">{a}d</text>
        ))}
        <path d={closeArea} className="area-close" />
        <path d={line((c) => c.win)} className="line-win" />
        <line x1={L} x2={W - R} y1={y(meta.base_rate)} y2={y(meta.base_rate)} className="line-base" />
        {marker && (
          <g>
            <line x1={x(marker.age)} x2={x(marker.age)} y1={T} y2={H - B} className="line-now" />
            <circle cx={x(marker.age)} cy={y(marker.win)} r="5" className="dot-now" />
          </g>
        )}
      </svg>
      <figcaption>
        <span className="key key-win">Chance de ganhar, para quem chegou a essa idade</span>
        <span className="key key-close">Chance de fechar nos próximos 30 dias</span>
        <span className="key key-base">Média geral ({pct(meta.base_rate)})</span>
      </figcaption>
    </figure>
  );
}

/** Um traço, um peso: o mesmo sistema de ícone para toda razão do score. */
function ReasonIcon({ kind }: { kind: Reason["kind"] }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const };
  if (kind === "+") return <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><line x1="7" y1="2.5" x2="7" y2="11.5" {...stroke} /><line x1="2.5" y1="7" x2="11.5" y2="7" {...stroke} /></svg>;
  if (kind === "-") return <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><line x1="2.5" y1="7" x2="11.5" y2="7" {...stroke} /></svg>;
  if (kind === "!") return <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><line x1="7" y1="3" x2="7" y2="8.2" {...stroke} /><circle cx="7" cy="10.8" r="0.9" fill="currentColor" stroke="none" /></svg>;
  return <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5.2" {...stroke} /><line x1="7" y1="6.3" x2="7" y2="9.8" {...stroke} /><circle cx="7" cy="4.1" r="0.9" fill="currentColor" stroke="none" /></svg>;
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="reasons">
      {reasons.map((r) => (
        <li key={r.text} className={`reason reason-${r.kind === "+" ? "up" : r.kind === "-" ? "down" : r.kind === "!" ? "warn" : "info"}`}>
          <span className="reason-icon"><ReasonIcon kind={r.kind} /></span>
          {r.text}
        </li>
      ))}
    </ul>
  );
}

export function DecisionButtons({ deal }: { deal: OpenDeal }) {
  const { decisions, decide } = useApp();
  const current = decisions[deal.id];
  if (current)
    return (
      <div className="decision done">
        Marcado como {current.kind}.
        <button className="btn-link" onClick={() => decide(deal.id, null)}>Desfazer</button>
      </div>
    );
  return (
    <div className="decision">
      <button className="btn" onClick={() => decide(deal.id, "requalificado")}>Requalifiquei</button>
      <button className="btn btn-quiet" onClick={() => decide(deal.id, "encerrado")}>Encerrar como perdido</button>
    </div>
  );
}

/** Linha compacta de deal usada em Meu Dia, Conta e Quadro. */
export function DealRow({ deal, detail, children }: { deal: OpenDeal; detail?: ReactNode; children?: ReactNode }) {
  const { model } = useApp();
  return (
    <li className="deal-row">
      <Score deal={deal} />
      <div className="deal-row-main">
        <a className="deal-row-title" href={link("deal", deal.id)}><DealName deal={deal} /></a>
        <div className="deal-row-sub">
          <span>{money(deal.price)}</span>
          <span>{deal.agent}</span>
          {detail && <span>{detail}</span>}
        </div>
        {children}
      </div>
      <AgeRuler age={deal.age} meta={model.meta} />
    </li>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
