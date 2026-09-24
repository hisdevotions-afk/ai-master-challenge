import { inScope, useApp, useScopedOpen } from "../data";
import { int, pct } from "../format";
import type { Agent } from "../types";

export function Team() {
  const { model, filters } = useApp();
  const open = useScopedOpen();
  const agents = model.agents.filter((a) => inScope(a, a.name, filters)).sort((a, b) => a.name.localeCompare(b.name));
  const count = (name: string, pred: (d: (typeof open)[number]) => boolean) =>
    open.filter((d) => d.agent === name && pred(d)).length;

  return (
    <div>
      <header className="page-head">
        <h1>Time</h1>
        <p className="lede">
          Com os dados de hoje, nenhum vendedor ganha mais ou menos que a média de um jeito que valha ranquear. Por isso esta
          tela não é um ranking: ela mostra o que cada pessoa pode arrumar no próprio pipeline.
        </p>
      </header>
      <div className="table-wrap">
        <table className="deals team">
          <thead>
            <tr>
              <th scope="col">Vendedor</th>
              <th scope="col">Taxa de ganho e faixa plausível</th>
              <th scope="col" className="num">Na janela</th>
              <th scope="col" className="num">Parados além do histórico</th>
              <th scope="col" className="num">Sem conta</th>
              <th scope="col" className="num">Abertos</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.name}>
                <th scope="row">
                  {a.name}
                  <span className="muted block">{a.manager}, {a.region}</span>
                </th>
                <td><RateBar agent={a} base={model.meta.base_rate} /></td>
                <td className="num">{int(count(a.name, (d) => d.bucket === "fechar"))}</td>
                <td className="num">{int(count(a.name, (d) => d.bucket === "decidir"))}</td>
                <td className="num">{int(count(a.name, (d) => !d.account))}</td>
                <td className="num">{int(count(a.name, () => true))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="queue-note">
        A faixa plausível mostra onde a taxa de ganho de cada um pode realmente estar, não só o que já aconteceu. Poucos deals
        fechados alargam a faixa — é por isso que ninguém aqui está marcado como acima ou abaixo do time.
      </p>
    </div>
  );
}

function RateBar({ agent, base }: { agent: Agent; base: number }) {
  if (agent.win_rate == null) return <span className="muted">Sem deals fechados</span>;
  const x = (p: number) => `${((p - 0.3) / 0.6) * 100}%`; // eixo de 30% a 90%
  return (
    <div className="ratebar" aria-label={`${pct(agent.win_rate)}, faixa de ${pct(agent.ci_low)} a ${pct(agent.ci_high)}`}>
      <span className="ratebar-track">
        <span className="ratebar-range" style={{ left: x(agent.ci_low), right: `calc(100% - ${x(agent.ci_high)})` }} />
        <span className="ratebar-base" style={{ left: x(base) }} />
        <span className="ratebar-dot" style={{ left: x(agent.win_rate) }} />
      </span>
      <span className="ratebar-label">{pct(agent.win_rate)} de {agent.closed}</span>
    </div>
  );
}
