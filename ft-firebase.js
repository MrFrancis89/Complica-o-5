// ft-firebase.js — v2.2 — Google Sign-In
// Projeto: stockflow-pro-72a67
// ══════════════════════════════════════════════════════════════════
// CORREÇÃO v2.2 — Bug raiz: Firebase Auth não funciona em iframe
// ══════════════════════════════════════════════════════════════════
// PROBLEMA:
//   ficha-tecnica.html é carregada dentro de um <iframe> no index.html.
//   O Firebase Auth falha em contexto de iframe:
//   • signInWithPopup  → bloqueado/inconsistente no Safari/WKWebView
//   • signInWithRedirect → redireciona o IFRAME para firebaseapp.com;
//     ao retornar, o token fica no frame errado →
//     "The requested action is invalid".
//
// SOLUÇÃO (implementada em ft-app.js):
//   1. ft-app.js detecta iframe: window !== window.top
//   2. Se iframe → exibe botão "Abrir para login"
//   3. Botão abre: window.open('ficha-tecnica.html?ft_auth_popup=1')
//      Essa janela é TOP-LEVEL → Firebase Auth funciona normalmente
//   4. Modo popup: faz login com Google via signInWithPopup (funciona)
//   5. Após sucesso, posta {type:'ft-auth-ok'} ao opener e fecha
//   6. O iframe recebe a mensagem, chama fbGetCurrentUser() e inicia
//      o app — a sessão já está gravada no IndexedDB/localStorage
//      compartilhado entre iframe e janela do mesmo domínio.
//
// BUG #2 v2.1 (mantido): _readyListeners agora disparado também na
//   sessão restaurada via fbGetCurrentUser().
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
 * Verifica sessão ativa via onAuthStateChanged (dispara uma vez).
 * BUG FIX v2.1: notifica _readyListeners quando sessão já existe no boot.
 */
export function fbGetCurrentUser() {
    return new Promise(resolve => {
        if (!_auth) { resolve(null); return; }
        const unsub = _auth.onAuthStateChanged(user => {
            unsub();
            if (user) {
                _uid   = user.uid;
                _user  = user;
                _ready = true;
                // BUG FIX v2.1: antes ausente neste caminho (sessão restaurada).
                _readyListeners.forEach(fn => fn(_user));
            }
            resolve(user || null);
        });
    });
}

/**
 * Login via popup Google.
 * Deve ser chamado SOMENTE em janela top-level (não iframe).
 * ft-app.js garante esse contexto via window.open() quando necessário.
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
    console.info(`[firebase] Login Google OK. UID: ${_uid}`);
    return cred.user;
}

/** Logout. Limpa estado local. */
export async function fbSignOut() {
    if (!_auth) return;
    await _auth.signOut();
    _uid   = null;
    _user  = null;
    _ready = false;
    console.info('[firebase] Logout realizado.');
}

export function onFirebaseReady(callback) { _readyListeners.push(callback); }

// ── CRUD Firestore ──────────────────────────────────────────────────
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
