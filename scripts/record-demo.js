// Graba el video de demostración del ERP para la landing de validación.
//
// El guion muestra los dos ejes que se quieren vender: la empresa conectada con su cliente
// (pide, recibe la oferta, la aprueba, ve el avance y su cuenta) y comunicándose internamente
// (oficina asigna, terreno evalúa y ejecuta, oficina cobra).
//
// UN SOLO ARCHIVO DE VIDEO, 1920x1080. Playwright graba un video por contexto, así que todo
// pasa en el mismo contexto y en la misma página: cuando el guion se va al teléfono se cambia
// el viewport a 390x844 y Playwright encaja esa imagen, centrada, dentro del cuadro de
// 1920x1080 — el aspecto de un screencast de celular, sin cortar la grabación.
//
// (La primera versión mostraba las PWAs dentro de un iframe con marco de teléfono. No sirve: el
// navegador le niega localStorage a un iframe alojado en about:blank —"Access is denied for this
// document"— y las PWAs guardan ahí su sesión, así que quedaban en la pantalla de acceso. Si
// alguna vez se quiere el marco, la página envoltorio tiene que servirse desde el MISMO origen
// que la PWA, para que el iframe no sea de terceros.)
//
// RE-EJECUTABLE TRAS CAMBIOS DE UI: todo se ubica por atributos `data-demo`, nunca por texto
// visible ni por clases CSS. Un rediseño no rompe la grabación; renombrar un `data-demo` sí, y
// entonces el script falla nombrando exactamente cuál no encontró.
//
// QUÉ ES EN VIVO Y QUÉ VIENE PREPARADO. Los beats 1 a 3 corren sobre una solicitud que se crea
// durante la grabación (sale SOL-2026-0842 sola, porque el número de OT se deriva del de su
// solicitud). Los beats 4 a 8 usan trabajos que el seed dejó en el punto exacto que cada escena
// necesita — cuáles, lo dice demo-output/acceso-demo.json (campo `escenas`). Es a propósito:
// encadenar veinte interacciones de UI para dejar UNA sola OT lista para cotizar la haría
// fallar completa ante cualquier cambio menor, que es justo lo que este script debe resistir.
// Todo cambio de estado que se ve en pantalla es real.
//
// NO inyecta rótulos ni overlays en las apps: grabar un elemento que el producto no tiene sería
// falsear la demo. Los rótulos y los cortes van en demo-output/guion.json, para la edición.
//
// Uso:
//   npm run demo:reset && npm run demo:record
//   node scripts/record-demo.js --ventana        (con ventana, para mirarlo en vivo)
//   node scripts/record-demo.js --lento=1.5      (multiplica las pausas, para revisar)
//
// Requiere las cuatro apps corriendo: backend 5000, erp-web 5173, PWA Operativa 5174,
// PWA Cliente 5175. Si alguna no responde, aborta diciendo cuál y cómo levantarla.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'demo-output');

const URL = {
    api: 'http://localhost:5000/api',
    escritorio: 'http://localhost:5173',
    operativa: 'http://localhost:5174',
    cliente: 'http://localhost:5175',
};

const ESCRITORIO = { width: 1920, height: 1080 };
const TELEFONO = { width: 390, height: 844 };

const argumentos = process.argv.slice(2);
const FACTOR_LENTO = (() => {
    const a = argumentos.find((x) => x.startsWith('--lento='));
    return a ? Number(a.split('=')[1]) || 1 : 1;
})();

// El texto del pedido. Las palabras importan: "fuga", "hidráulica" y "manguera" son los
// sinónimos que hacen que el buscador del informe de terreno sugiera el tipo de trabajo
// correcto (ver scripts/datos-demo.js, tiposTrabajo[0].sinonimos).
const PEDIDO = 'Fuga de aceite en la manguera hidráulica del brazo izquierdo del cargador frontal 4. Está goteando desde ayer.';
const REPORTE = 'Manguera reemplazada y circuito purgado. Queda en prueba de presión, sin filtraciones.';

