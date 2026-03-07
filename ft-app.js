// ft-app.js — v3.3 — Google Sign-In
// ══════════════════════════════════════════════════════════════════
// CORREÇÃO v3.3 — Bug raiz: Firebase Auth não funciona em iframe
// ══════════════════════════════════════════════════════════════════
// PROBLEMA:
//   ficha-tecnica.html roda dentro de um <iframe> no index.html.
//   Qualquer tentativa de auth Firebase (popup ou redirect) dentro
//   de iframe falha → "The requested action is invalid".
//
// SOLUÇÃO — dois modos de execução:
//
// MODO IFRAME (window !== window.top):
//   Contexto normal de uso. Não tenta auth diretamente.
//   • Tela de login mostra botão "Abrir para login"
//   • Botão faz window.open('ficha-tecnica.html?ft_auth_popup=1', ...)
//     → abre janela standalone top-level (sem iframe)
//   • Escuta window.addEventListener('message') aguardando
//     {type:'ft-auth-ok'} da janela filha
//   • Ao receber a mensagem, chama fbGetCurrentUser() — a sessão
//     já está no IndexedDB/localStorage do mesmo domínio — e inicia o app
//
// MODO POPUP (URL contém ?ft_auth_popup=1):
//   Janela standalone aberta exclusivamente para autenticação.
//   • Inicializa Firebase, faz signInWithPopup (funciona aqui!)
//   • Após login: window.opener.postMessage({type:'ft-auth-ok'})
//     e fecha a janela
//   • Se já havia sessão ativa: posta mensagem e fecha imediatamente
//   • Exibe UI mínima de login (sem nav, sem header completo)
// ══════════════════════════════════════════════════════════════════
import { initFirebase, fbGetCurrentUser, fbSignInGoogle,
         fbSignOut, fbIsAvailable, fbGetUser }             from './ft-firebase.js';
import { sincronizarLocalParaFirebase }                    from './ft-storage.js';
import { initModalOverlay, setLoading, toast, debounce }  from './ft-ui.js';
import { initIngredientes, renderIngredientes,
         abrirFormIngrediente }                            from './ft-ingredientes.js';
import { initReceitas, renderReceitas, abrirFormReceita } from './ft-receitas.js';
import { initSimulador,  renderSimulador }                from './ft-custos.js';
import { renderDashboard }                                from './ft-dashboard.js';
import { renderExportacao }                               from './ft-exportacao.js';
import { initPreparo, renderPreparo, abrirFormPreparo }   from './ft-preparo.js';
import { ico }                                            from './ft-icons.js';

// ── Detecção de contexto ──────────────────────────────────────────
const _isInIframe  = window !== window.top;
const _isAuthPopup = new URLSearchParams(window.location.search).get('ft_auth_popup') === '1';

let _aba = 'ing';

// ── Tema ──────────────────────────────────────────────────────────
const TEMA_CSS = {
    escuro:   [],
    midnight: ['theme-midnight'],
    arctic:   ['theme-arctic', 'light-mode'],
    forest:   ['theme-forest'],
};
function _aplicarTema(tema) {
    const body = document.body;
    ['theme-midnight','theme-arctic','theme-forest','light-mode'].forEach(c => body.classList.remove(c));
    (TEMA_CSS[tema] || []).forEach(c => body.classList.add(c));
}
function _initTema() {
    _aplicarTema(localStorage.getItem('temaEstoque') || 'escuro');
    window.addEventListener('storage', e => { if (e.key === 'temaEstoque') _aplicarTema(e.newValue || 'escuro'); });
    window.addEventListener('ft-tema', e => { if (e.detail?.tema) _aplicarTema(e.detail.tema); });
}

// ══════════════════════════════════════════════════════════════════
// MODO POPUP — janela standalone aberta apenas para autenticação
// ══════════════════════════════════════════════════════════════════

/**
 * Inicialização quando rodamos em modo ?ft_auth_popup=1.
 * Esta janela só serve para fazer login — depois fecha.
 */
async function _initAuthPopupMode() {
    _aplicarTema(localStorage.getItem('temaEstoque') || 'escuro');

    // Esconde tudo exceto o loading e o login
    document.getElementById('ft-app')?.classList.add('hidden');
    setLoading(true);

    const sdkOk = await Promise.race([
        initFirebase(),
        new Promise(r => setTimeout(() => r(false), 4000)),
    ]);

    if (!sdkOk) {
        setLoading(false);
        _mostrarLoginPopup('Firebase indisponível. Feche e tente novamente.');
        return;
    }

    // Verifica se já há sessão ativa — se sim, notifica e fecha
    const user = await fbGetCurrentUser();
    if (user) {
        _notificarOpenerEFechar();
        return;
    }

    setLoading(false);
    _mostrarLoginPopup();
}

