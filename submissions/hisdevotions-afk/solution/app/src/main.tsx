import { Component, StrictMode, Suspense, use, useState, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AppContext, NO_FILTERS, loadModel, store, useApp, useScopedOpen, type Decisions, type DecisionKind, type Filters } from "./data";
import { link, useRoute } from "./router";
import { int, longDate, money, pct } from "./format";
import { BUCKETS } from "./components";
import { MyDay } from "./pages/MyDay";
import { Pipeline } from "./pages/Pipeline";
import { DealPage } from "./pages/DealPage";
import { Forecast } from "./pages/Forecast";
import { AccountPage, Accounts } from "./pages/Accounts";
import { Team } from "./pages/Team";
import { Method } from "./pages/Method";
import logoMark from "./assets/logo-mark.png";
import "./styles.css";

const NAV: [string, string][] = [
  ["", "Meu dia"],
  ["pipeline", "Pipeline"],
  ["forecast", "Forecast"],
  ["contas", "Contas"],
  ["time", "Time"],
  ["metodo", "Como o score funciona"],
];

/** Um traço, um peso: mesmo sistema de ícone das razões do score, agora para a navegação. */
function NavIcon({ slug }: { slug: string }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (slug === "") return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="3.2" {...s} /><line x1="9" y1="1.6" x2="9" y2="3.8" {...s} /><line x1="9" y1="14.2" x2="9" y2="16.4" {...s} /><line x1="1.6" y1="9" x2="3.8" y2="9" {...s} /><line x1="14.2" y1="9" x2="16.4" y2="9" {...s} /></svg>;
  if (slug === "pipeline") return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 3.5h13L10.2 9.8v5.2l-2.4 1v-6.2Z" {...s} /></svg>;
  if (slug === "forecast") return <svg viewBox="0 0 18 18" aria-hidden="true"><polyline points="2.5,14.5 6.8,9 10.5,11.2 15.5,4" {...s} /></svg>;
  if (slug === "contas") return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 7 L9 2 L16 7" {...s} /><rect x="3.5" y="7" width="11" height="8.5" {...s} /></svg>;
  if (slug === "time") return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="6.5" cy="7" r="2.4" {...s} /><circle cx="12.2" cy="7.6" r="2" {...s} /><path d="M1.8 16 a4.7 4.7 0 0 1 9.4 0" {...s} /><path d="M8.6 16 a4.3 4 0 0 1 7.6 -1.4" {...s} /></svg>;
  return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" {...s} /><line x1="9" y1="8.3" x2="9" y2="13" {...s} /><circle cx="9" cy="5.3" r="0.9" fill="currentColor" stroke="none" /></svg>;
}

