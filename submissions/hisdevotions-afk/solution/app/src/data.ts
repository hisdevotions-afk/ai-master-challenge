import { createContext, useContext } from "react";
import type { Account, Agent, Bucket, Deal, OpenDeal, RawData } from "./types";

export interface Model extends RawData {
  open: OpenDeal[];
  byId: Map<string, Deal | OpenDeal>;
  agentByName: Map<string, Agent>;
  accountByName: Map<string, Account>;
}

export const isOpen = (d: Deal): d is OpenDeal => d.stage === "Prospecting" || d.stage === "Engaging";

let pending: Promise<Model> | null = null;

export function loadModel(): Promise<Model> {
  pending ??= fetch(`${import.meta.env.BASE_URL}data.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Não consegui carregar data.json (HTTP ${r.status}). Rode "python engine/scoring.py" e recarregue.`);
      return r.json() as Promise<RawData>;
    })
    .then((raw) => ({
      ...raw,
      open: raw.deals.filter(isOpen),
      byId: new Map(raw.deals.map((d) => [d.id, d])),
      agentByName: new Map(raw.agents.map((a) => [a.name, a])),
      accountByName: new Map(raw.accounts.map((a) => [a.account, a])),
    }));
  return pending;
}

// ─── filtros globais (região → manager → vendedor) ──────────────────────────

export interface Filters {
  region: string;
  manager: string;
  agent: string;
}

export const NO_FILTERS: Filters = { region: "", manager: "", agent: "" };

export const inScope = (x: { region: string; manager: string }, name: string, f: Filters) =>
  (!f.region || x.region === f.region) && (!f.manager || x.manager === f.manager) && (!f.agent || name === f.agent);

export const dealInScope = (d: Deal, f: Filters) => inScope(d, d.agent, f);

// ─── decisões do vendedor (requalificar/encerrar zumbi) ─────────────────────
// ponytail: localStorage por navegador; em produção isso gravaria de volta no CRM.

export type DecisionKind = "requalificado" | "encerrado";
export type Decisions = Record<string, { kind: DecisionKind; at: string; note?: string }>;

export const store = {
  read<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* modo privado / armazenamento bloqueado: segue sem persistir */
    }
  },
};

export interface AppState {
  model: Model;
  filters: Filters;
  setFilters: (f: Filters) => void;
  decisions: Decisions;
  decide: (id: string, kind: DecisionKind | null, note?: string) => void;
  importDecisions: (data: Decisions) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fora do AppContext");
  return ctx;
}

/** Deals abertos no escopo dos filtros, sem os que o vendedor já decidiu. */
export function useScopedOpen(): OpenDeal[] {
  const { model, filters, decisions } = useApp();
  return model.open.filter((d) => dealInScope(d, filters) && !decisions[d.id]);
}

// ─── ordem de prioridade dentro de cada fila (usada em Meu Dia e no Pipeline) ─
// Não é o score (chance): fechar/avançar priorizam receita esperada; decidir
// prioriza o que mais infla o forecast declarado; prospecção não tem score
// nem forecast (sem histórico de conversão), então prioriza pelo valor de lista.
export const PRIORITY: Record<Bucket, (a: OpenDeal, b: OpenDeal) => number> = {
  fechar: (a, b) => b.ev_soon - a.ev_soon,
  decidir: (a, b) => b.price - a.price,
  avancar: (a, b) => b.ev - a.ev,
  prospectar: (a, b) => b.price - a.price,
};
