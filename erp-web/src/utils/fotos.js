import { headerSesion } from './sesion';
import { headerEntorno } from './entorno';

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
    // Las cabeceras van a mano porque esto es `fetch` nativo y no axios: `axios.defaults`
    // no lo alcanza. Son dos cosas distintas y las dos hacen falta:
    //
    //   - `headerSesion()` prueba quién sube. Sin ella, `POST /api/uploads/foto` aceptaba el
    //     archivo de cualquiera que supiera la URL del backend.
    //   - `headerEntorno()` dice si es producción o demo. Sin ella, una foto subida en modo
    //     demo terminaba en la carpeta de producción.
    //
    // Y de la sesión sale también EN QUÉ TALLER queda archivada: el backend saca el taller
    // del prefijo del token (`middlewares/entorno.js`), así que sin esta cabecera la foto
    // caía en la carpeta del taller por defecto, viniera del cliente que viniera.
    //
    // NO se pone `Content-Type`: con un `FormData` lo arma el navegador, que es el único
    // que conoce el `boundary`. Escribirlo a mano rompe la subida entera.
    const resp = await fetch(`${apiBase}/uploads/foto`, {
        method: 'POST',
        headers: { ...headerEntorno(), ...headerSesion() },
        body: formData,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
    const backendOrigin = apiBase.replace(/\/api\/?$/, '');
    return `${backendOrigin}${data.url}`;
}