/** CSV do recorte atual (região/manager/vendedor): a ação que um SaaS de vendas de verdade oferece. */
function csvEscape(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportPipelineCsv(deals: import("./types").OpenDeal[]) {
  const header = ["Conta", "Produto", "Vendedor", "Fila", "Score", "Idade (dias)", "Chance de ganhar", "Receita esperada 30 dias", "Valor de lista"];
  const rows = deals.map((d) => [
    d.account ?? "Sem conta vinculada",
    d.product,
    d.agent,
    BUCKETS[d.bucket].label,
    String(d.score),
    d.age == null ? "não iniciado" : String(d.age),
    d.win_prob == null ? "sem histórico" : pct(d.win_prob),
    money(d.ev_soon),
    money(d.price),
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pipeline-g4-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Loaded() {
  const model = use(loadModel());
  const [filters, setFiltersState] = useState<Filters>(() => store.read("filters", NO_FILTERS));
  const [decisions, setDecisions] = useState<Decisions>(() => store.read("decisions", {}));
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    store.write("filters", f);
  };
  const decide = (id: string, kind: DecisionKind | null) =>
    setDecisions((prev) => {
      const next = { ...prev };
      if (kind) next[id] = { kind, at: new Date().toISOString() };
      else delete next[id];
      store.write("decisions", next);
      return next;
    });
  return (
    <AppContext value={{ model, filters, setFilters, decisions, decide }}>
      <Shell />
    </AppContext>
  );
}

function BrandMark() {
  return <img className="brand-mark" src={logoMark} alt="" width={32} height={32} />;
}

/** Iniciais para o indicador de escopo (vendedor, manager ou região — todos vêm do dataset). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts.at(-1)![0]).toUpperCase();
}

function Topbar() {
  const scoped = useScopedOpen();
  const decidir = scoped.filter((d) => d.bucket === "decidir").length;
  const [q, setQ] = useState("");

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) window.location.hash = `${link("pipeline")}?busca=${encodeURIComponent(q.trim())}`;
  };

  return (
    <header className="topbar">
      <a className="brand" href="#/">
        <BrandMark />
        <span className="brand-word">G4</span>
      </a>
      <span className="topbar-product">Pipeline em Foco</span>
      <form className="topbar-search" onSubmit={search} role="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><line x1="15.3" y1="15.3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <input type="search" placeholder="Buscar conta, produto ou vendedor" aria-label="Busca global" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <a className="topbar-alert" href={`${link("pipeline")}?fila=decidir`} title={`${int(decidir)} deals aguardando decisão`}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        {decidir > 0 && <span className="topbar-alert-count">{decidir > 99 ? "99+" : int(decidir)}</span>}
        <span className="sr-only">{int(decidir)} deals aguardando decisão</span>
      </a>
      <button className="topbar-export" onClick={() => exportPipelineCsv(scoped)} title="Exportar o recorte atual em CSV">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.5v8.2M5.6 7.4 9 10.8l3.4-3.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M2.5 13v1.8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <span>Exportar</span>
      </button>
    </header>
  );
}

function Shell() {
  const { model, filters } = useApp();
  const { parts, query } = useRoute();
  const [page = "", arg] = parts;
  const scope = filters.agent || filters.manager || filters.region || "Toda a equipe";
  return (
    <div className="shell">
      <Topbar />
      <aside className="nav">
        <p className="nav-section">Workspace</p>
        <nav aria-label="Seções">
          {NAV.map(([slug, label]) => (
            <a key={slug} href={link(slug)} aria-current={page === slug || (slug === "pipeline" && page === "deal") ? "page" : undefined}>
              <NavIcon slug={slug} />
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-foot">
          <div className="nav-operator" title={scope} aria-label={`Escopo: ${scope}`}>
            <span className="nav-operator-avatar">{scope === "Toda a equipe" ? "G4" : initialsOf(scope)}</span>
            <span className="nav-operator-name">{scope}</span>
          </div>
          <p className="nav-foot-date">Dados até {longDate(model.meta.reference_date)}</p>
        </div>
      </aside>
      <div className="main">
        <FilterBar />
        <main>
          {page === "" && <MyDay />}
          {page === "pipeline" && <Pipeline query={query} />}
          {page === "deal" && <DealPage id={arg} />}
          {page === "forecast" && <Forecast query={query} />}
          {page === "contas" && (arg ? <AccountPage name={arg} /> : <Accounts />)}
          {page === "time" && <Team />}
          {page === "metodo" && <Method />}
          {!NAV.some(([slug]) => slug === page) && page !== "deal" && (
            <p className="empty">Essa página não existe. <a href="#/">Voltar para Meu dia</a></p>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterBar() {
  const { model, filters, setFilters } = useApp();
  const regions = [...new Set(model.agents.map((a) => a.region))].sort();
  const managers = [...new Set(model.agents.filter((a) => !filters.region || a.region === filters.region).map((a) => a.manager))].sort();
  const agents = model.agents
    .filter((a) => (!filters.region || a.region === filters.region) && (!filters.manager || a.manager === filters.manager))
    .map((a) => a.name)
    .sort();
  const active = filters.region || filters.manager || filters.agent;
  return (
    <div className="filters" role="search">
      <label>
        Região
        <select value={filters.region} onChange={(e) => setFilters({ region: e.target.value, manager: "", agent: "" })}>
          <option value="">Todas</option>
          {regions.map((r) => <option key={r}>{r}</option>)}
        </select>
      </label>
      <label>
        Manager
        <select value={filters.manager} onChange={(e) => setFilters({ ...filters, manager: e.target.value, agent: "" })}>
          <option value="">Todos</option>
          {managers.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label>
        Vendedor
        <select value={filters.agent} onChange={(e) => setFilters({ ...filters, agent: e.target.value })}>
          <option value="">Todos</option>
          {agents.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      {active && (
        <button className="btn-link" onClick={() => setFilters(NO_FILTERS)}>Limpar filtros</button>
      )}
    </div>
  );
}

class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p className="empty boot">{this.state.error.message}</p> : this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadError>
      <Suspense fallback={<p className="boot">Carregando o pipeline…</p>}>
        <Loaded />
      </Suspense>
    </LoadError>
  </StrictMode>,
);
