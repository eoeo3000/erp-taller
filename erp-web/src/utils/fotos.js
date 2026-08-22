// Comprime en el cliente y sube como archivo real a /api/uploads/foto — nunca como base64
// incrustado en el documento de la OT. Una sola foto en base64 embebida en un documento hacía
// que cualquier consulta que trajera esa OT tardara varios segundos en producción, sin
// relación con índices ni con la red (diagnosticado directo contra la base, ver
// docs/bugs-conocidos.md). Duplicado a propósito desde
// erp-pwa-operativa/src/api.js (mismo motivo que motorSugerencia.js: sin monorepo/paquete
// compartido entre erp-web y las PWA).

function comprimirABlob(archivo) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1200;
                let w = img.width, h = img.height;
                if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la foto'))), 'image/jpeg', 0.75);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
    });
}

// `apiBase` es la misma constante `API` que ya recibe cada pantalla como prop desde App.jsx.
export async function subirFoto(archivo, apiBase) {
    const blob = await comprimirABlob(archivo);
    const formData = new FormData();
    formData.append('foto', blob, 'foto.jpg');
    const resp = await fetch(`${apiBase}/uploads/foto`, { method: 'POST', body: formData });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
    const backendOrigin = apiBase.replace(/\/api\/?$/, '');
    return `${backendOrigin}${data.url}`;
}
