// ft/firebase.js — Ficha Técnica v1.0
// ══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO DO FIREBASE
// ══════════════════════════════════════════════════════════════════
// 1. Acesse https://console.firebase.google.com
// 2. Crie um projeto (ou use um existente)
// 3. Ative Firestore (modo de produção)
// 4. Ative Authentication → Login anônimo
// 5. Vá em Configurações do projeto → Seus apps → Adicionar app web
// 6. Copie o objeto firebaseConfig e cole abaixo
// 7. Em Firestore → Regras, cole as regras do schema.json
// ══════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCfpzmO9yAgf_gqzYyvwg9pqEPt2UGbHW8",
    authDomain:        "SEU_PROJETO.firebaseapp.com",
    projectId:         "SEU_PROJETO",
    storageBucket:     "SEU_PROJETO.appspot.com",
    messagingSenderId: "SEU_MESSAGING_ID",
    appId:             "SEU_APP_ID"
};

// ─────────────────────────────────────────────────────────────────
// Não editar abaixo desta linha
// ─────────────────────────────────────────────────────────────────

let _db   = null;
let _auth = null;
let _uid  = null;
let _ready = false;
const _listeners = [];

/** Retorna true se o Firebase está ativo e o usuário autenticado. */
export function fbIsAvailable() { return _ready && !!_uid; }

/** UID do usuário atual. */
export function fbGetUid() { return _uid; }

/** Inicializa Firebase. Retorna Promise<bool>. */
export async function initFirebase() {
    // Verifica se a config foi preenchida
    if (FIREBASE_CONFIG.apiKey === 'SUA_API_KEY') {
        console.info('[firebase] Config não preenchida — modo LocalStorage ativado.');
        return false;
    }

    // Verifica se o SDK foi carregado (via <script> no HTML)
    if (typeof firebase === 'undefined') {
        console.warn('[firebase] SDK não carregado.');
        return false;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        _db   = firebase.firestore();
        _auth = firebase.auth();

        // Aguarda autenticação anônima
        await _ensureAuth();
        _ready = true;
        console.info(`[firebase] Pronto. UID: ${_uid}`);
        return true;
    } catch(e) {
        console.error('[firebase] Falha ao inicializar:', e);
        return false;
    }
}

async function _ensureAuth() {
    return new Promise((resolve, reject) => {
        const unsub = _auth.onAuthStateChanged(async user => {
            unsub();
            if (user) {
                _uid = user.uid;
                resolve(user);
            } else {
                try {
                    const cred = await _auth.signInAnonymously();
                    _uid = cred.user.uid;
                    resolve(cred.user);
                } catch(e) {
                    reject(e);
                }
            }
        });
    });
}

/** Notifica listeners sobre mudança de estado do Firebase. */
export function onFirebaseReady(callback) {
    _listeners.push(callback);
}

// ── Helpers de coleção ────────────────────────────────────────────
// Estrutura: users/{uid}/{colecao}/{id}

function _colRef(colecao) {
    return _db.collection('users').doc(_uid).collection(colecao);
}

/** Salva um documento. */
export async function fbSave(colecao, id, dados) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).set(dados, { merge: true });
}

/** Carrega todos os documentos de uma coleção. */
export async function fbLoad(colecao) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    const snap = await _colRef(colecao).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Remove um documento. */
export async function fbDelete(colecao, id) {
    if (!fbIsAvailable()) throw new Error('Firebase indisponível');
    await _colRef(colecao).doc(id).delete();
}

/** Listener em tempo real numa coleção. Retorna função de unsubscribe. */
export function fbWatch(colecao, callback) {
    if (!fbIsAvailable()) return () => {};
    return _colRef(colecao).onSnapshot(snap => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}
