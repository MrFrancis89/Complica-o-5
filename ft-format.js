// ft-format.js — v3.0
export function formatCurrency(n) {
    if (n == null || isNaN(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function formatPercent(n, isDecimal = false) {
    if (n == null || isNaN(n)) return '0,00%';
    const v = isDecimal ? n * 100 : n;
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
export function formatQtdUnid(qtd, unidade) {
    if (qtd == null) return '—';
    const f = qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return `${f} ${unidade}`;
}
export function formatNum(n, decimais = 2) {
    if (n == null || isNaN(n)) return '0';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: decimais, maximumFractionDigits: decimais });
}
export function parseNum(s) {
    if (s == null) return 0;
    const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function formatDataCurta(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
export const TAMANHO_LABEL = { P: 'P (25cm)', M: 'M (30cm)', G: 'G (35cm)', GG: 'GG (40cm)' };
export const UNIDADE_LABEL = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', uni: 'uni', pct: 'pct' };
export const PORCOES_PADRAO = { P: 6, M: 8, G: 10, GG: 12 };
