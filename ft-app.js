// ft-app.js — v3.0
// Feat: sincronização de tema com StockFlow via localStorage 'temaEstoque'
import { initFirebase, fbIsAvailable }              from './ft-firebase.js';
import { sincronizarLocalParaFirebase }              from './ft-storage.js';
import { initModalOverlay, setLoading, toast, debounce } from './ft-ui.js';
import { initIngredientes, renderIngredientes, abrirFormIngrediente } from './ft-ingredientes.js';
import { initReceitas,     renderReceitas,     abrirFormReceita     } from './ft-receitas.js';
import { initSimulador,    renderSimulador                          } from './ft-custos.js';
import { renderDashboard                                             } from './ft-dashboard.js';
import { renderExportacao                                            } from './ft-exportacao.js';
import { initPreparo,      renderPreparo,      abrirFormPreparo      } from './ft-preparo.js';
import { ico }                                                         from './ft-icons.js';

let _aba = 'ing';

// ── Tema — sincroniza com StockFlow via localStorage 'temaEstoque' ──
const TEMA_CSS = {
    escuro:   [],
    midnight: ['theme-midnight'],
    arctic:   ['theme-arctic', 'light-mode'],
    forest:   ['theme-forest'],
};

function _aplicarTema(tema) {
    const body = document.body;
    // Remove todas as classes de tema anteriores
    ['theme-midnight', 'theme-arctic', 'theme-forest', 'light-mode']
        .forEach(c => body.classList.remove(c));
    // Aplica as classes do tema atual
    (TEMA_CSS[tema] || []).forEach(c => body.classList.add(c));
}

function _lerTema() {
    return localStorage.getItem('temaEstoque') || 'escuro';
}

function _initTema() {
    _aplicarTema(_lerTema());
    // Escuta mudanças de tema do StockFlow (mesmo localStorage, evento storage dispara em iframes)
    window.addEventListener('storage', e => {
        if (e.key === 'temaEstoque') _aplicarTema(e.newValue || 'escuro');
    });
    // Fallback para quando a FT está em iframe e o pai está na mesma origem
    // O pai pode despachar um CustomEvent no window para notificar a FT
    window.addEventListener('ft-tema', e => {
        if (e.detail?.tema) _aplicarTema(e.detail.tema);
    });
}

// ── Boot ──────────────────────────────────────────────────────────
async function init() {
    setLoading(true);
    _initTema();
    const app = document.getElementById('ft-app');

    try {
        const fbOk = await Promise.race([
            initFirebase(),
            new Promise(r => setTimeout(() => r(false), 4000)),
        ]);
        if (fbOk) {
            await sincronizarLocalParaFirebase();
            _setBadge(true);
        } else {
            _setBadge(false);
        }

        await Promise.all([
            initIngredientes(),
            initReceitas(),
            initSimulador(),
            initPreparo(),
        ]);

        _navTo('ing');
    } catch (e) {
        console.error('[ft-app] init error:', e);
        toast('Erro ao inicializar. Modo offline ativo.', 'aviso');
        _navTo('ing');
    }

    setLoading(false);
    app?.classList.remove('hidden');
}

// ── Navegação ──────────────────────────────────────────────────────
function _navTo(aba) {
    _aba = aba;
    document.querySelectorAll('.ft-section').forEach(s =>
        s.classList.toggle('active', s.id === `ft-sec-${aba}`));
    document.querySelectorAll('.ft-nav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === aba));

    const fab = document.getElementById('ft-fab');
    if (fab) fab.style.display = ['ing', 'rec', 'pre'].includes(aba) ? 'flex' : 'none';

    switch (aba) {
        case 'ing':  renderIngredientes(); break;
        case 'rec':  renderReceitas();     break;
        case 'sim':  renderSimulador();    break;
        case 'dash': renderDashboard();    break;
        case 'exp':  renderExportacao();   break;
        case 'pre':  renderPreparo();      break;
    }
}

// ── FAB ───────────────────────────────────────────────────────────
function _fab() {
    if (_aba === 'ing') abrirFormIngrediente();
    if (_aba === 'rec') abrirFormReceita();
    if (_aba === 'pre') abrirFormPreparo();
}

// ── Badge Firebase ────────────────────────────────────────────────
function _setBadge(online) {
    const b = document.getElementById('ft-sync-btn');
    if (!b) return;
    b.innerHTML   = online ? ico.cloud : ico.cloudOff;
    b.title       = online ? 'Firebase conectado' : 'Modo offline (localStorage)';
    b.classList.toggle('online', online);
}

// ── Listeners ─────────────────────────────────────────────────────
function _listeners() {
    document.querySelectorAll('.ft-nav-btn').forEach(b =>
        b.addEventListener('click', () => _navTo(b.dataset.tab)));

    document.getElementById('ft-fab')?.addEventListener('click', _fab);

    const busca1 = document.getElementById('ft-busca-ing');
    const busca2 = document.getElementById('ft-busca-rec');
    const busca3 = document.getElementById('ft-busca-pre');

    if (busca1) busca1.addEventListener('input', debounce(e => renderIngredientes(e.target.value)));
    if (busca2) busca2.addEventListener('input', debounce(e => renderReceitas(e.target.value)));
    if (busca3) busca3.addEventListener('input', debounce(e => renderPreparo(e.target.value)));

    document.getElementById('ft-sync-btn')?.addEventListener('click', async () => {
        if (!fbIsAvailable()) { toast('Firebase não configurado.', 'aviso'); return; }
        setLoading(true);
        await sincronizarLocalParaFirebase();
        setLoading(false);
        toast('Dados sincronizados!', 'sucesso');
    });

    // Re-render reativo
    document.addEventListener('ft:recs-changed', () => {
        if (_aba === 'sim')  renderSimulador();
        if (_aba === 'dash') renderDashboard();
    });
    document.addEventListener('ft:ings-changed', () => {
        if (_aba === 'dash') renderDashboard();
    });

    initModalOverlay();
}

document.addEventListener('DOMContentLoaded', () => { _listeners(); init(); });