// ---------------------------------------------------------------- utilidades

const dormir = (ms) => new Promise((r) => setTimeout(r, Math.round(ms * FACTOR_LENTO)));
const log = (m) => process.stdout.write(`${m}\n`);

async function responde(url) {
    try {
        const r = await fetch(url, { method: 'GET' });
        return r.status < 500;
    } catch {
        return false;
    }
}

async function verificarServidores() {
    const chequeos = [
        ['backend', `${URL.api}/demo/info`],
        ['erp-web (escritorio)', URL.escritorio],
        ['PWA Operativa', URL.operativa],
        ['PWA Cliente', URL.cliente],
    ];
    const caidos = [];
    for (const [nombre, url] of chequeos) {
        if (!(await responde(url))) caidos.push(`${nombre} → ${url}`);
    }
    if (caidos.length) {
        log('No puedo grabar: estas apps no responden.');
        for (const c of caidos) log(`  · ${c}`);
        log('');
        log('Levántalas así (una por terminal):');
        log('  cd erp-backend        && npm start');
        log('  cd erp-web            && npm run dev');
        log('  cd erp-pwa-operativa  && npm run dev');
        log('  cd erp-pwa-cliente    && npm run dev');
        process.exit(1);
    }
    log('Las cuatro apps responden.');
}

function leerAccesos() {
    const ruta = path.join(SALIDA, 'acceso-demo.json');
    if (!fs.existsSync(ruta)) {
        log(`No encontré ${ruta}. Corre primero: npm run demo:reset`);
        process.exit(1);
    }
    const a = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (!a.escenas?.porAprobar || !a.escenas?.enEjecucion) {
        log('acceso-demo.json no trae el campo `escenas`. Vuelve a correr npm run demo:reset.');
        process.exit(1);
    }
    return a;
}

