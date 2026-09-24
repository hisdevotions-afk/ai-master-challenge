import { BUCKETS, BUCKET_ORDER, Empty } from "../components";
import { useScopedOpen } from "../data";
import { int, money, moneyShort, pct, sum } from "../format";
import { link } from "../router";
import type { Bucket, OpenDeal } from "../types";

const GROUPS = { region: "Região", manager: "Manager", agent: "Vendedor" } as const;
type GroupKey = keyof typeof GROUPS;

// O equivalente no Salesforce, onde a categoria é escolhida pelo vendedor.
const SALESFORCE: Record<Bucket, string> = {
  fechar: "Commit",
  avancar: "Best case",
  prospectar: "Pipeline",
  decidir: "Omitted",
};

export function Forecast({ query }: { query: URLSearchParams }) {
  const open = useScopedOpen();
  const by = (query.get("por") as GroupKey) in GROUPS ? (query.get("por") as GroupKey) : "region";
  if (open.length === 0) return <Empty>Nenhum deal aberto neste recorte.</Empty>;

  // Prospecção fica fora do esperado: não há histórico de quantos prospects chegam a engajar.
  const engaged = (ds: OpenDeal[]) => ds.filter((d) => d.stage === "Engaging");
  const declared = sum(open, (d) => d.price);
  const realistic = sum(engaged(open), (d) => d.ev);
  const next30 = sum(engaged(open), (d) => d.ev_soon);
  const zombie = sum(open.filter((d) => d.bucket === "decidir"), (d) => d.price);
  const prospect = sum(open.filter((d) => d.bucket === "prospectar"), (d) => d.price);

  const groups = new Map<string, OpenDeal[]>();
  for (const d of open) groups.set(d[by], [...(groups.get(d[by]) ?? []), d]);
  const rows = [...groups.entries()].sort((a, b) => sum(engaged(b[1]), (d) => d.ev) - sum(engaged(a[1]), (d) => d.ev));
  // Grupo com pipeline mas nada vivo em negociação: o problema não é fechar, é o funil travado.
  const stalled = rows.filter(([, ds]) => !ds.some((d) => d.bucket === "fechar" || d.bucket === "avancar"));

  return (
    <div>
      <header className="page-head">
        <h1>Forecast honesto</h1>
        <p className="lede">
          O pipeline declarado soma <strong>{moneyShort(declared)}</strong>. Descontando a chance real de cada deal e tirando o que
          está parado além de qualquer ciclo já fechado, o esperado dos deals em negociação é{" "}
          <strong>{moneyShort(realistic)}</strong>. {pct(zombie / declared)} do valor declarado está em deals que o histórico
          nunca viu fechar.
        </p>
      </header>

      <dl className="facts facts-big">
        <div><dt>Pipeline declarado</dt><dd>{moneyShort(declared)}</dd><p>Soma do preço de lista de todos os deals abertos.</p></div>
        <div><dt>Esperado</dt><dd>{moneyShort(realistic)}</dd><p>Deals em negociação vezes a chance de ganhar pela idade. Zumbis valem zero; prospecção ({moneyShort(prospect)}) fica de fora por não ter histórico de conversão.</p></div>
        <div><dt>Próximos 30 dias</dt><dd>{moneyShort(next30)}</dd><p>Receita que o histórico espera ver entrar no mês.</p></div>
      </dl>

      {stalled.length > 0 && (
        <aside className="hygiene">
          <p>
            <strong>
              {stalled.map(([name]) => name).join(", ")}: nenhum deal vivo em negociação.
            </strong>{" "}
            Tudo o que está aberto ali ou ainda não engajou ou já passou de qualquer ciclo fechado. O problema não é fechar, é
            destravar o funil: engajar a prospecção e decidir os parados.
          </p>
        </aside>
      )}

      <section>
        <h2>De onde vem o valor declarado</h2>
        <div className="stack" role="img" aria-label="Valor declarado por fila">
          {BUCKET_ORDER.map((b) => {
            const v = sum(open.filter((d) => d.bucket === b), (d) => d.price);
            return v > 0 ? <span key={b} className={`stack-${b}`} style={{ flexGrow: v }} /> : null;
          })}
        </div>
        <ul className="stack-legend">
          {BUCKET_ORDER.map((b) => {
            const ds = open.filter((d) => d.bucket === b);
            return (
              <li key={b} className={`legend-${b}`}>
                <a href={`${link("pipeline")}?fila=${b}`}>{BUCKETS[b].label}</a>: {moneyShort(sum(ds, (d) => d.price))} em {int(ds.length)} deals.
                <span className="muted"> No Salesforce seria “{SALESFORCE[b]}”, escolhido pelo vendedor; aqui vem da idade do deal.</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="section-head">
          <h2>Por {GROUPS[by].toLowerCase()}</h2>
          <nav className="tabs" aria-label="Agrupar por">
            {(Object.keys(GROUPS) as GroupKey[]).map((k) => (
              <a key={k} href={`${link("forecast")}?por=${k}`} aria-current={k === by ? "page" : undefined}>{GROUPS[k]}</a>
            ))}
          </nav>
        </div>
        <div className="table-wrap">
          <table className="deals">
            <thead>
              <tr>
                <th scope="col">{GROUPS[by]}</th>
                <th scope="col" className="num">Declarado</th>
                <th scope="col" className="num">Esperado</th>
                <th scope="col" className="num">Próximos 30 dias</th>
                <th scope="col" className="num">Na janela</th>
                <th scope="col" className="num">Declarado parado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, ds]) => {
                const dec = sum(ds, (d) => d.price);
                return (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td className="num">{money(dec)}</td>
                    <td className="num">{money(sum(engaged(ds), (d) => d.ev))}</td>
                    <td className="num">{money(sum(engaged(ds), (d) => d.ev_soon))}</td>
                    <td className="num">{int(ds.filter((d) => d.bucket === "fechar").length)}</td>
                    <td className="num">{pct(sum(ds.filter((d) => d.bucket === "decidir"), (d) => d.price) / dec)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
