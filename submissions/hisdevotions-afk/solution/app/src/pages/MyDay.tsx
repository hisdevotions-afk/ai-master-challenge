import type { ReactNode } from "react";
import { BUCKETS, DealName, DealRow, DecisionButtons, Empty } from "../components";
import { PRIORITY, useApp, useScopedOpen } from "../data";
import { int, longDate, money, moneyShort, pct, plural, sum } from "../format";
import { link } from "../router";
import type { Bucket, OpenDeal } from "../types";

/** Ícone + número real + barra contra um total real — nada de "12% acima da meta" inventado. */
function StatCard({ icon, label, value, ratio, caption }: { icon: ReactNode; label: string; value: string; ratio: number; caption: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-icon">{icon}</span>
      </div>
      <p className="stat-card-value">{value}</p>
      <div className="stat-card-bar"><span style={{ width: `${Math.round(Math.min(ratio, 1) * 100)}%` }} /></div>
      <p className="stat-card-caption">{caption}</p>
    </div>
  );
}

/** Linha de zumbi: todo deal aqui tem score 0 e a régua sempre pregada no fim —
    mostrar as duas repetiria um número e um gráfico que não diferenciam nada.
    O que diferencia é o que o ORDER.decidir já usa pra ordenar: quanto cada deal
    infla o forecast, e há quanto tempo. */
function StalledRow({ deal }: { deal: OpenDeal }) {
  return (
    <li className="deal-row stalled-row">
      <span className="score score-sm on-decidir" title={`${deal.age} dias em negociação`}>{deal.age}</span>
      <div className="deal-row-main">
        <a className="deal-row-title" href={link("deal", deal.id)}><DealName deal={deal} /></a>
        <div className="deal-row-sub">
          <span>{deal.agent}</span>
          <span>parado além do histórico</span>
        </div>
        <DecisionButtons deal={deal} />
      </div>
      <span className="stalled-value">
        <strong>{money(deal.price)}</strong>
        <span>no forecast declarado</span>
      </span>
    </li>
  );
}

