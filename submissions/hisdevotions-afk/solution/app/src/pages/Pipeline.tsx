import { useState } from "react";
import { AgeRuler, BUCKETS, BUCKET_ORDER, DealName, Empty, Score } from "../components";
import { PRIORITY, dealInScope, useApp, useScopedOpen } from "../data";
import { int, money, pct, plural } from "../format";
import { link } from "../router";
import type { Bucket, OpenDeal } from "../types";

type SortKey = "score" | "age" | "win_prob" | "ev_soon" | "price" | "agent";

const COLUMNS: [SortKey, string][] = [
  ["score", "Chance (30d)"],
  ["agent", "Vendedor"],
  ["age", "Idade"],
  ["win_prob", "Chance de ganhar"],
  ["ev_soon", "Receita em 30 dias"],
  ["price", "Valor"],
];

const PAGE = 100;

export function Pipeline({ query }: { query: URLSearchParams }) {
  const { model, decisions, filters } = useApp();
  const scoped = useScopedOpen();
  const fila = query.get("fila") as Bucket | null;
  const semConta = query.get("semconta") === "1";
  const board = query.get("ver") === "quadro";
  const [search, setSearch] = useState(() => query.get("busca") ?? "");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [limit, setLimit] = useState(PAGE);

  const href = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(changes)) v ? q.set(k, v) : q.delete(k);
    const s = q.toString();
    return link("pipeline") + (s ? `?${s}` : "");
  };

  const needle = search.trim().toLowerCase();
  const visible = scoped.filter(
    (d) =>
      (!fila || d.bucket === fila) &&
      (!semConta || !d.account) &&
      (!needle || [d.account, d.product, d.agent, d.id].some((v) => v?.toLowerCase().includes(needle))),
  );
  const decidedCount = model.open.filter((d) => decisions[d.id] && dealInScope(d, filters)).length;

  return (
    <div>
      <header className="page-head">
        <h1>Pipeline</h1>
        <p className="lede">
          {int(visible.length)} de {int(scoped.length)} deals abertos no seu recorte.
          {decidedCount > 0 && ` ${plural(decidedCount, "deal já decidido fica", "deals já decididos ficam")} fora desta lista.`}
        </p>
      </header>

      <div className="toolbar">
        <nav className="tabs" aria-label="Filas">
          <a href={href({ fila: null })} aria-current={!fila ? "page" : undefined}>Todas</a>
          {BUCKET_ORDER.map((b) => (
            <a key={b} href={href({ fila: b })} aria-current={fila === b ? "page" : undefined} className={`tab-${b}`}>
              {BUCKETS[b].label} <span className="count">{int(scoped.filter((d) => d.bucket === b).length)}</span>
            </a>
          ))}
        </nav>
        <input
          type="search"
          placeholder="Buscar conta, produto ou vendedor"
          aria-label="Buscar deals"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <a className="btn-link" href={href({ semconta: semConta ? null : "1" })}>
          {semConta ? "Mostrar todos" : "Só sem conta"}
        </a>
        <a className="btn-link" href={href({ ver: board ? null : "quadro" })}>
          {board ? "Ver em lista" : "Ver em quadro"}
        </a>
      </div>

      {visible.length === 0 ? (
        <Empty>Nenhum deal com esses filtros. Limpe a busca ou troque de fila.</Empty>
      ) : board ? (
        <Board deals={visible} />
      ) : (
        <DealTable deals={visible} sort={sort} setSort={setSort} limit={limit} setLimit={setLimit} />
      )}
    </div>
  );
}

function sortValue(d: OpenDeal, key: SortKey): number | string {
  if (key === "agent") return d.agent;
  if (key === "age") return d.age ?? -1;
  if (key === "win_prob") return d.win_prob ?? -1;
  if (key === "score") return d.score ?? -1;
  return d[key];
}

function DealTable(props: {
  deals: OpenDeal[];
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  limit: number;
  setLimit: (n: number) => void;
}) {
  const { model } = useApp();
  const { sort } = props;
  const rows = [...props.deals].sort((a, b) => {
    const va = sortValue(a, sort.key), vb = sortValue(b, sort.key);
    return (va < vb ? -1 : va > vb ? 1 : b.ev_soon - a.ev_soon) * sort.dir;
  });
  return (
    <>
      <div className="table-wrap">
        <table className="deals">
          <thead>
            <tr>
              <th scope="col">Deal</th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  <button onClick={() => props.setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : -1 })}>
                    {label}
                  </button>
                </th>
              ))}
              <th scope="col">Próxima ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, props.limit).map((d) => (
              <tr key={d.id} className={`row-${d.bucket}`}>
                <td>
                  <a href={link("deal", d.id)} className="cell-deal"><DealName deal={d} /></a>
                </td>
                <td><Score deal={d} /></td>
                <td>{d.agent}</td>
                <td className="cell-ruler"><AgeRuler age={d.age} meta={model.meta} /></td>
                <td className="num">{pct(d.win_prob)}</td>
                <td className="num">{money(d.ev_soon)}</td>
                <td className="num">{money(d.price)}</td>
                <td className="cell-action">
                  <a href={link("deal", d.id)} title={d.action}>
                    <span>{d.action}</span>
                    <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M4 10 10 4M10 4H5.5M10 4v4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > props.limit && (
        <button className="btn more" onClick={() => props.setLimit(props.limit + PAGE)}>
          Mostrar mais {Math.min(PAGE, rows.length - props.limit)} de {int(rows.length - props.limit)} restantes
        </button>
      )}
    </>
  );
}

const BOARD_LIMIT = 30;

function Board({ deals }: { deals: OpenDeal[] }) {
  const { model } = useApp();
  return (
    <div className="board">
      {BUCKET_ORDER.map((b) => {
        const col = deals.filter((d) => d.bucket === b).sort(PRIORITY[b]);
        return (
          <section key={b} className={`board-col col-${b}`}>
            <h2>
              {BUCKETS[b].label} <span className="count">{int(col.length)}</span>
            </h2>
            <p className="queue-hint">{BUCKETS[b].hint}</p>
            {col.slice(0, BOARD_LIMIT).map((d) => (
              <a key={d.id} className="card" href={link("deal", d.id)}>
                <span className="card-top">
                  <span className="card-name"><DealName deal={d} /></span>
                  <Score deal={d} />
                </span>
                <AgeRuler age={d.age} meta={model.meta} />
                <span className="card-sub">{money(d.price)}, {d.agent}</span>
              </a>
            ))}
            {col.length > BOARD_LIMIT && (
              <a className="btn-link" href={`${link("pipeline")}?fila=${b}`}>Ver todos os {int(col.length)} em lista</a>
            )}
          </section>
        );
      })}
    </div>
  );
}
