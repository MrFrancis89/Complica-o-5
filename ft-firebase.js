// ft-firebase.js — v2.1 — Google Sign-In
// Projeto: stockflow-pro-72a67
// ══════════════════════════════════════════════════════════════════
// CORREÇÕES v2.1
// ══════════════════════════════════════════════════════════════════
// BUG #1 — iOS/Safari bloqueia signInWithPopup → tela branca
//          "The requested action is invalid" no firebaseapp.com
//   PROBLEMA : signInWithPopup falha no iOS/Safari (WKWebView + PWA).
//              O SDK às vezes tentava redirect automático, mas sem
//              getRedirectResult() no boot o token chegava expirado
//              → erro da foto da tela branca.
//   CORREÇÃO : Adicionadas fbSignInWithRedirect() e fbGetRedirectResult().
//              fbSignInGoogle() permanece (popup para desktop/Chrome).
//              Fallback para redirect é tratado em ft-app.js ao capturar
//              auth/popup-blocked ou auth/operation-not-supported-in-this-environment.
//              fbGetRedirectResult() captura e trata auth/invalid-action-code
//              (token expirado) → retorna null, app continua normalmente.
//
// BUG #2 — _readyListeners nunca disparado na sessão restaurada
//   PROBLEMA : fbGetCurrentUser() preenchia _uid/_user/_ready mas NÃO
//              chamava _readyListeners → módulos que usam onFirebaseReady()
//              ficavam sem notificação durante o boot com sessão salva.
//   CORREÇÃO : _readyListeners.forEach() adicionado em fbGetCurrentUser()
//              quando user != null. Também adicionado em fbGetRedirectResult().
// ══════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCfpzmO9yAgf_gqzYyvwg9pqEPt2UGbHW8",
    authDomain:        "stockflow-pro-72a67.firebaseapp.com",
    projectId:         "stockflow-pro-72a67",
    storageBucket:     "stockflow-pro-72a67.firebasestorage.app",
    messagingSenderId: "714550242199",
    appId:             "1:714550242199:web:d50d468dfbb1ee557332d2"
};

let _db    = null;
let _auth  = null;
let _uid   = null;
let _user  = null;
let _ready = false;
const _readyListeners = [];

export function fbIsAvailable() { return _ready && !!_uid; }
export function fbGetUid()      { return _uid; }
export function fbGetUser()     { return _user; }

/** Inicializa o SDK. NÃO faz login — só prepara o Firebase. */
export async function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[firebase] SDK não carregado.');
        return false;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        _db   = firebase.firestore();
        _auth = firebase.auth();
        console.info('[firebase] SDK inicializado.');
        return true;
    } catch (e) {
        console.error('[firebase] Erro ao inicializar SDK:', e);
        return false;
    }
}

/**
 * Verifica se já existe sessão ativa.
 * Retorna o user se logado, null se não logado.
 *
 * BUG FIX #2: agora dispara _readyListeners quando sessão é restaurada,
 * garantindo que onFirebaseReady() funcione corretamente no boot.
 */
export function fbGetCurrentUser() {
    return new Promise(resolve => {
        if (!_auth) { resolve(null); return; }
        // onAuthStateChanged dispara imediatamente com o estado atual
        const unsub = _auth.onAuthStateChanged(user => {
            unsub();
            if (user) {
                _uid   = user.uid;
                _user  = user;
                _ready = true;
                // BUG FIX #2: antes este caminho não notificava os listeners.
                _readyListeners.forEach(fn => fn(_user));
            }
            resolve(user || null);
        });
    });
}

/**
 * Abre popup de login com Google (desktop / Chrome).
 * Em iOS/Safari, ft-app.js captura auth/popup-blocked e usa
 * fbSignInWithRedirect() como fallback automático.
 */
export async function fbSignInGoogle() {
    if (!_auth) throw new Error('Firebase não inicializado');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await _auth.signInWithPopup(provider);
    _uid   = cred.user.uid;
    _user  = cred.user;
    _ready = true;
    _readyListeners.forEach(fn => fn(_user));
    console.info(`[firebase] Login Google (popup). UID: ${_uid}`);
    return cred.user;
}

/**
 * BUG FIX #1 — Login via redirect (fallback iOS/Safari/PWA).
 * Redireciona o browser para o Google — esta função não retorna.
 * Ao voltar, fbGetRedirectResult() no boot captura o resultado.
 */
export async function fbSignInWithRedirect() {
    if (!_auth) throw new Error('Firebase não inicializado');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await _auth.signInWithRedirect(provider);
    // Execução não continua daqui — o browser redireciona.
}

/**
 * BUG FIX #1 — Captura resultado de redirect de login pendente.
 * Deve ser chamado no boot, ANTES de fbGetCurrentUser().
 * Retorna o user se o redirect trouxe um login, null caso contrário.
 *
 * Trata auth/invalid-action-code ("The requested action is invalid"):
 * token expirado ou já consumido → retorna null, app continua normalmente,
 * eliminando a tela branca que era exibida no firebaseapp.com.
 */
export async function fbGetRedirectResult() {
    if (!_auth) return null;
    try {
        const result = await _auth.getRedirectResult();
        if (result?.user) {
            _uid   = result.user.uid;
            _user  = result.user;
            _ready = true;
            _readyListeners.forEach(fn => fn(_user));
            console.info(`[firebase] Login Google (redirect). UID: ${_uid}`);
            return result.user;
        }
        return null;
    } catch (e) {
        // auth/invalid-action-code → "The requested action is invalid"
        // Token expirado ou já usado — tratado como ausência de sessão.
        console.warn('[firebase] getRedirectResult falhou:', e.code || e.message);
        return null;
    }
}

/**
 * Faz logout. Limpa estado local.
 */
export async function fbSignOut() {
    if (!_auth) return;
    await _auth.signOut();
    _uid   = null;
    _user  = null;
    _ready = false;
    console.info('[firebase] Logout realizado.');
}

export function onFirebaseReady(callback) { _readyListeners.push(callback); }

// ── CRUD Firestore ─────────────────────────────────────────────────
// Estrutura: users/{uid}/{colecao}/{id}

function _colRef(colecao) {
    return _db.collection('users').doc(_uid).collection(colecao);
}

export async function fbSave(colecao, id, dados) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).set(dados, { merge: true });
}

export async function fbLoad(colecao) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    const snap = await _colRef(colecao).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fbDelete(colecao, id) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).delete();
}

export function fbWatch(colecao, callback) {
    if (!fbIsAvailable()) return () => {};
    return _colRef(colecao).onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}
