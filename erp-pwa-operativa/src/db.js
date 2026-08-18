// Cola de envío de reportes (README pwa_movil §8): si el POST falla, el reporte queda en
// el dispositivo y se reintenta al recuperar señal. Sin esto, una foto tomada sin señal se
// pierde — hoy eso ya ocurre en terreno (ver estrategia-movil.md §6.5). No es offline
// completo: solo esta cola puntual, con IndexedDB nativo (sin librería nueva).
const DB_NAME = 'operativo-reportes';
const STORE = 'cola';

function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function encolarReporte(reporte) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).add({ ...reporte, fechaEncolado: new Date().toISOString() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function listarCola() {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function quitarDeCola(id) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Se llama al montar la app y cada vez que vuelve la señal ('online'). Cada reporte de la
// cola trae su propia función de envío (ver O4) — reintentarProc la ejecuta y, si tiene
// éxito, saca el reporte de la cola.
export async function reintentarCola(enviar) {
    const pendientes = await listarCola();
    for (const item of pendientes) {
        try {
            await enviar(item);
            await quitarDeCola(item.id);
        } catch {
            // sigue sin señal: se deja en la cola, se reintenta en el próximo 'online'
        }
    }
}