export function MyDay() {
  const { model, filters } = useApp();
  const open = useScopedOpen();
  const queue = (b: Bucket) => open.filter((d) => d.bucket === b).sort(PRIORITY[b]);
  const [fechar, decidir, avancar, prospectar] = (["fechar", "decidir", "avancar", "prospectar"] as Bucket[]).map(queue);
  const noAccount = open.filter((d) => !d.account).length;
  const declared = sum(open, (d) => d.price);
  const expected30 = sum(open, (d) => d.ev_soon);
  const monday = new Date(model.meta.reference_date + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() + 1);

  const who = filters.agent
    ? `Bom dia, ${filters.agent.split(" ")[0]}.`
    : filters.manager
      ? `Semana do time de ${filters.manager}`
      : filters.region
        ? `Semana da região ${filters.region}`
        : "Semana da empresa inteira";

  if (open.length === 0)
    return (
      <>
        <h1>{who}</h1>
        <Empty>
          Nenhum deal aberto neste recorte. {filters.agent && `${filters.agent} ainda não tem oportunidades registradas no CRM.`}
        </Empty>
      </>
    );

  return (
    <div className="myday">
      <header className="page-head">
        <h1>{who}</h1>
        <p className="lede">
          Semana de {longDate(monday.toISOString().slice(0, 10))}.{" "}
          {fechar.length > 0 ? (
            <>
              {plural(fechar.length, "deal está", "deals estão")} na janela de fechamento, com{" "}
              <strong>{moneyShort(sum(fechar, (d) => d.ev_soon))}</strong> de receita esperada nos próximos 30 dias. Comece por
              eles.{" "}
            </>
          ) : (
            <>Nenhum deal está na janela de fechamento. </>
          )}
          {decidir.length > 0 && (
            <>
              Outros {plural(decidir.length, "está parado", "estão parados")} além de qualquer ciclo já fechado e pedem uma
              decisão, não mais follow-up.
            </>
          )}
        </p>
      </header>

      <div className="stat-row">
        <StatCard
          icon={<svg viewBox="0 0 18 18" aria-hidden="true"><polyline points="2.5,13.5 7,8.5 10.5,11 15.5,4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><polyline points="11.5,4.5 15.5,4.5 15.5,8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          label="Receita esperada (30 dias)"
          value={moneyShort(expected30)}
          ratio={declared > 0 ? expected30 / declared : 0}
          caption={`${pct(declared > 0 ? expected30 / declared : 0)} do pipeline declarado (${moneyShort(declared)})`}
        />
        <StatCard
          icon={<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 3.5h13L10.2 9.8v5.2l-2.4 1v-6.2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          label="Na janela de fechamento"
          value={int(fechar.length)}
          ratio={open.length > 0 ? fechar.length / open.length : 0}
          caption={`${plural(fechar.length, "deal", "deals")} de ${int(open.length)} abertos no recorte`}
        />
        <StatCard
          icon={<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9 5.2V9l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          label="Aguardando decisão"
          value={int(decidir.length)}
          ratio={open.length > 0 ? decidir.length / open.length : 0}
          caption={`${pct(open.length > 0 ? decidir.length / open.length : 0)} do pipeline aberto, sem histórico comparável`}
        />
      </div>

      <section className="queue queue-fechar">
        <QueueHead bucket="fechar" title="Feche esta semana" count={fechar.length} />
        <ol className="deal-list">
          {fechar.slice(0, 6).map((d) => (
            <DealRow key={d.id} deal={d} />
          ))}
        </ol>
        {fechar.length === 0 && (
          <Empty>
            {avancar.length > 0
              ? "Nenhum deal na janela agora. Use a semana para avançar os mais novos."
              : "Nenhum deal vivo em negociação. A semana é de destravar o funil: engajar a prospecção e decidir os parados."}
          </Empty>
        )}
      </section>

      <section className="queue queue-decidir">
        <QueueHead bucket="decidir" title="Decida o destino" count={decidir.length} />
        <p className="queue-note">
          Nenhum deal da base fechou depois de {model.meta.max_cycle} dias. Confirme com o cliente: se ainda existe decisão,
          requalifique; se não, encerre e tire do forecast.
        </p>
        <ol className="deal-list">
          {decidir.slice(0, 4).map((d) => (
            <StalledRow key={d.id} deal={d} />
          ))}
        </ol>
      </section>

      <div className="queue-pair">
        <section className="queue queue-avancar">
          <QueueHead bucket="avancar" title="Mantenha em movimento" count={avancar.length} />
          <ol className="deal-list">
            {avancar.slice(0, 4).map((d) => (
              <DealRow key={d.id} deal={d} />
            ))}
          </ol>
          {avancar.length === 0 && <Empty>Nenhum deal novo em negociação.</Empty>}
        </section>
        <section className="queue queue-prospectar">
          <QueueHead bucket="prospectar" title="Engaje" count={prospectar.length} />
          <ol className="deal-list">
            {prospectar.slice(0, 4).map((d) => (
              <DealRow key={d.id} deal={d} />
            ))}
          </ol>
          {prospectar.length === 0 && <Empty>Nenhum deal em prospecção.</Empty>}
        </section>
      </div>

      {noAccount > 0 && (
        <aside className="hygiene">
          <p>
            <strong>{plural(noAccount, "deal aberto está", "deals abertos estão")} sem conta vinculada.</strong> Sem a conta, o
            deal não entra no histórico do cliente e o time perde contexto na próxima negociação.
          </p>
          <a className="btn" href={`${link("pipeline")}?semconta=1`}>Ver deals sem conta</a>
        </aside>
      )}
    </div>
  );
}

function QueueHead({ bucket, title, count }: { bucket: Bucket; title: string; count: number }) {
  return (
    <header className="queue-head">
      <h2>{title}</h2>
      <span className="queue-hint">{BUCKETS[bucket].hint}</span>
      {count > 0 && (
        <a className="queue-all" href={`${link("pipeline")}?fila=${bucket}`}>
          Ver {count === 1 ? "o deal" : `os ${int(count)}`}
        </a>
      )}
    </header>
  );
}
