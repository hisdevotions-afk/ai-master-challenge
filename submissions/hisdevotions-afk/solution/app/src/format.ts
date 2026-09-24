const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat("pt-BR");
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const money = (v: number) => moneyFmt.format(v);
export const moneyShort = (v: number) => (Math.abs(v) >= 10_000 ? compactFmt.format(v) : moneyFmt.format(v));
export const pct = (p: number | null | undefined) => (p == null ? "—" : pctFmt.format(p));
export const pValue = (p: number) => (p < 0.001 ? "< 0,001" : p.toFixed(2).replace(".", ","));
export const int = (v: number) => intFmt.format(v);
export const longDate = (iso: string) => dateFmt.format(new Date(iso + "T00:00:00Z"));
export const shortDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
export const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;
export const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((acc, x) => acc + f(x), 0);
