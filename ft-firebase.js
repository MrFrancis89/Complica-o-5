// ft-firebase.js — Ficha Técnica v1.1
// Projeto: stockflow-pro-72a67

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCfpzmO9yAgf_gqzYyvwg9pqEPt2UGbHW8",
    authDomain:        "stockflow-pro-72a67.firebaseapp.com",
    projectId:         "stockflow-pro-72a67",
    storageBucket:     "stockflow-pro-72a67.firebasestorage.app",
    messagingSenderId: "714550242199",
    appId:             "1:714550242199:web:d50d468dfbb1ee557332d2"
};

// ─────────────────────────────────────────────────────────────────
// Não editar abaixo desta linha
// ─────────────────────────────────────────────────────────────────

let _db    = null;
let _auth  = null;
let _uid   = null;
let _ready = false;
const _listeners = [];

export function fbIsAvailable() { return _ready && !!_uid; }
export function fbGetUid()      { return _uid; }

export async function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn('[firebase] SDK não carregado. Verifique os scripts em ficha-tecnica.html.');
        return false;
    }
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        _db   = firebase.firestore();
        _auth = firebase.auth();
        await _ensureAuth();
        _ready = true;
        _listeners.forEach(fn => fn(true));
        console.info(`[firebase] ✓ Conectado. UID: ${_uid}`);
        return true;
    } catch(e) {
        console.error('[firebase] Falha ao inicializar:', e);
        _listeners.forEach(fn => fn(false));
        return false;
    }
}

async function _ensureAuth() {
    return new Promise((resolve, reject) => {
        const unsub = _auth.onAuthStateChanged(async user => {
            unsub();
            if (user) {
                _uid = user.uid; resolve(user);
            } else {
                try {
                    const cred = await _auth.signInAnonymously();
                    _uid = cred.user.uid; resolve(cred.user);
                } catch(e) { reject(e); }
            }
        });
    });
}

export function onFirebaseReady(callback) { _listeners.push(callback); }

// ── Coleção: users/{uid}/{colecao}/{id} ──────────────────────────

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
