import { BUCKETS, DealRow, DecisionButtons, Empty } from "../components";
import { useApp, useScopedOpen } from "../data";
import { int, longDate, moneyShort, pct, plural, sum } from "../format";
import { link } from "../router";
import type { Bucket, OpenDeal } from "../types";

const ORDER: Record<Bucket, (a: OpenDeal, b: OpenDeal) => number> = {
  fechar: (a, b) => b.ev_soon - a.ev_soon,
  decidir: (a, b) => b.price - a.price,       // zumbi: o que mais infla o forecast primeiro
  avancar: (a, b) => b.ev - a.ev,
  prospectar: (a, b) => b.ev_soon - a.ev_soon,
};

export function MyDay() {
  const { model, filters } = useApp();
  const open = useScopedOpen();
  const queue = (b: Bucket) => open.filter((d) => d.bucket === b).sort(ORDER[b]);
  const [fechar, decidir, avancar, prospectar] = (["fechar", "decidir", "avancar", "prospectar"] as Bucket[]).map(queue);
  const noAccount = open.filter((d) => !d.account).length;
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
        <p className="kicker">{longDate(monday.toISOString().slice(0, 10))}</p>
        <h1>{who}</h1>
        <p className="lede">
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

      <section className="queue queue-fechar">
        <QueueHead bucket="fechar" title="Feche esta semana" count={fechar.length} />
        <ol className="deal-list">
          {fechar.slice(0, 6).map((d) => (
            <DealRow key={d.id} deal={d} detail={`${pct(d.close_soon)} fecham em 30 dias`} />
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
            <DealRow key={d.id} deal={d} detail="parado além do histórico">
              <DecisionButtons deal={d} />
            </DealRow>
          ))}
        </ol>
      </section>

      <div className="queue-pair">
        <section className="queue queue-avancar">
          <QueueHead bucket="avancar" title="Mantenha em movimento" count={avancar.length} />
          <ol className="deal-list">
            {avancar.slice(0, 4).map((d) => (
              <DealRow key={d.id} deal={d} detail={`janela em ~${model.meta.window_start - (d.age ?? 0)} dias`} />
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
