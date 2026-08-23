import { useState, useRef, useEffect, useCallback } from 'react';
import { headerEntorno, obtenerEntorno, fijarEntorno } from '../utils/entorno';

// Paso 7 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §9.1):
// se respeta el backend existente tal cual — mismos endpoints, mismos módulos, misma lógica de
// fusión. Solo cambia la presentación: una columna de máx. 860px, marcas ×/· en vez de checkboxes,
// un único .xlsx (sin exportación JSON), y el resultado de importación llega después de escribir
// (no hay dry run). Sin emoji. El modo demostración (§9.2) es el paso 8, no se toca acá.

const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoSecundario3: '#57564f',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    hoverFila: '#f4f3ef',
    acento: 'oklch(0.48 0.10 250)',
    verde: 'oklch(0.48 0.10 155)',
    ambar: 'oklch(0.55 0.11 65)',
    ambarBadge: 'oklch(0.50 0.11 65)',
    rojo: 'oklch(0.52 0.13 25)',
    fondoOT: '#faf8f6',
    inerteBg: '#efedea',
    inerteTexto: '#b5b3ab',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

const EXPORTABLES = [
    { id: 'recursos',    label: 'Personal (Recursos)',      desc: 'nombre, puesto, tipo, telefono, email, tarifaHora' },
    { id: 'suministros', label: 'Suministros',               desc: 'codigo, descripcion, precio, categoria' },
    { id: 'equipos',     label: 'Equipos y herramientas',    desc: 'nombre, codigo, tipo, estado, precio' },
    { id: 'puestos',     label: 'Puestos / especialidades',  desc: 'nombre, costoHora, categoria' },
    { id: 'ots',         label: 'Órdenes de trabajo',        desc: 'numeroOT, solicitante, estado, granTotal, pago…' },
    { id: 'solicitudes', label: 'Solicitudes',               desc: 'solicitante, empresa, descripcion, estado, fecha' },
    { id: 'tipos-trabajo', label: 'Catálogo de tipos de trabajo', desc: '7 hojas: tipos, campos, opciones, listas transversales, sugerencias' },
];

const IMPORTABLES = [
    { id: 'recursos',    label: 'Personal (Recursos)',      columnas: ['nombre *', 'puesto', 'tipo', 'telefono', 'email', 'tarifaHora'] },
    { id: 'suministros', label: 'Suministros',              columnas: ['codigo *', 'descripcion *', 'precio', 'categoria'] },
    { id: 'equipos',     label: 'Equipos y herramientas',   columnas: ['nombre *', 'codigo', 'tipo', 'estado', 'precio'] },
    { id: 'puestos',     label: 'Puestos / especialidades', columnas: ['nombre *', 'costoHora', 'categoria'] },
    // Catálogo del formulario adaptativo (Informe de Evaluación) — ver
    // docs/plan-formulario-adaptativo.md §8. 7 hojas por archivo, no columnas sueltas — la
    // descarga de plantilla es la referencia real, esto es solo para el resumen visual. Las
    // listas transversales (condiciones de entorno, riesgos, materiales, etc.) viven en sus
    // propias hojas, compartidas por casi todos los tipos, no un campo más de cada uno.
    { id: 'tipos-trabajo', label: 'Catálogo de tipos de trabajo', columnas: ['nombre *', 'sinonimos', 'plantillaTexto', 'campos (hoja aparte)', 'opciones (hoja aparte)', 'listas transversales (hoja aparte)', 'sugerencias por tipo (hoja aparte)'] },
];

const ESTADOS_OT = ['Pendiente', 'Tratada', 'Planificada', 'Programada', 'En Ejecución', 'Trabajo Terminado', 'Con Informe', 'Pagada'];

const GRUPOS_DEMO = [
    { label: 'Empresas y solicitudes', detalle: '8 empresas ficticias, 14 solicitudes' },
    { label: 'Órdenes de trabajo', detalle: '12 OT, al menos una por cada etapa del flujo' },
    { label: 'Personal y calendarios', detalle: '8 personas, 4 calendarios (semanal, rotativo, nocturno)' },
    { label: 'Catálogo', detalle: '32 ítems entre suministros y equipos/herramientas' },
    { label: 'Plantillas', detalle: '5 plantillas de tareas y materiales' },
    { label: 'Reportes de terreno', detalle: '18 reportes con fotos de ejemplo' },
    { label: 'Pagos', detalle: 'Órdenes en los tres estados: pendiente, parcial y pagado' },
    { label: 'Historial contable', detalle: '6 meses cerrados de asientos automáticos' },
];