// Sesión de escritorio por el endpoint real, con el header de entorno demo: la cuenta de la
// demostración existe solo en erp_taller_demo. Así el video entra directo a la app y no gasta
// segundos del guion escribiendo una clave.
async function iniciarSesionEscritorio(accesos) {
    const r = await fetch(`${URL.api}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Entorno': 'demo' },
        body: JSON.stringify({ email: accesos.oficina.email, password: accesos.oficina.password }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok || !datos.token) {
        log(`No pude entrar como ${accesos.oficina.email}: ${datos.error || r.status}`);
        log('Si cambiaste la clave, vuelve a correr npm run demo:reset.');
        process.exit(1);
    }
    return datos;
}

// Corre antes de cualquier script de la página. Solo siembra la sesión de ESCRITORIO: las dos
// PWAs entran por el token en la URL (?token=…), que es el mecanismo real del link que manda la
// oficina, y además addInitScript corre en cada navegación — sembrar ahí su token hacía imposible
// cambiar de persona a mitad del guion, porque la recarga lo volvía a pisar.
// En about:blank el almacenamiento lanza, de ahí el try/catch.
function guionDeSesion(sesion) {
    return `(() => {
        try {
            localStorage.setItem('erpTaller.entorno', 'demo');
            sessionStorage.setItem('erpTaller.sesion.token', ${JSON.stringify(sesion.token)});
            sessionStorage.setItem('erpTaller.sesion.usuario', ${JSON.stringify(JSON.stringify(sesion.usuario || null))});
        } catch (e) { /* origen opaco: no hay dónde guardar */ }
    })();`;
}

// ---------------------------------------------------------------- localizadores

function sel(ambito, nombre, ref) {
    const base = `[data-demo="${nombre}"]`;
    return ambito.locator(ref === undefined ? base : `${base}[data-demo-ref="${ref}"]`);
}

async function clic(page, nombre, ref, { espera = 700, timeout = 25000 } = {}) {
    const loc = sel(page, nombre, ref).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.click();
    await dormir(espera);
}

// Clic opcional: para pasos que dependen del estado y no siempre están (una confirmación que
// aparece solo a veces, un botón que ya no aplica). Devuelve si lo encontró.
async function clicSiEsta(page, nombre, ref, { espera = 700, timeout = 3500 } = {}) {
    try {
        await clic(page, nombre, ref, { espera, timeout });
        return true;
    } catch {
        return false;
    }
}

async function escribir(page, nombre, texto, { porCaracter = 9 } = {}) {
    const loc = sel(page, nombre).first();
    await loc.waitFor({ state: 'visible', timeout: 25000 });
    await loc.click();
    // Tecleado visible: en un video, ver aparecer el texto explica lo que pasa mucho mejor que
    // un campo que se llena de golpe.
    await loc.type(texto, { delay: porCaracter * FACTOR_LENTO });
}

// ---------------------------------------------------------------- grabación

class Grabacion {
    constructor() {
        this.beats = [];
        this.inicio = Date.now();
    }

    async beat(nombre, rotulo, fn) {
        const t0 = Date.now();
        log(`  ▸ ${nombre}`);
        try {
            await fn();
        } catch (e) {
            log('');
            log(`FALLÓ el beat "${nombre}": ${e.message.split('\n')[0]}`);
            log('Si es un data-demo que no aparece, revisa que ese atributo siga en la pantalla.');
            throw e;
        }
        const t1 = Date.now();
        const seg = (t) => Math.round((t - this.inicio) / 100) / 10;
        this.beats.push({ beat: nombre, rotulo, inicio: seg(t0), fin: seg(t1), duracion: Math.round((t1 - t0) / 100) / 10 });
    }

    resumen() {
        const total = this.beats.reduce((s, b) => s + b.duracion, 0);
        return { total: Math.round(total * 10) / 10, beats: this.beats };
    }
}

// ---------------------------------------------------------------- principal

async function main() {
    fs.mkdirSync(SALIDA, { recursive: true });
    await verificarServidores();
    const accesos = leerAccesos();
    const supervisora = accesos.operativos.find((o) => o.rol === 'supervisor');
    if (!supervisora) {
        log('El seed no dejó ninguna cuenta con rol supervisor. Corre npm run demo:reset.');
        process.exit(1);
    }
    const sesion = await iniciarSesionEscritorio(accesos);
    const { porAprobar, enEjecucion } = accesos.escenas;

    log(`Sesión de oficina lista (${accesos.oficina.email}).`);
    log(`En vivo:    ${accesos.proximaSolicitud} → ${accesos.proximaOT}`);
    log(`Preparadas: ${porAprobar.solicitud} (por aprobar) · ${enEjecucion.ot} (en ejecución)`);
    log('');

    const navegador = await chromium.launch({
        headless: !argumentos.includes('--ventana'),
        args: ['--force-device-scale-factor=1'],
    });
    const contexto = await navegador.newContext({
        viewport: ESCRITORIO,
        recordVideo: { dir: SALIDA, size: ESCRITORIO },
        locale: 'es-CL',
        timezoneId: 'America/Santiago',
    });
    await contexto.addInitScript(guionDeSesion(sesion));

    const page = await contexto.newPage();
    page.setDefaultTimeout(20000);

    // El token va en la URL, igual que en el link real que la oficina manda por WhatsApp o correo:
    // cada PWA lo lee al arrancar (App.jsx → setSesion) y limpia la barra de direcciones.
    const aTelefono = async (base, token) => {
        await page.setViewportSize(TELEFONO);
        const url = `${base}/?token=${encodeURIComponent(token)}&entorno=demo`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await dormir(1600); // la PWA pide sus datos antes de pintar
    };
    const aEscritorio = async (ruta = '/') => {
        await page.setViewportSize(ESCRITORIO);
        await page.goto(`${URL.escritorio}${ruta}`, { waitUntil: 'domcontentloaded' });
        await dormir(1500); // el SPA carga /api/data antes de pintar las tablas
    };
    // Volver al inicio de la PWA Operativa sin depender de botones de "atrás": O1 se muestra en
    // cada apertura, así que recargar es el camino más estable. `token` permite entrar como otra
    // persona: la pantalla de entrada depende del rol (supervisor → su panel S1; ejecutor → Mi
    // día), y el guion necesita las dos.
    const aOperativa = async (token) => {
        await aTelefono(URL.operativa, token);
        await clic(page, 'entrar', undefined, { espera: 1300 });
    };
    const aPanel = () => aOperativa(supervisora.token);

    const g = new Grabacion();
    let refNueva = accesos.proximaSolicitud;

    // Abre en Tratamiento la solicitud indicada, desde la pantalla de Ingreso.
    const abrirTratamiento = async (refSolicitud) => {
        await aEscritorio('/');
        const fila = sel(page, 'solicitud-fila', refSolicitud).first();
        await fila.waitFor({ state: 'visible', timeout: 25000 });
        await fila.scrollIntoViewIfNeeded();
        await dormir(1200);
        await sel(fila, 'solicitud-tratar').first().click();
        await dormir(1900);
    };

    try {
        // ---- 1. El cliente pide el servicio desde su teléfono -------------------
        await g.beat('1 · El cliente pide el servicio',
            'Su cliente pide desde el teléfono, sin llamar a nadie ni esperar horario de oficina', async () => {
                await aTelefono(URL.cliente, accesos.cliente.token);
                await clic(page, 'cliente-pedir-servicio');
                await escribir(page, 'pedido-descripcion', PEDIDO);
                await dormir(600);
                await clic(page, 'pedido-urgencia', 'Detiene la producción');
                await clic(page, 'pedido-siguiente');
                // "Empresa" viene precargada desde la sesión cuando la app la conoce; entrando por
                // el link con token todavía no, así que se completa solo si está vacía. Es un campo
                // obligatorio: sin él el formulario responde "Complete empresa, nombre y
                // descripción" y la solicitud no se crea.
                const campoEmpresa = sel(page, 'pedido-empresa').first();
                if (!(await campoEmpresa.inputValue().catch(() => ''))) {
                    await escribir(page, 'pedido-empresa', accesos.cliente.empresa, { porCaracter: 12 });
                }
                await escribir(page, 'pedido-nombre', accesos.cliente.contacto, { porCaracter: 22 });
                await escribir(page, 'pedido-telefono', accesos.cliente.telefono, { porCaracter: 18 });
                await dormir(500);
                await clic(page, 'pedido-enviar', undefined, { espera: 1200 });

                // Comprobar que la solicitud QUEDÓ creada, y no solo que se apretó el botón: si
                // el formulario rechaza algo, el error se queda en pantalla y sin esta espera el
                // resto del guion sigue corriendo contra una solicitud que no existe.
                const confirmado = sel(page, 'pedido-confirmado').first();
                try {
                    await confirmado.waitFor({ state: 'visible', timeout: 12000 });
                } catch {
                    const enPantalla = (await page.locator('body').innerText()).split(String.fromCharCode(10)).filter(Boolean).join(' · ').slice(0, 300);
                    throw new Error(`la solicitud no se creó. La pantalla dice: ${enPantalla}`);
                }
                const numeroCreado = await confirmado.getAttribute('data-demo-ref');
                if (numeroCreado !== refNueva) {
                    log(`    (ojo: se creó ${numeroCreado}, no ${refNueva} — el resto del guion usa el número real)`);
                    refNueva = numeroCreado;
                }
                await dormir(1600);
            });

        // ---- 2. La oficina la recibe y la asigna --------------------------------
        await g.beat('2 · La oficina la recibe y la asigna',
            'Entra a la oficina con su número y queda a nombre de una supervisora', async () => {
                await abrirTratamiento(refNueva);
                // La opción dice "Nombre · Puesto", así que no sirve buscarla por label exacto:
                // se ubica la <option> que contiene el nombre y se elige por su value.
                const selectorSup = sel(page, 'antecedentes-supervisor').first();
                await selectorSup.waitFor({ state: 'visible', timeout: 20000 });
                const valorSup = await selectorSup
                    .locator('option', { hasText: supervisora.nombre }).first().getAttribute('value');
                if (!valorSup) throw new Error(`${supervisora.nombre} no aparece entre los supervisores del selector`);
                await selectorSup.selectOption(valorSup);
                await dormir(800);
                await clic(page, 'antecedentes-guardar', undefined, { espera: 1600 });
            });

        // ---- 3. Terreno evalúa en el sitio --------------------------------------
        // El beat que explica por qué el ERP sirve: la oficina NO puede cotizar lo que terreno no
        // evaluó (TratamientoScreen bloquea las pestañas 1-4 sin informe completo).
        await g.beat('3 · Terreno evalúa en el sitio',
            'La supervisora levanta el informe en su teléfono; hasta que no lo haga, la oficina no puede cotizar', async () => {
                await aPanel();
                await clic(page, 'panel-entrada', 'Solicitudes', { espera: 1200 });
                await clic(page, 'supervisor-tomar-solicitud', undefined, { espera: 1000 });
                await clic(page, 'supervisor-confirmar-visita', undefined, { espera: 1600 });

                // La solicitud ya es suya: aparece en "Asignadas a mí", y de ahí se abre el
                // informe. (No se va por "Mi día": quien tiene rol supervisor entra a su panel
                // S1, no a O2, así que Mi día no es su pantalla de entrada.)
                await clic(page, 'solicitudes-filtro', 'asignadas', { espera: 1100 });
                await clic(page, 'abrir-informe', refNueva, { espera: 1300 });

                // Formulario adaptativo: escribe con sus palabras, el sistema sugiere el tipo de
                // trabajo, y al elegirlo aparece el texto con los valores por completar.
                await escribir(page, 'hallazgo-texto', 'fuga de aceite en la manguera hidráulica', { porCaracter: 11 });
                await dormir(750);
                await clic(page, 'hallazgo-sugerencia', 'Reparación de sistema hidráulico', { espera: 850 });
                // Cada valor pendiente del texto es un objetivo tocable propio. Se completan TODOS los
                // del guion: los que queden sin llenar se ven como "___" en el texto del informe, y
                // en el video eso lee como una frase a medias.
                // `multiple` marca las listas de selección múltiple, que no se cierran al elegir
                // sino con su botón "Listo".
                const valoresDelHallazgo = [
                    { clave: 'falla', opcion: 'fuga de aceite' },
                    { clave: 'componente', opcion: 'el brazo izquierdo' },
                    { clave: 'tipoEquipo', opcion: 'Equipo móvil' },
                    { clave: 'condicionesEntorno', opcion: 'Equipo en operación', multiple: true },
                ];
                for (const { clave, opcion, multiple } of valoresDelHallazgo) {
                    await clic(page, 'hallazgo-valor', clave, { espera: 450 });
                    await clic(page, 'hallazgo-opcion', opcion, { espera: 450 });
                    if (multiple) await clic(page, 'hallazgo-listo', undefined, { espera: 450 });
                }
                await dormir(700);
                await clic(page, 'informe-guardar', undefined, { espera: 900 });
                // Comprobar que el informe QUEDÓ guardado: al guardar bien, O5 se cierra sola; si
                // el servidor rechaza, la pantalla se queda con el error a la vista. Sin esta
                // verificación el video mostraba el informe "guardándose" cuando en realidad el
                // backend respondía 401 (a la PWA le faltaba VITE_API_KEY para PUT /api/ots/:id).
                try {
                    await sel(page, 'informe-guardar').first().waitFor({ state: 'hidden', timeout: 12000 });
                } catch {
                    const enPantalla = (await page.locator('body').innerText())
                        .split(String.fromCharCode(10)).filter(Boolean).join(' · ').slice(0, 300);
                    throw new Error(`el informe no se guardó. La pantalla dice: ${enPantalla}`);
                }
                await dormir(1200);
            });

        // ---- 4. La oficina arma la oferta --------------------------------------
        await g.beat('4 · La oficina arma la oferta',
            'Horas por puesto, materiales de bodega y el total, sobre lo que terreno levantó', async () => {
                await abrirTratamiento(porAprobar.solicitud);
                await clic(page, 'tab-tareas', undefined, { espera: 1300 });
                await dormir(1100);
                await clic(page, 'tab-componentes', undefined, { espera: 1300 });
                await dormir(1100);
                await clic(page, 'tab-cotizacion', undefined, { espera: 1500 });
                await dormir(1400);
            });

        // ---- 5. Programación contra la capacidad real --------------------------
        await g.beat('5 · Se programa contra el turno real',
            'El Gantt cruza el trabajo con las horas que su gente realmente tiene libres', async () => {
                await aEscritorio('/gantt');
                await dormir(2400);
            });

        // ---- 6. El cliente aprueba la oferta ----------------------------------
        await g.beat('6 · El cliente aprueba la oferta',
            'La oferta le aparece en su app y la aprueba desde el teléfono; queda registrado quién y cuándo', async () => {
                await aTelefono(URL.cliente, accesos.cliente.token);
                await sel(page, 'cliente-trabajo').first()
                    .waitFor({ state: 'visible', timeout: 25000 });
                await clic(page, 'cliente-trabajo', porAprobar.solicitud, { espera: 1700 });
                await dormir(1000);
                await clic(page, 'cliente-aceptar-cotizacion', undefined, { espera: 1200 });
                await clic(page, 'cliente-confirmar-aceptacion', undefined, { espera: 2600 });
            });

        // ---- 7. Terreno reporta sin señal y cierra -----------------------------
        await g.beat('7 · Terreno reporta, incluso sin señal',
            'Reporta desde el sitio; sin señal el reporte queda en el teléfono y se envía solo al volver la conexión', async () => {
                // El reporte de terreno y su cola viven en "Mi día", que es la pantalla del rol
                // ejecutor — así que este tramo va con el token del técnico que ejecuta el trabajo,
                // no con el de la supervisora.
                const ejecutor = accesos.operativos.find((o) => o.nombre === accesos.escenas.ejecutor);
                await aOperativa(ejecutor ? ejecutor.token : supervisora.token);
                await clic(page, 'mi-dia-reportar', undefined, { espera: 1500 });
                await escribir(page, 'reporte-comentario', REPORTE, { porCaracter: 9 });
                await dormir(600);

                // Sin señal: el reporte no se pierde, queda en el teléfono.
                await contexto.setOffline(true);
                await dormir(600);
                // Sin pausa después del clic: el aviso "queda en el teléfono" aparece y la pantalla
                // se va sola 1,2 s después (O4 llama nav.volver() tras encolar), así que hay que
                // atraparlo de inmediato.
                await clic(page, 'reporte-enviar', undefined, { espera: 150 });
                await sel(page, 'reporte-aviso-sin-senal').first()
                    .waitFor({ state: 'visible', timeout: 6000 })
                    .catch(() => log('    (el aviso de sin señal no alcanzó a mostrarse)'));

                // Intento opcional de mostrar el contador "N en cola" de Mi día. Normalmente NO
                // aparece, y por una razón del producto que conviene tener clara: Mi día se pinta
                // con los datos del servidor, así que sin señal esa pantalla no se arma. Lo único
                // que sobrevive sin red es la cola de reportes (IndexedDB), no la vista del día.
                // Se deja el intento porque al volver la conexión sí puede alcanzar a verse.
                await sel(page, 'mi-dia-en-cola').first()
                    .waitFor({ state: 'visible', timeout: 4000 })
                    .catch(() => log('    (sin señal Mi día no se arma: el contador no se ve, es lo esperado)'));
                await dormir(1300);

                // Vuelve la señal: la app drena la cola en el evento 'online'. Se recarga Mi día
                // para verlo ya vacío — el contador se lee al montar la pantalla.
                await contexto.setOffline(false);
                await dormir(1300);

                // Cerrar el trabajo lo hace la supervisora, y es lo que descuenta el material.
                await aPanel();
                await clic(page, 'panel-entrada', 'Mis trabajos', { espera: 1100 });
                await clic(page, 'mis-trabajos-fila', enEjecucion.ot, { espera: 1300 });

                // Marcar lo realizado, tarea por tarea: el botón de cerrar está deshabilitado hasta
                // que ninguna quede pendiente (S3: puedeTerminar). Hay que ESPERAR a que la lista
                // esté pintada antes de contar: S3 carga la OT del servidor, y contar demasiado
                // pronto daba cero, el bucle salía de inmediato y el cierre quedaba deshabilitado.
                await sel(page, 'tarea-realizada').first()
                    .waitFor({ state: 'visible', timeout: 25000 });
                for (let vuelta = 0; vuelta < 10; vuelta += 1) {
                    const pendientes = sel(page, 'tarea-realizada', 'no');
                    const cuantas = await pendientes.count();
                    if (cuantas === 0) break;
                    await pendientes.first().click();
                    // Cada clic guarda contra el servidor y vuelve a pintar la lista, así que se
                    // recuenta en la vuelta siguiente en vez de recorrer un arreglo fijo.
                    await dormir(550);
                }
                const quedan = await sel(page, 'tarea-realizada', 'no').count();
                if (quedan > 0) log(`    (quedan ${quedan} tareas sin marcar: el cierre va a estar deshabilitado)`);
                await clic(page, 'trabajo-finalizar', undefined, { espera: 1100 });
                await clicSiEsta(page, 'confirm-aceptar', undefined, { espera: 2000 });
            });

        // ---- 8. La oficina cierra la vuelta -----------------------------------
        await g.beat('8 · La oficina cierra la vuelta',
            'El material salió de bodega solo al cerrarse el trabajo, y los indicadores ya lo reflejan', async () => {
                await aEscritorio('/recursos');
                await clic(page, 'recursos-tab', 'Suministros directos', { espera: 1800 });
                const codigo = accesos.escenas.materialesQueConsume[0];
                if (codigo) {
                    const material = sel(page, 'suministro-fila', codigo).first();
                    await material.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
                    await material.scrollIntoViewIfNeeded().catch(() => {});
                }
                await dormir(1900);
                await aEscritorio('/dashboard');
                await sel(page, 'kpi-franja').first().waitFor({ state: 'visible', timeout: 20000 });
                await dormir(2200);
            });
    } finally {
        const resumen = g.resumen();

        // El orden importa y no es el obvio: saveAs() necesita el NAVEGADOR abierto (solo el
        // contexto tiene que estar cerrado, porque su cierre es lo que termina de escribir el
        // archivo). Al revés falla con "Target page, context or browser has been closed".
        const video = page.video();
        await contexto.close();

        let nombreVideo = null;
        if (video) {
            nombreVideo = 'demo.webm';
            const destino = path.join(SALIDA, nombreVideo);
            fs.rmSync(destino, { force: true });
            await video.saveAs(destino);
            await video.delete().catch(() => {});
        }
        await navegador.close();

        fs.writeFileSync(
            path.join(SALIDA, 'guion.json'),
            `${JSON.stringify({
                generado: new Date().toISOString(),
                video: nombreVideo,
                enVivo: { solicitud: accesos.proximaSolicitud, ot: accesos.proximaOT },
                preparadas: accesos.escenas,
                ...resumen,
            }, null, 2)}\n`,
        );

        log('');
        log(`Duración total: ${resumen.total} s`);
        for (const b of resumen.beats) {
            log(`  ${String(b.inicio).padStart(5)}s → ${String(b.fin).padStart(5)}s  (${String(b.duracion).padStart(4)}s)  ${b.beat}`);
        }
        log('');
        if (nombreVideo) log(`Video:  demo-output/${nombreVideo}`);
        log('Cortes: demo-output/guion.json (rótulo por beat, para ponerlos en la edición)');
    }
}

main().catch((e) => {
    log('');
    log(`Error: ${e.message}`);
    process.exit(1);
});