/** Renderiza a tela de login na janela popup de auth. */
function _mostrarLoginPopup(erro = '') {
    const wrap = document.getElementById('ft-login');
    if (!wrap) return;
    wrap.innerHTML = `
        <div class="ft-login-box">
            <div class="ft-login-logo">🍕</div>
            <h1 class="ft-login-title">Ficha Técnica</h1>
            <p class="ft-login-sub">Entre com sua conta Google para continuar.</p>
            ${erro ? `<div class="ft-login-erro">${erro}</div>` : ''}
            <button class="ft-login-btn" id="ft-btn-google">
                <svg class="ft-google-ico" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Entrar com Google</span>
            </button>
            <p class="ft-login-hint">Esta janela fecha automaticamente após o login.</p>
        </div>`;
    wrap.classList.remove('hidden');

    document.getElementById('ft-btn-google')?.addEventListener('click', async () => {
        const btn = document.getElementById('ft-btn-google');
        if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Aguarde…'; }
        try {
            await fbSignInGoogle();
            _notificarOpenerEFechar();
        } catch (e) {
            console.error('[login-popup]', e);
            const msg = e.code === 'auth/popup-closed-by-user'
                ? 'Login cancelado. Tente novamente.'
                : 'Falha ao entrar. Tente novamente.';
            _mostrarLoginPopup(msg);
        }
    }, { once: true });
}

/** Envia mensagem de sucesso ao opener (iframe) e fecha esta janela. */
function _notificarOpenerEFechar() {
    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'ft-auth-ok' }, window.location.origin);
        }
    } catch (e) {
        console.warn('[auth-popup] Não foi possível notificar o opener:', e);
    }
    // Pequeno delay para garantir que a mensagem foi entregue antes de fechar
    setTimeout(() => window.close(), 300);
}

// ══════════════════════════════════════════════════════════════════
// MODO IFRAME — contexto normal de uso (dentro do index.html)
// ══════════════════════════════════════════════════════════════════

/**
 * Tela de login para o contexto de iframe.
 * Não tenta nenhum auth diretamente — abre uma janela externa.
 */
function _mostrarLogin(erro = '') {
    setLoading(false);
    const wrap = document.getElementById('ft-login');
    if (!wrap) return;
    wrap.innerHTML = `
        <div class="ft-login-box">
            <div class="ft-login-logo">🍕</div>
            <h1 class="ft-login-title">Ficha Técnica</h1>
            <p class="ft-login-sub">Faça login para sincronizar seus dados<br>em qualquer dispositivo.</p>
            ${erro ? `<div class="ft-login-erro">${erro}</div>` : ''}
            <button class="ft-login-btn" id="ft-btn-google">
                <svg class="ft-google-ico" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Entrar com Google</span>
            </button>
            <p class="ft-login-hint">Seus dados ficam salvos na sua conta Google.<br>Funciona em qualquer dispositivo.</p>
        </div>`;
    wrap.classList.remove('hidden');

    document.getElementById('ft-btn-google')?.addEventListener('click', () => {
        _abrirJanelaDeLogin();
    }, { once: true });
}

/**
 * Abre ficha-tecnica.html?ft_auth_popup=1 em uma janela top-level.
 * Essa janela não está em iframe → Firebase Auth funciona.
 * Escuta postMessage de retorno para detectar login concluído.
 */
function _abrirJanelaDeLogin() {
    const btn = document.getElementById('ft-btn-google');
    if (btn) { btn.disabled = true; btn.querySelector('span').textContent = 'Abrindo…'; }

    const url    = 'ficha-tecnica.html?ft_auth_popup=1';
    const opts   = 'width=420,height=580,left=100,top=100,resizable=yes,scrollbars=yes';
    const popup  = window.open(url, 'ft_auth_window', opts);

    if (!popup || popup.closed) {
        // Bloqueador de popup ativo — orienta o usuário
        _mostrarLogin('Popup bloqueado. Permita popups para este site nas configurações do navegador e tente novamente.');
        return;
    }

    // Handler de mensagem: aguarda confirmação de login da janela filha
    const _onMessage = async (e) => {
        // Verifica origem para segurança
        if (e.origin !== window.location.origin) return;
        if (e.data?.type !== 'ft-auth-ok') return;

        window.removeEventListener('message', _onMessage);

        // A janela filha já fechou — a sessão está no storage compartilhado
        const wrap = document.getElementById('ft-login');
        if (wrap) wrap.classList.add('hidden');
        setLoading(true);

        // Recarrega o estado de auth (sessão já gravada no IndexedDB/localStorage)
        const user = await fbGetCurrentUser();
        if (user) {
            await _initApp();
        } else {
            // Raro: storage não sincronizou a tempo — tenta uma vez com pequeno delay
            setTimeout(async () => {
                const u2 = await fbGetCurrentUser();
                if (u2) {
                    await _initApp();
                } else {
                    setLoading(false);
                    _mostrarLogin('Login não detectado. Tente novamente.');
                }
            }, 800);
        }
    };

    window.addEventListener('message', _onMessage);

    // Fallback: se a janela foi fechada sem postar mensagem (ex: usuário fechou manualmente)
    const _pollClosed = setInterval(() => {
        if (popup.closed) {
            clearInterval(_pollClosed);
            window.removeEventListener('message', _onMessage);
            // Re-verifica sessão por segurança
            fbGetCurrentUser().then(u => {
                if (u) {
                    document.getElementById('ft-login')?.classList.add('hidden');
                    _initApp();
                } else {
                    // Restaura botão de login
                    _mostrarLogin();
                }
            });
        }
    }, 500);
}

