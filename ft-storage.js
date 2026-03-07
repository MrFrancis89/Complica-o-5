// ft/utils/storage.js — Ficha Técnica v1.2
// ══════════════════════════════════════════════════════════════════
// CORREÇÃO v1.2
// ══════════════════════════════════════════════════════════════════
// BUG #2 — 'preparos' ausente na sincronização com Firebase
//   PROBLEMA : O cabeçalho da v1.1 prometia que 'preparos' havia sido
//              adicionado à lista de coleções sincronizadas, mas a função
//              sincronizarLocalParaFirebase() ainda iterava apenas sobre
//              ['ingredientes', 'receitas']. Dados de Preparo Antecipado
//              nunca eram enviados ao Firebase.
//   CORREÇÃO : 'preparos' adicionado ao array na linha 109.
// ══════════════════════════════════════════════════════════════════
// Sempre escreve no localStorage para garantir acesso offline.

import { fbSave, fbLoad, fbDelete, fbGetUid, fbIsAvailable } from './ft-firebase.js';

const LS_PREFIX = 'ft_';

// ── Helpers localStorage ──────────────────────────────────────────

function lsKey(colecao) { return LS_PREFIX + colecao; }

function lsGetAll(colecao) {
    try { return JSON.parse(localStorage.getItem(lsKey(colecao)) || '{}'); }
    catch { return {}; }
}

function lsSetAll(colecao, dados) {
    try { localStorage.setItem(lsKey(colecao), JSON.stringify(dados)); } catch(e) {
        console.warn('[storage] localStorage cheio:', e);
    }
}

// ── API pública ───────────────────────────────────────────────────

/**
 * Salva um documento.
 * @param {string} colecao  'ingredientes' | 'receitas' | 'preparos' | 'configuracoes'
 * @param {string} id       ID do documento
 * @param {object} dados    Dados a salvar
 */
export async function salvar(colecao, id, dados) {
    const item = { ...dados, id };

    // 1. Sempre salva localmente (cache offline)
    const local = lsGetAll(colecao);
    local[id] = item;
    lsSetAll(colecao, local);

    // 2. Tenta Firebase
    if (fbIsAvailable()) {
        try { await fbSave(colecao, id, item); }
        catch(e) { console.warn(`[storage] Firebase save falhou (${colecao}/${id}):`, e); }
    }
}

/**
 * Carrega todos os documentos de uma coleção.
 * Preferência: Firebase → merge com localStorage → só localStorage.
 * @returns {Promise<object[]>}
 */
export async function carregar(colecao) {
    if (fbIsAvailable()) {
        try {
            const fbDados = await fbLoad(colecao);
            // Sincroniza Firebase → localStorage
            const mapa = {};
            fbDados.forEach(d => { mapa[d.id] = d; });
            lsSetAll(colecao, mapa);
            return fbDados;
        } catch(e) {
            console.warn(`[storage] Firebase load falhou (${colecao}), usando localStorage:`, e);
        }
    }
    return Object.values(lsGetAll(colecao));
}

/**
 * Remove um documento.
 */
export async function remover(colecao, id) {
    const local = lsGetAll(colecao);
    delete local[id];
    lsSetAll(colecao, local);

    if (fbIsAvailable()) {
        try { await fbDelete(colecao, id); }
        catch(e) { console.warn(`[storage] Firebase delete falhou (${colecao}/${id}):`, e); }
    }
}

/**
 * Salva/carrega configurações simples (objeto único).
 */
export async function salvarConfig(dados) {
    try { localStorage.setItem(LS_PREFIX + 'config', JSON.stringify(dados)); } catch {}
    if (fbIsAvailable()) {
        try { await fbSave('configuracoes', 'default', dados); } catch {}
    }
}

export async function carregarConfig() {
    if (fbIsAvailable()) {
        try {
            const lista = await fbLoad('configuracoes');
            const cfg = lista.find(d => d.id === 'default');
            if (cfg) return cfg;
        } catch {}
    }
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + 'config') || 'null'); }
    catch { return null; }
}

/**
 * Push dos dados locais para o Firebase (chamado após login/sync).
 *
 * BUG FIX v1.2: 'preparos' adicionado ao array — antes ausente apesar de
 * prometido no cabeçalho da v1.1. Dados de Preparo Antecipado agora
 * são incluídos na sincronização.
 */
export async function sincronizarLocalParaFirebase() {
    if (!fbIsAvailable()) return;
    for (const colecao of ['ingredientes', 'receitas', 'preparos']) {
        const local = lsGetAll(colecao);
        for (const [id, item] of Object.entries(local)) {
            try { await fbSave(colecao, id, item); }
            catch(e) { console.warn('[storage] sync falhou:', e); }
        }
    }
}
