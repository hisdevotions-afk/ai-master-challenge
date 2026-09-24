import { Component, StrictMode, Suspense, use, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AppContext, NO_FILTERS, loadModel, store, useApp, type Decisions, type DecisionKind, type Filters } from "./data";
import { link, useRoute } from "./router";
import { longDate } from "./format";
import { MyDay } from "./pages/MyDay";
import { Pipeline } from "./pages/Pipeline";
import { DealPage } from "./pages/DealPage";
import { Forecast } from "./pages/Forecast";
import { AccountPage, Accounts } from "./pages/Accounts";
import { Team } from "./pages/Team";
import { Method } from "./pages/Method";
import "./styles.css";

const NAV: [string, string][] = [
  ["", "Meu dia"],
  ["pipeline", "Pipeline"],
  ["forecast", "Forecast"],
  ["contas", "Contas"],
  ["time", "Time"],
  ["metodo", "Como o score funciona"],
];

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

function Shell() {
  const { model } = useApp();
  const { parts, query } = useRoute();
  const [page = "", arg] = parts;
  return (
    <div className="shell">
      <aside className="nav">
        <a className="brand" href="#/">Pipeline em Foco</a>
        <nav aria-label="Seções">
          {NAV.map(([slug, label]) => (
            <a key={slug} href={link(slug)} aria-current={page === slug || (slug === "pipeline" && page === "deal") ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <p className="nav-foot">Dados até {longDate(model.meta.reference_date)}</p>
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