// ══════════════════════════════════════════════════════════════════
// INIT DO APP (comum aos dois modos, pós-login)
// ══════════════════════════════════════════════════════════════════

async function _initApp() {
    setLoading(true);
    document.getElementById('ft-app')?.classList.remove('hidden');

    try {
        const user = fbGetUser();
        if (user) {
            _atualizarHeaderUser(user);
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
}

function _atualizarHeaderUser(user) {
    const btn = document.getElementById('ft-user-btn');
    if (!btn) return;
    const foto = user.photoURL;
    const nome = user.displayName || user.email || 'Usuário';
    btn.innerHTML = foto
        ? `<img src="${foto}" alt="${nome}" class="ft-avatar">`
        : `<span class="ft-avatar-ini">${nome.charAt(0).toUpperCase()}</span>`;
    btn.title = nome;
    btn.style.display = 'flex';
}

// ── Boot ──────────────────────────────────────────────────────────
async function init() {
    // MODO POPUP: esta instância existe só para fazer login
    if (_isAuthPopup) {
        await _initAuthPopupMode();
        return;
    }

    // MODO NORMAL (iframe ou standalone sem parâmetro)
    setLoading(true);
    _initTema();

    const sdkOk = await Promise.race([
        initFirebase(),
        new Promise(r => setTimeout(() => r(false), 3000)),
    ]);

    if (!sdkOk) {
        setLoading(false);
        document.getElementById('ft-app')?.classList.remove('hidden');
        await Promise.all([initIngredientes(), initReceitas(), initSimulador(), initPreparo()]);
        _navTo('ing');
        setLoading(false);
        return;
    }

    const user = await fbGetCurrentUser();
    setLoading(false);

    if (user) {
        document.getElementById('ft-login')?.classList.add('hidden');
        await _initApp();
    } else {
        document.getElementById('ft-app')?.classList.add('hidden');
        _mostrarLogin();
    }
}

// ── Navegação ─────────────────────────────────────────────────────
function _navTo(aba) {
    _aba = aba;
    document.querySelectorAll('.ft-section').forEach(s =>
        s.classList.toggle('active', s.id === `ft-sec-${aba}`));
    document.querySelectorAll('.ft-nav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === aba));
    const fab = document.getElementById('ft-fab');
    if (fab) fab.style.display = ['ing','rec','pre'].includes(aba) ? 'flex' : 'none';
    switch (aba) {
        case 'ing':  renderIngredientes(); break;
        case 'rec':  renderReceitas();     break;
        case 'sim':  renderSimulador();    break;
        case 'dash': renderDashboard();    break;
        case 'exp':  renderExportacao();   break;
        case 'pre':  renderPreparo();      break;
    }
}

function _fab() {
    if (_aba === 'ing') abrirFormIngrediente();
    if (_aba === 'rec') abrirFormReceita();
    if (_aba === 'pre') abrirFormPreparo();
}

function _setBadge(online) {
    const b = document.getElementById('ft-sync-btn');
    if (!b) return;
    b.innerHTML = online ? ico.cloud : ico.cloudOff;
    b.title     = online ? 'Firebase conectado' : 'Modo offline';
    b.classList.toggle('online', online);
}

// ── Listeners ─────────────────────────────────────────────────────
function _listeners() {
    // Em modo auth-popup não registra listeners de UI
    if (_isAuthPopup) return;

    document.querySelectorAll('.ft-nav-btn').forEach(b =>
        b.addEventListener('click', () => _navTo(b.dataset.tab)));

    document.getElementById('ft-fab')?.addEventListener('click', _fab);

    const b1 = document.getElementById('ft-busca-ing');
    const b2 = document.getElementById('ft-busca-rec');
    const b3 = document.getElementById('ft-busca-pre');
    if (b1) b1.addEventListener('input', debounce(e => renderIngredientes(e.target.value)));
    if (b2) b2.addEventListener('input', debounce(e => renderReceitas(e.target.value)));
    if (b3) b3.addEventListener('input', debounce(e => renderPreparo(e.target.value)));

    document.getElementById('ft-sync-btn')?.addEventListener('click', async () => {
        if (!fbIsAvailable()) { toast('Firebase não disponível.', 'aviso'); return; }
        setLoading(true);
        await sincronizarLocalParaFirebase();
        setLoading(false);
        toast('Dados sincronizados!', 'sucesso');
    });

    document.getElementById('ft-user-btn')?.addEventListener('click', async () => {
        const user = fbGetUser();
        if (!user) return;
        const nome = user.displayName || user.email || 'Usuário';
        const ok = await import('./ft-ui.js').then(m =>
            m.confirmar(`<strong>${nome}</strong><br>Deseja sair da conta?`, { labelOK: 'Sair' })
        );
        if (!ok) return;
        await fbSignOut();
        document.getElementById('ft-app')?.classList.add('hidden');
        _mostrarLogin();
    });

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