export default function ImportExportScreen({ API, cargarDatos }) {
    // ── EXPORTAR ──
    const [seleccionados, setSeleccionados] = useState(new Set());
    const [filtroOTs, setFiltroOTs] = useState({ desde: '', hasta: '', estado: '' });
    const [exportando, setExportando] = useState(false);

    // ── IMPORTAR ──
    const [resultado, setResultado] = useState(null);
    const [cargando, setCargando] = useState(null);
    const [descargando, setDescargando] = useState(null);
    const inputRefs = useRef({});

    // ── ENTORNO / MODO DEMOSTRACIÓN (§9.2) ──
    const [entorno] = useState(obtenerEntorno());
    const [infoEntornos, setInfoEntornos] = useState(null);
    const [estadoDemo, setEstadoDemo] = useState(null);
    const [accionDemo, setAccionDemo] = useState(null); // 'cargando' | 'vaciando' | null
    const [mostrarVaciar, setMostrarVaciar] = useState(false);
    const [confirmVaciar, setConfirmVaciar] = useState('');

    const cargarInfoEntornos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/demo/info`, { headers: headerEntorno() });
            setInfoEntornos(await r.json());
        } catch { /* no crítico: las tarjetas simplemente no muestran BD/host */ }
    }, [API]);

    const cargarEstadoDemo = useCallback(async () => {
        if (entorno !== 'demo') { setEstadoDemo(null); return; }
        try {
            const r = await fetch(`${API}/demo/estado`, { headers: headerEntorno() });
            setEstadoDemo(await r.json());
        } catch { /* no crítico */ }
    }, [API, entorno]);

    useEffect(() => { cargarInfoEntornos(); }, [cargarInfoEntornos]);
    useEffect(() => { cargarEstadoDemo(); }, [cargarEstadoDemo]);

    // ── USO DE DISCO (adjuntos de solicitudes) ──
    const [usoDisco, setUsoDisco] = useState(null);
    const cargarUsoDisco = useCallback(async () => {
        try {
            const r = await fetch(`${API}/import/uso-disco`, { headers: headerEntorno() });
            setUsoDisco(await r.json());
        } catch { /* no crítico */ }
    }, [API]);
    useEffect(() => { cargarUsoDisco(); }, [cargarUsoDisco]);

    // ── CASOS NO CUBIERTOS (catálogo de tipos de trabajo, formulario adaptativo) ──
    // Se consulta acá mismo (no vía App.jsx/polling global) — mismo criterio que el resto de
    // esta pantalla (uso de disco, estado del entorno demo): bajo demanda, no parte del
    // refresco automático de /api/data. El catálogo en sí ya no se edita en pantalla — solo
    // por Excel (Importar/Exportar de arriba), igual que el resto de los catálogos.
    const [casosNoCubiertos, setCasosNoCubiertos] = useState([]);

    const cargarCasosNoCubiertos = useCallback(async () => {
        try {
            const r = await fetch(`${API}/tipos-trabajo/casos-no-cubiertos`, { headers: headerEntorno() });
            setCasosNoCubiertos(await r.json());
        } catch { /* no crítico */ }
    }, [API]);
    useEffect(() => { cargarCasosNoCubiertos(); }, [cargarCasosNoCubiertos]);

    const cambiarEntorno = (valor) => {
        if (valor === entorno) return;
        fijarEntorno(valor);
        window.location.reload();
    };

    const cargarDemo = async () => {
        setAccionDemo('cargando');
        try {
            const r = await fetch(`${API}/demo/cargar`, { method: 'POST', headers: headerEntorno() });
            const d = await r.json();
            if (!r.ok) { setResultado({ error: d.error, modulo: 'Modo demostración' }); return; }
            await cargarEstadoDemo();
            if (cargarDatos) cargarDatos();
        } catch {
            setResultado({ error: 'No se pudo cargar el juego de demostración', modulo: 'Modo demostración' });
        } finally {
            setAccionDemo(null);
        }
    };

    const vaciarDemo = async () => {
        if (confirmVaciar !== 'VACIAR') return;
        setAccionDemo('vaciando');
        try {
            const r = await fetch(`${API}/demo/vaciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headerEntorno() },
                body: JSON.stringify({ confirmacion: confirmVaciar }),
            });
            const d = await r.json();
            if (!r.ok) { setResultado({ error: d.error, modulo: 'Modo demostración' }); return; }
            setConfirmVaciar('');
            setMostrarVaciar(false);
            await cargarEstadoDemo();
            if (cargarDatos) cargarDatos();
        } catch {
            setResultado({ error: 'No se pudo vaciar el entorno demo', modulo: 'Modo demostración' });
        } finally {
            setAccionDemo(null);
        }
    };

    // ── LÓGICA EXPORTAR (sin cambios de backend) ──
    const toggleSeleccion = (id) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const seleccionarTodos = () => setSeleccionados(new Set(EXPORTABLES.map(e => e.id)));
    const seleccionarNinguno = () => setSeleccionados(new Set());

    const exportar = async () => {
        if (!seleccionados.size) return;
        setExportando(true);
        const params = new URLSearchParams({ modulos: [...seleccionados].join(',') });
        if (seleccionados.has('ots')) {
            if (filtroOTs.desde) params.set('otDesde', filtroOTs.desde);
            if (filtroOTs.hasta) params.set('otHasta', filtroOTs.hasta);
            if (filtroOTs.estado) params.set('otEstado', filtroOTs.estado);
        }
        const url = `${API}/import/exportar/batch?${params}`;
        try {
            // fetch + blob (no un <a href> directo) para poder mandar el header X-Entorno:
            // un enlace de descarga plano no permite headers custom.
            const r = await fetch(url, { headers: headerEntorno() });
            if (!r.ok) throw new Error('No se pudo generar el archivo');
            const blob = await r.blob();
            const fecha = new Date().toISOString().slice(0, 10);
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = `exportacion_erp_${fecha}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
        } catch {
            setResultado({ error: 'No se pudo generar el archivo de exportación', modulo: 'Exportar' });
        } finally {
            setExportando(false);
        }
    };

    // ── LÓGICA IMPORTAR (sin dry run: el backend responde después de escribir) ──
    const importar = async (mod, archivo) => {
        if (!archivo) return;
        setCargando(mod.id);
        setResultado(null);
        const form = new FormData();
        form.append('archivo', archivo);
        try {
            const r = await fetch(`${API}/import/${mod.id}`, { method: 'POST', headers: headerEntorno(), body: form });
            const d = await r.json();
            if (!r.ok) { setResultado({ error: d.error, modulo: mod.label }); return; }
            setResultado({ ...d, modulo: mod.label });
            if (cargarDatos) cargarDatos();
        } catch (e) {
            setResultado({ error: e.message, modulo: mod.label });
        } finally {
            setCargando(null);
            if (inputRefs.current[mod.id]) inputRefs.current[mod.id].value = '';
        }
    };

    const descargarPlantilla = (id) => window.open(`${API}/import/plantilla/${id}`, '_blank');

    // Descarga lo que ya está cargado para ese módulo (mismo endpoint de exportarBatch,
    // acotado a un solo módulo) — para poder partir de un archivo real y mejorarlo, en vez
    // de siempre partir de la plantilla vacía.
    const descargarActual = async (mod) => {
        setDescargando(mod.id);
        try {
            const r = await fetch(`${API}/import/exportar/batch?modulos=${mod.id}`, { headers: headerEntorno() });
            if (!r.ok) throw new Error('No se pudo generar el archivo');
            const blob = await r.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = `${mod.id}_actual.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
        } catch {
            setResultado({ error: 'No se pudo descargar la información cargada actualmente', modulo: mod.label });
        } finally {
            setDescargando(null);
        }
    };

    const algunoSeleccionado = seleccionados.size > 0;

    return (
        <div style={styles.raiz}>
            <header style={styles.header}>
                <h1 style={styles.h1}>Importar y exportar</h1>
                <span style={styles.subtitulo}>Carga y descarga de información del ERP en formato .xlsx</span>
            </header>

            <div style={styles.scroll}>
                <div style={styles.columna}>

                    {/* ── ENTORNO DE TRABAJO (§9.2) ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Entorno de trabajo</span>
                        </div>
                        <div style={styles.notaBloque}>Producción son los datos reales del taller. Demostración es una base separada, ficticia, pensada para mostrar el sistema sin riesgo.</div>

                        <div style={styles.gridEntornos}>
                            {[
                                { id: 'produccion', nombre: 'Producción', consecuencia: 'Los cambios aquí son reales y afectan al taller.' },
                                { id: 'demo', nombre: 'Demostración', consecuencia: 'Los datos son ficticios y se pueden vaciar cuando quieras.' },
                            ].map(env => {
                                const info = infoEntornos?.[env.id];
                                const activa = entorno === env.id;
                                const disponible = info ? info.disponible : env.id === 'produccion';
                                return (
                                    <div
                                        key={env.id}
                                        onClick={() => disponible && cambiarEntorno(env.id)}
                                        style={{
                                            ...styles.tarjetaEntorno,
                                            borderLeft: activa ? '3px solid #1c1d1b' : `1px solid ${t.bordeZona}`,
                                            background: activa ? '#f0efeb' : t.superficie,
                                            cursor: disponible ? 'pointer' : 'not-allowed',
                                            opacity: disponible ? 1 : .55,
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                            <span style={{ fontSize: 13, fontWeight: 700 }}>{env.nombre}</span>
                                            {activa && <span style={{ fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: t.textoAtenuado2 }}>Activo</span>}
                                        </div>
                                        <div style={{ fontFamily: t.fontMono, fontSize: 10.5, color: t.textoAtenuado2, marginTop: 4 }}>
                                            {info ? (disponible ? `${info.db} · ${info.host}` : 'no configurado (falta MONGO_URI_DEMO)') : '—'}
                                        </div>
                                        <div style={{ fontSize: 11, color: t.textoSecundario3, marginTop: 6 }}>{env.consecuencia}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── USO DE DISCO (adjuntos de solicitudes) ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Uso de disco · adjuntos</span>
                            <button onClick={cargarUsoDisco} style={styles.btnSecundario}>Actualizar</button>
                        </div>
                        <div style={styles.notaBloque}>Fotos y archivos subidos desde solicitudes — se acumulan sin borrado automático.</div>
                        {!usoDisco ? (
                            <div style={{ fontSize: 11, color: t.textoAtenuado2 }}>Calculando…</div>
                        ) : (
                            <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontFamily: t.fontMono, fontSize: 20, fontWeight: 700 }}>{usoDisco.mb < 1 ? `${(usoDisco.bytes / 1024).toFixed(0)} KB` : `${usoDisco.mb} MB`}</div>
                                    <div style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>{usoDisco.archivos} archivo{usoDisco.archivos === 1 ? '' : 's'}</div>
                                </div>
                                <div>
                                    <div style={{ fontFamily: t.fontMono, fontSize: 20, fontWeight: 700, color: t.acento }}>
                                        {usoDisco.costoEstimadoMensualUSD < 0.01 ? '< US$ 0,01' : `US$ ${usoDisco.costoEstimadoMensualUSD.toFixed(2)}`}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>estimado / mes en disco persistente</div>
                                </div>
                            </div>
                        )}
                        <div style={{ fontSize: 10, color: t.textoAtenuado3, marginTop: 10 }}>
                            Estimado a US$ {usoDisco?.tarifaUsadaUSDPorGBMes ?? '0.25'} por GB al mes — tarifa de referencia, no un dato que Render entregue en tiempo real.
                        </div>
                    </section>

                    {/* ── JUEGO DE DEMOSTRACIÓN (§9.2) ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Juego de demostración</span>
                            {entorno === 'demo' && estadoDemo && (
                                <span style={{ fontSize: 11, color: t.textoAtenuado2 }}>
                                    {estadoDemo.cargado ? `Cargado · ${estadoDemo.registros} registros` : 'No cargado'}
                                    {estadoDemo.cargado && estadoDemo.fecha ? ` · ${new Date(estadoDemo.fecha).toLocaleString('es-CL')}` : ''}
                                </span>
                            )}
                        </div>
                        <div style={styles.notaBloque}>8 grupos de contenido ficticio para explorar el sistema sin usar datos reales.</div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {GRUPOS_DEMO.map(g => (
                                <div key={g.label} style={styles.filaGrupoDemo}>
                                    <span style={{ fontSize: 12, fontWeight: 600, width: 190, flex: 'none' }}>{g.label}</span>
                                    <span style={{ fontSize: 11, color: t.textoAtenuado2 }}>{g.detalle}</span>
                                </div>
                            ))}
                        </div>

                        {entorno !== 'produccion' ? null : (
                            <div style={styles.franjaDemoInerte}>Estas acciones solo están disponibles con el entorno de demostración activo.</div>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                                onClick={cargarDemo}
                                disabled={entorno !== 'demo' || accionDemo !== null || estadoDemo?.cargado}
                                style={entorno === 'demo' && !estadoDemo?.cargado && !accionDemo ? styles.btnSecundario : styles.btnDemoInerte}
                            >
                                {accionDemo === 'cargando' && !estadoDemo?.cargado ? 'Cargando…' : 'Cargar'}
                            </button>
                            <button
                                onClick={cargarDemo}
                                disabled={entorno !== 'demo' || accionDemo !== null || !estadoDemo?.cargado}
                                style={entorno === 'demo' && estadoDemo?.cargado && !accionDemo ? styles.btnSecundario : styles.btnDemoInerte}
                            >
                                {accionDemo === 'cargando' && estadoDemo?.cargado ? 'Regenerando…' : 'Regenerar'}
                            </button>
                            <button
                                onClick={() => setMostrarVaciar(v => !v)}
                                disabled={entorno !== 'demo' || accionDemo !== null || !estadoDemo?.cargado}
                                style={entorno === 'demo' && estadoDemo?.cargado && !accionDemo ? styles.btnDemoRojo : styles.btnDemoInerte}
                            >
                                Vaciar
                            </button>
                        </div>

                        {mostrarVaciar && entorno === 'demo' && (
                            <div style={styles.filtroOT}>
                                <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginBottom: 8 }}>
                                    Esto borra todo el contenido del entorno demo. Escribe <strong>VACIAR</strong> para confirmar.
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        value={confirmVaciar}
                                        onChange={e => setConfirmVaciar(e.target.value)}
                                        placeholder="VACIAR"
                                        style={{ ...styles.inputPlano, width: 140 }}
                                    />
                                    <button
                                        onClick={vaciarDemo}
                                        disabled={confirmVaciar !== 'VACIAR' || accionDemo !== null}
                                        style={confirmVaciar === 'VACIAR' && !accionDemo ? styles.btnDemoRojo : styles.btnDemoInerte}
                                    >
                                        {accionDemo === 'vaciando' ? 'Vaciando…' : 'Confirmar vaciado'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── EXPORTAR ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Exportar a Excel</span>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <span onClick={seleccionarTodos} style={styles.linkAccion}>Todos</span>
                                <span onClick={seleccionarNinguno} style={styles.linkAccion}>Ninguno</span>
                            </div>
                        </div>
                        <div style={styles.notaBloque}>Un archivo con una hoja por módulo seleccionado.</div>

                        <div>
                            {EXPORTABLES.map(mod => {
                                const sel = seleccionados.has(mod.id);
                                return (
                                    <div key={mod.id} onClick={() => toggleSeleccion(mod.id)} style={{ ...styles.filaSeleccion, background: sel ? t.hoverFila : 'transparent' }}>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: sel ? t.textoPrincipal : t.textoDeshabilitado, width: 12, flex: 'none' }}>{sel ? '×' : '·'}</span>
                                        <span style={{ fontSize: 12.5, fontWeight: 600, width: 190, flex: 'none' }}>{mod.label}</span>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 10, color: t.textoAtenuado3, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.desc}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {seleccionados.has('ots') && (
                            <div style={styles.filtroOT}>
                                <div style={styles.tituloSub}>Filtros para OT (opcional)</div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <label style={styles.campoLabel}>
                                        <span style={styles.etiqueta}>Desde</span>
                                        <input type="date" style={styles.inputPlano} value={filtroOTs.desde} onChange={e => setFiltroOTs(p => ({ ...p, desde: e.target.value }))} />
                                    </label>
                                    <label style={styles.campoLabel}>
                                        <span style={styles.etiqueta}>Hasta</span>
                                        <input type="date" style={styles.inputPlano} value={filtroOTs.hasta} onChange={e => setFiltroOTs(p => ({ ...p, hasta: e.target.value }))} />
                                    </label>
                                    <label style={styles.campoLabel}>
                                        <span style={styles.etiqueta}>Estado</span>
                                        <select style={styles.inputPlano} value={filtroOTs.estado} onChange={e => setFiltroOTs(p => ({ ...p, estado: e.target.value }))}>
                                            <option value="">Todos</option>
                                            {ESTADOS_OT.map(e => <option key={e}>{e}</option>)}
                                        </select>
                                    </label>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={exportar}
                            disabled={!algunoSeleccionado || exportando}
                            style={algunoSeleccionado ? styles.btnPrimario : styles.btnInerte}
                        >
                            {exportando ? 'Generando…' : `Exportar${algunoSeleccionado ? ` (${seleccionados.size} módulo${seleccionados.size > 1 ? 's' : ''})` : ''}`}
                        </button>
                    </section>

                    {/* ── IMPORTAR ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Importar desde Excel</span>
                        </div>
                        <div style={styles.notaBloque}>Descarga la plantilla, complétala y sube el archivo.</div>

                        {resultado && (
                            <div style={{ ...styles.resultado, borderLeftColor: resultado.error ? t.rojo : (resultado.errores?.length ? t.ambar : t.verde) }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{resultado.modulo}</div>
                                    {resultado.error ? (
                                        <div style={{ fontSize: 11.5, color: t.rojo, marginTop: 3 }}>{resultado.error}</div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 11.5, color: t.textoSecundario2, marginTop: 3 }}>
                                                {resultado.insertados} importados de {resultado.total} filas
                                            </div>
                                            {resultado.errores?.length > 0 && (
                                                <details style={{ marginTop: 6 }}>
                                                    <summary style={{ cursor: 'pointer', fontSize: 11, color: t.ambar }}>{resultado.errores.length} fila(s) con error</summary>
                                                    <ul style={{ margin: '5px 0 0', paddingLeft: 16, fontFamily: t.fontMono, fontSize: 10.5, color: t.textoSecundario3, lineHeight: 1.6 }}>
                                                        {resultado.errores.map((e, i) => <li key={i}>Fila {e.fila}: {e.motivo}</li>)}
                                                    </ul>
                                                </details>
                                            )}
                                        </>
                                    )}
                                </div>
                                <span onClick={() => setResultado(null)} style={styles.xResultado}>×</span>
                            </div>
                        )}

                        <div style={styles.gridImportar}>
                            {IMPORTABLES.map(mod => (
                                <div key={mod.id} style={styles.tarjeta}>
                                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{mod.label}</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                        {mod.columnas.map(c => {
                                            const oblig = c.includes('*');
                                            return (
                                                <span key={c} style={{ ...styles.badge, background: oblig ? '#fdf3e6' : '#f0efeb', color: oblig ? t.ambarBadge : t.textoSecundario3 }}>{c}</span>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                        <button onClick={() => descargarPlantilla(mod.id)} style={styles.btnSecundario}>Plantilla</button>
                                        <button onClick={() => descargarActual(mod)} disabled={descargando === mod.id} style={styles.btnSecundario}>
                                            {descargando === mod.id ? 'Descargando…' : 'Descargar actual'}
                                        </button>
                                        <label style={{ ...styles.btnImportar, opacity: cargando === mod.id ? .6 : 1, cursor: cargando === mod.id ? 'wait' : 'pointer' }}>
                                            {cargando === mod.id ? 'Cargando…' : 'Importar'}
                                            <input
                                                type="file"
                                                accept=".xlsx,.xls,.csv"
                                                style={{ display: 'none' }}
                                                ref={el => { inputRefs.current[mod.id] = el; }}
                                                onChange={e => importar(mod, e.target.files[0])}
                                                disabled={!!cargando}
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={styles.notaPie}>
                            <strong>*</strong> obligatorio. Suministros y Puestos: si el código/nombre ya existe, se actualiza — Personal y Equipos siempre crean registros nuevos. Las filas con error se omiten sin afectar a las demás.
                        </div>
                    </section>

                    {/* ── CASOS NO CUBIERTOS (plan §9) ── */}
                    <section style={styles.bloque}>
                        <div style={styles.bloqueHeader}>
                            <span style={styles.tituloSub}>Casos no cubiertos</span>
                            <span style={{ fontSize: 11, color: t.textoAtenuado2 }}>{casosNoCubiertos.length}</span>
                        </div>
                        <div style={styles.notaBloque}>Hallazgos donde el supervisor no usó (o editó a mano) el catálogo — señal de qué falta agregar, no un bloqueo.</div>
                        {casosNoCubiertos.length === 0 ? (
                            <div style={{ fontSize: 11.5, color: t.textoAtenuado2, padding: '8px 0' }}>Sin casos pendientes de revisión.</div>
                        ) : (
                            <div>
                                {casosNoCubiertos.map(c => (
                                    <div key={c.hallazgoId} style={{ padding: '8px 0', borderBottom: `1px solid ${t.hairlineFila}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ fontFamily: t.fontMono, fontSize: 11 }}>{c.numeroOT}</span>
                                            <span style={{ fontSize: 10.5, color: t.textoAtenuado2 }}>{c.tieneTipoTrabajo ? 'tipo editado a mano' : 'sin tipo elegido'} · {new Date(c.fecha).toLocaleDateString('es-CL')}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: t.textoSecundario2, marginTop: 3 }}>{c.texto || '(sin texto)'}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', height: 46, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

    scroll: { flex: 1, minHeight: 0, overflow: 'auto' },
    columna: { maxWidth: 860, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 },

    bloque: { background: t.superficie, border: `1px solid ${t.bordeZona}`, borderRadius: 2, padding: 16 },
    bloqueHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
    tituloSub: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3 },
    notaBloque: { fontSize: 11, color: t.textoAtenuado2, marginTop: 4, marginBottom: 10 },
    linkAccion: { fontSize: 11, color: t.acento, cursor: 'pointer' },

    filaSeleccion: { display: 'flex', alignItems: 'center', gap: 10, height: 34, padding: '0 8px', cursor: 'pointer', borderBottom: `1px solid ${t.hairlineFila}` },

    filtroOT: { marginTop: 12, padding: '10px 12px', background: t.fondoOT, borderRadius: 2 },
    campoLabel: { display: 'flex', flexDirection: 'column', gap: 3 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    inputPlano: { height: 27, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, outline: 'none', borderRadius: 2 },

    btnPrimario: { width: '100%', height: 30, marginTop: 14, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    btnInerte: { width: '100%', height: 30, marginTop: 14, background: t.inerteBg, border: `1px solid ${t.inerteBg}`, color: t.inerteTexto, fontSize: 12, fontWeight: 700, cursor: 'not-allowed', borderRadius: 2, fontFamily: t.fontUi },
    btnSecundario: { height: 27, padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11.5, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },
    btnImportar: { height: 27, padding: '0 12px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 11.5, fontWeight: 600, borderRadius: 2, whiteSpace: 'nowrap', textAlign: 'center', flex: 1, fontFamily: t.fontUi },

    resultado: { display: 'flex', gap: 10, alignItems: 'flex-start', background: t.fondoMain, borderLeft: '2px solid', padding: '8px 10px', marginBottom: 12 },
    xResultado: { fontFamily: t.fontMono, fontSize: 13, color: t.textoDeshabilitado, cursor: 'pointer', flex: 'none' },

    gridImportar: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
    tarjeta: { border: `1px solid ${t.bordeZona}`, borderRadius: 2, padding: '12px 14px' },
    badge: { padding: '2px 6px', borderRadius: 2, fontSize: 10, fontFamily: t.fontMono },

    notaPie: { fontSize: 10.5, color: t.textoAtenuado2, marginTop: 14, lineHeight: 1.6 },

    gridEntornos: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
    tarjetaEntorno: { borderRadius: 2, padding: '12px 14px', transition: 'background .1s' },
    filaGrupoDemo: { display: 'flex', alignItems: 'center', gap: 10, height: 28, borderBottom: `1px solid ${t.hairlineFila}` },
    franjaDemoInerte: { fontSize: 11, color: t.textoAtenuado2, marginTop: 12, padding: '8px 10px', background: t.inerteBg, borderRadius: 2 },
    btnDemoInerte: { height: 27, padding: '0 14px', background: t.inerteBg, border: `1px solid ${t.inerteBg}`, color: t.inerteTexto, fontSize: 11.5, fontWeight: 600, cursor: 'not-allowed', borderRadius: 2, fontFamily: t.fontUi },
    btnDemoRojo: { height: 27, padding: '0 14px', background: t.superficie, border: `1px solid ${t.rojo}`, color: t.rojo, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
};
