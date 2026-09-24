import { AgeRuler, BUCKETS, BucketTag, CurveChart, DealName, DecisionButtons, Empty, ReasonList, Score } from "../components";
import { isOpen, useApp } from "../data";
import { money, pct, pValue, shortDate } from "../format";
import { link } from "../router";
import type { Deal, OpenDeal } from "../types";

export function DealPage({ id }: { id: string }) {
  const { model } = useApp();
  const deal = model.byId.get(id);
  if (!deal) return <Empty>Não encontrei o deal {id}. <a href={link("pipeline")}>Voltar para o pipeline</a></Empty>;
  return isOpen(deal) ? <OpenDealView deal={deal} /> : <ClosedDealView deal={deal} />;
}

function scoreSentence(score: number) {
  if (score >= 99) return "Está no topo do pipeline em receita esperada para os próximos 30 dias.";
  if (score === 0) return "Não tem receita esperada nos próximos 30 dias.";
  return `Está entre os ${100 - score}% do pipeline com mais receita esperada para os próximos 30 dias.`;
}

function OpenDealView({ deal }: { deal: OpenDeal }) {
  const { model } = useApp();
  const { meta } = model;
  const agent = model.agentByName.get(deal.agent);
  const history = deal.account ? model.deals.filter((d) => d.account === deal.account && (d.stage === "Won" || d.stage === "Lost")) : [];
  const won = history.filter((d) => d.stage === "Won").length;
  const vendorTest = model.significance.find((t) => t.feature === "Vendedor");

  return (
    <article className="deal-page">
      <a className="back" href={link("pipeline")}>Pipeline</a>
      <header className={`deal-head on-${deal.bucket}`}>
        <div>
          <h1 className="deal-name"><DealName deal={deal} /></h1>
          <p className="deal-meta">
            <BucketTag bucket={deal.bucket} /> {BUCKETS[deal.bucket].hint}. Oportunidade {deal.id}, com {deal.agent}.
          </p>
        </div>
        <div className="deal-score">
          <Score deal={deal} size="lg" />
          <p>{scoreSentence(deal.score)}</p>
        </div>
      </header>

      <section className={`action on-${deal.bucket}`}>
        <h2>O que fazer</h2>
        <p>{deal.action}</p>
        {deal.bucket === "decidir" && <DecisionButtons deal={deal} />}
      </section>

      <dl className="facts">
        <div><dt>Chance de ganhar</dt><dd>{deal.win_prob == null ? "sem histórico" : pct(deal.win_prob)}</dd>{deal.bucket === "prospectar" && <p>média de quem engajou</p>}</div>
        <div><dt>Chance de fechar em 30 dias</dt><dd>{deal.close_soon == null ? "sem histórico" : pct(deal.close_soon)}</dd></div>
        <div><dt>Receita esperada em 30 dias</dt><dd>{money(deal.ev_soon)}</dd></div>
        <div><dt>Valor de lista</dt><dd>{money(deal.price)}</dd></div>
        <div><dt>Em negociação desde</dt><dd>{deal.engage ? shortDate(deal.engage) : "ainda não engajado"}</dd></div>
      </dl>

      <section>
        <h2>Por que esse score</h2>
        <ReasonList reasons={deal.reasons} />
      </section>

      <section>
        <h2>Onde ele está no ciclo</h2>
        <AgeRuler age={deal.age} meta={meta} size="lg" />
        <CurveChart curve={model.curve} meta={meta} age={deal.age} />
      </section>

      <section className="context">
        <h2>Contexto que não entra no score</h2>
        <p className="queue-note">
          Vendedor, conta, produto e setor foram testados contra o acaso e não mudam a chance de ganhar nesta base.{" "}
          <a href={link("metodo")}>Ver os testes</a>
        </p>
        <ul>
          {agent && agent.win_rate != null && (
            <li>
              {agent.name} ganhou {pct(agent.win_rate)} de {agent.closed} deals fechados. A faixa plausível vai de{" "}
              {pct(agent.ci_low)} a {pct(agent.ci_high)}
              {agent.verdict === "dentro da média" ? ", então é estatisticamente igual à média do time" : `: ${agent.verdict}`}
              {vendorTest && ` (teste do time todo: p = ${pValue(vendorTest.p_value)})`}.
            </li>
          )}
          {deal.account ? (
            <li>
              <a href={link("contas", deal.account)}>{deal.account}</a>: {won} ganhos e {history.length - won} perdidos no
              histórico, com todos os vendedores.
            </li>
          ) : (
            <li>Sem conta vinculada: cadastre a empresa no CRM para este deal ter histórico de cliente.</li>
          )}
          <li>Produto {deal.product}, série {deal.series}.</li>
        </ul>
      </section>
    </article>
  );
}

function ClosedDealView({ deal }: { deal: Deal }) {
  return (
    <article className="deal-page">
      <a className="back" href={deal.account ? link("contas", deal.account) : link("pipeline")}>Voltar</a>
      <h1 className="deal-name"><DealName deal={deal} /></h1>
      <p className="lede">
        {deal.stage === "Won" ? "Ganho" : "Perdido"} em {shortDate(deal.close)}, depois de negociação iniciada em{" "}
        {shortDate(deal.engage)}. {deal.stage === "Won" && `Fechado por ${money(deal.close_value ?? 0)}.`} Vendedor: {deal.agent}.
      </p>
    </article>
  );
}
