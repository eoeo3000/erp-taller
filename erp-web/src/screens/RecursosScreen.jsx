import React, { useState } from 'react';
import { notificar, confirmar } from '../utils/notificar';

// Paso 5 del rediseño (ver docs/rediseno/design_handoff_panel_control/README.md §7):
// 5 tabs (Personal · Equipos y herramientas · Suministros directos · Calendarios · Plantillas),
// matriz mensual real (usa obtenerHorasParaDia, no la indexación getDay()===0 que asumía el mock —
// nuestro Calendario real guarda 'config' por nombre de día o por ciclo, no un array plano de 7
// horas, ver Gap 5 de la sesión anterior), panel derecho con Resumen + bloque contextual. Los
// modales de creación de Equipos/Suministros se reemplazan por filas editables con botón punteado,
// mismo patrón que Tratamiento. Sin emoji.

const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    encabezadoTabla: '#e4e2dc',
    barraContexto: '#e9e7e2',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    acento: 'oklch(0.48 0.10 250)',
    verde: 'oklch(0.48 0.10 155)',
    ambar: 'oklch(0.55 0.11 65)',
    rojo: 'oklch(0.52 0.13 25)',
    cargaOk: '#eef4ef',
    cargaExceso: '#fbeceb',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

const CLP = n => '$ ' + Math.round(n || 0).toLocaleString('es-CL');
const DIAS_L = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const estadoInicialCalendario = {
    nombre: '', tipo: 'semanal', cicloDias: 7,
    config: [
        { dia: 'lun', activo: true, bloques: [] }, { dia: 'mar', activo: true, bloques: [] },
        { dia: 'mié', activo: true, bloques: [] }, { dia: 'jue', activo: true, bloques: [] },
        { dia: 'vie', activo: true, bloques: [] }, { dia: 'sáb', activo: false, bloques: [] },
        { dia: 'dom', activo: false, bloques: [] }
    ]
};
const plantillaVacia = { nombre: '', categoria: 'General', descripcion: '', procedimiento: '', tareas: [], componentes: [], logistica: [] };

const TABS = ['Personal', 'Equipos y herramientas', 'Suministros directos', 'Calendarios', 'Plantillas'];

const RecursosScreen = ({
    recursos = [], calendarios = [], actualizarRecurso, eliminarRecurso, crearRecurso,
    crearSuministro, eliminarSuministro, guardarCalendarioGlobal, obtenerHorasParaDia,
    asignarCalendario, guardarCambioManualGlobal, eliminarCalendarioMaestro,
    componentes = [], suministros = [], actualizarSuministro, ajustarStockSuministro,
    obtenerMovimientosStock, crearEquipo, eliminarEquipo, crearPuesto, eliminarPuesto,
    puestosDB = [], actualizarEquipo, plantillas = [], crearPlantilla, actualizarPlantilla, eliminarPlantilla,
}) => {
    const [tabActiva, setTabActiva] = useState('Personal');
    const [asideOculta, setAsideOculta] = useState(false);

    // Personal / matriz
    const [anio, setAnio] = useState(new Date().getFullYear());
    const [mes, setMes] = useState(new Date().getMonth());
    const [ajusteManual, setAjusteManual] = useState(null); // { recursoId, nombre, dia, horas }
    const [formIntegrante, setFormIntegrante] = useState(null); // objeto de formulario o null = cerrado

    // Calendarios
    const [nuevoCal, setNuevoCal] = useState(estadoInicialCalendario);
    const [calSeleccionado, setCalSeleccionado] = useState(null); // id, o 'nuevo'

    // Plantillas
    const [modalPlantilla, setModalPlantilla] = useState(false);
    const [plantillaEditando, setPlantillaEditando] = useState(null);
    const [formPlantilla, setFormPlantilla] = useState(plantillaVacia);

    // Puestos (bloque contextual de Personal)
    const [nuevoPuestoNombre, setNuevoPuestoNombre] = useState('');
    const [nuevoPuestoCosto, setNuevoPuestoCosto] = useState('');

    // Historial de stock
    const [historial, setHistorial] = useState(null); // { item, movimientos } o null

    const cantidadDias = new Date(anio, mes + 1, 0).getDate();
    const diasDelMes = Array.from({ length: cantidadDias }, (_, i) => {
        const fecha = new Date(anio, mes, i + 1);
        return { numero: i + 1, esFinde: fecha.getDay() === 0 || fecha.getDay() === 6, fechaCompleta: fecha };
    });

    const abrirHistorial = async (item) => {
        const movimientos = await obtenerMovimientosStock(item._id);
        setHistorial({ item, movimientos });
    };
    const ajustarStockRapido = async (item, signo) => {
        const valor = window.prompt(`${signo > 0 ? 'Ingresar' : 'Retirar'} stock de "${item.descripcion}" (unidades):`, '1');
        if (!valor) return;
        const cantidad = Math.abs(Number(valor)) * signo;
        if (!cantidad) return;
        const motivo = window.prompt('Motivo (opcional):', '') || '';
        await ajustarStockSuministro(item._id, cantidad, motivo);
    };

    const prepararEdicionCal = (cal) => {
        const copia = JSON.parse(JSON.stringify(cal));
        if (!copia.config?.length) copia.config = JSON.parse(JSON.stringify(estadoInicialCalendario.config));
        setNuevoCal(copia);
        setCalSeleccionado(cal._id);
    };
    const nuevoCalendario = () => {
        setNuevoCal(JSON.parse(JSON.stringify(estadoInicialCalendario)));
        setCalSeleccionado('nuevo');
    };
    const actualizarDiasCiclo = (nuevoTotal) => {
        const total = isNaN(nuevoTotal) || nuevoTotal < 1 ? 1 : nuevoTotal;
        setNuevoCal(prev => {
            let cfg = [...prev.config];
            if (total > cfg.length) {
                const nuevos = Array.from({ length: total - cfg.length }, (_, i) => ({ dia: `Día ${cfg.length + i + 1}`, activo: true, bloques: [] }));
                cfg = [...cfg, ...nuevos];
            } else cfg = cfg.slice(0, total);
            return { ...prev, cicloDias: total, config: cfg, tipo: prev.tipo === 'semanal' && total !== 7 ? 'rotativo' : prev.tipo };
        });
    };
    const actualizarHora = (diaIdx, bloqueIdx, campo, valor) => {
        setNuevoCal(prev => {
            const copia = JSON.parse(JSON.stringify(prev));
            if (copia.config[diaIdx]?.bloques[bloqueIdx]) copia.config[diaIdx].bloques[bloqueIdx][campo] = valor;
            return copia;
        });
    };
    const agregarBloque = (diaIdx) => setNuevoCal(prev => {
        const copia = JSON.parse(JSON.stringify(prev));
        if (!copia.config[diaIdx].bloques) copia.config[diaIdx].bloques = [];
        copia.config[diaIdx].bloques.push({ inicio: '08:00', fin: '17:00' });
        return copia;
    });
    const eliminarBloque = (diaIdx, bloqueIdx) => setNuevoCal(prev => {
        const copia = JSON.parse(JSON.stringify(prev));
        copia.config[diaIdx].bloques.splice(bloqueIdx, 1);
        return copia;
    });
    const calcularHorasBloques = (bloques) => (bloques || []).reduce((total, b) => {
        if (!b.inicio || !b.fin) return total;
        const [hI, mI] = b.inicio.split(':').map(Number);
        const [hF, mF] = b.fin.split(':').map(Number);
        return total + ((hF * 60 + mF) - (hI * 60 + mI)) / 60;
    }, 0);
    const guardarCalendario = async () => {
        const editandoId = calSeleccionado !== 'nuevo' ? calSeleccionado : null;
        const exito = await guardarCalendarioGlobal(nuevoCal, editandoId);
        if (exito) { setCalSeleccionado(null); setNuevoCal(estadoInicialCalendario); }
        else notificar.error('Error al guardar en el servidor');
    };

    const guardarIntegrante = async () => {
        if (!formIntegrante.nombre) { notificar.advertencia('El nombre es obligatorio'); return; }
        if (formIntegrante._id) {
            const r = await actualizarRecurso(formIntegrante._id, formIntegrante);
            if (!r.success) { notificar.error('Hubo un error al guardar los cambios.'); return; }
        } else {
            await crearRecurso(formIntegrante);
        }
        setFormIntegrante(null);
    };

    const guardarPlantilla = async () => {
        if (!formPlantilla.nombre.trim()) { notificar.advertencia('El nombre es obligatorio'); return; }
        if (plantillaEditando) await actualizarPlantilla(plantillaEditando, formPlantilla);
        else await crearPlantilla(formPlantilla);
        setModalPlantilla(false);
        setPlantillaEditando(null);
    };

    const resumen = [
        { label: 'Personal', valor: recursos.length },
        { label: 'Equipos y herramientas', valor: componentes.length },
        { label: 'Suministros directos', valor: suministros.length },
        { label: 'Calendarios', valor: calendarios.length },
        { label: 'Plantillas', valor: plantillas.length },
    ];

    return (
        <div style={styles.raiz}>
            <style>{`
                .campo-ed { border:1px solid transparent; background:transparent; }
                .campo-ed:hover { border-color: rgba(0,0,0,.14); }
                .campo-ed:focus { border-color: ${t.acento}; background:#fff; outline:none; }
            `}</style>

            <header style={styles.header}>
                <h1 style={styles.h1}>Recursos</h1>
                <span style={styles.subtitulo}>Personal, activos, catálogo y turnos que alimentan la programación</span>
            </header>

            <div style={styles.tabs}>
                {TABS.map(tabName => (
                    <button key={tabName} onClick={() => setTabActiva(tabName)} style={tabActiva === tabName ? styles.tabActivo : styles.tab}>{tabName}</button>
                ))}
            </div>

            <div style={styles.cuerpo}>
                <section style={styles.contenido}>

                    {/* PERSONAL — matriz mensual */}
                    {tabActiva === 'Personal' && (
                        <>
                            <div style={styles.barraContexto}>
                                <span style={styles.etiquetaBarra}>Carga horaria</span>
                                <button onClick={() => { if (mes === 0) { setMes(11); setAnio(anio - 1); } else setMes(mes - 1); }} style={styles.btnSecundario}>Anterior</button>
                                <span style={{ fontFamily: t.fontMono, fontSize: 11.5, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>
                                    {new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' }).format(new Date(anio, mes))}
                                </span>
                                <button onClick={() => { if (mes === 11) { setMes(0); setAnio(anio + 1); } else setMes(mes + 1); }} style={styles.btnSecundario}>Siguiente</button>
                                <span style={{ fontSize: 10.5, color: t.textoAtenuado3, marginLeft: 8 }}>Clic en una celda para ajustar manualmente las horas de ese día</span>
                            </div>
                            <div style={styles.scrollTabla}>
                                <div style={{ minWidth: 240 + cantidadDias * 27 }}>
                                    <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}` }}>
                                        <span style={{ width: 188, flex: 'none', padding: '0 10px', height: 30, display: 'flex', alignItems: 'center', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700, background: t.encabezadoTabla, position: 'sticky', left: 0, zIndex: 4 }}>Recurso · turno</span>
                                        <span style={{ width: 52, flex: 'none', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 }}>Mes</span>
                                        {diasDelMes.map(d => (
                                            <span key={d.numero} style={{ width: 27, flex: 'none', height: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: d.esFinde ? '#dedcd5' : t.encabezadoTabla, borderLeft: `1px solid ${t.hairlineFila}` }}>
                                                <span style={{ fontSize: 8.5, color: t.textoAtenuado3 }}>{DIAS_L[d.fechaCompleta.getDay()]}</span>
                                                <span style={{ fontFamily: t.fontMono, fontSize: 10, fontWeight: 600 }}>{d.numero}</span>
                                            </span>
                                        ))}
                                    </div>
                                    {recursos.map(r => {
                                        const cal = calendarios.find(c => String(c._id) === String(r.calendarioId));
                                        let totalMes = 0;
                                        return (
                                            <div key={r._id} style={{ display: 'flex', borderBottom: `1px solid ${t.hairlineFila}` }}>
                                                <span style={{ width: 188, flex: 'none', padding: '5px 10px', background: t.superficie, position: 'sticky', left: 0, zIndex: 2, borderRight: `1px solid ${t.bordeZona}` }}>
                                                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                                                        <span onClick={() => setFormIntegrante({ _id: r._id, nombre: r.nombre, puesto: r.puesto || '', calendarioId: r.calendarioId || '', fechaInicioCiclo: r.fechaInicioCiclo ? r.fechaInicioCiclo.split('T')[0] : '', email: r.email || '', telefono: r.telefono || '' })} style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{r.nombre}</span>
                                                        <span onClick={async () => { if (await confirmar(`¿Eliminar a ${r.nombre}?`)) eliminarRecurso(r._id); }} style={styles.xFila}>×</span>
                                                    </span>
                                                    <span style={{ display: 'flex', gap: 6, fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                                                        <span style={{ color: t.textoAtenuado3, flex: 'none' }}>{r.puesto || 'Sin cargo'}</span>
                                                        <select className="campo-ed" style={{ fontSize: 10.5, color: cal ? t.textoSecundario1 : t.ambar, border: 'none', background: 'transparent', overflow: 'hidden', textOverflow: 'ellipsis' }} value={r.calendarioId || ''} onChange={e => asignarCalendario(r._id, e.target.value)}>
                                                            <option value="">Sin turno</option>
                                                            {calendarios.map(c => <option key={c._id} value={c._id}>{c.nombre}</option>)}
                                                        </select>
                                                    </span>
                                                </span>
                                                <span style={{ width: 52, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontFamily: t.fontMono, fontSize: 11, fontWeight: 600 }}>
                                                    {(() => {
                                                        totalMes = diasDelMes.reduce((sum, d) => {
                                                            const base = obtenerHorasParaDia(r, d);
                                                            const key = d.fechaCompleta.toISOString().split('T')[0];
                                                            const ajuste = r.ajustes && r.ajustes[key];
                                                            return sum + (ajuste !== undefined ? Number(ajuste) : base);
                                                        }, 0);
                                                        return Number.isInteger(totalMes) ? totalMes : totalMes.toFixed(1);
                                                    })()}
                                                </span>
                                                {diasDelMes.map(d => {
                                                    const horasBase = obtenerHorasParaDia(r, d);
                                                    const diaKey = d.fechaCompleta.toISOString().split('T')[0];
                                                    const ajusteExistente = r.ajustes && r.ajustes[diaKey];
                                                    const esManual = ajusteExistente !== undefined;
                                                    const horasFinales = esManual ? Number(ajusteExistente) : horasBase;
                                                    return (
                                                        <span
                                                            key={diaKey}
                                                            onClick={() => setAjusteManual({ recursoId: r._id, nombre: r.nombre, dia: diaKey, horas: horasFinales })}
                                                            style={{
                                                                width: 27, flex: 'none', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                background: d.esFinde ? '#f3f6f9' : t.superficie, borderLeft: `1px solid ${t.hairlineFila}`,
                                                                borderTop: esManual ? `2px solid ${t.ambar}` : '2px solid transparent',
                                                                fontFamily: t.fontMono, fontSize: 11, color: horasFinales > 0 ? t.textoPrincipal : '#ddd', cursor: 'pointer',
                                                            }}
                                                        >{horasFinales > 0 ? (Number.isInteger(horasFinales) ? horasFinales : horasFinales.toFixed(1)) : '·'}</span>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ padding: '8px 16px' }}>
                                {formIntegrante ? (
                                    <div style={styles.formInline}>
                                        <input className="campo-ed" style={styles.inputPlano} placeholder="Nombre" value={formIntegrante.nombre} onChange={e => setFormIntegrante(f => ({ ...f, nombre: e.target.value }))} />
                                        <select className="campo-ed" style={styles.inputPlano} value={formIntegrante.puesto || ''} onChange={e => setFormIntegrante(f => ({ ...f, puesto: e.target.value }))}>
                                            <option value="">Puesto…</option>
                                            {puestosDB.map(p => <option key={p._id} value={p.nombre}>{p.nombre}</option>)}
                                        </select>
                                        <select className="campo-ed" style={styles.inputPlano} value={formIntegrante.calendarioId || ''} onChange={e => setFormIntegrante(f => ({ ...f, calendarioId: e.target.value }))}>
                                            <option value="">Sin turno</option>
                                            {calendarios.map(c => <option key={c._id} value={c._id}>{c.nombre}</option>)}
                                        </select>
                                        <input type="date" className="campo-ed" style={styles.inputPlano} value={formIntegrante.fechaInicioCiclo || ''} onChange={e => setFormIntegrante(f => ({ ...f, fechaInicioCiclo: e.target.value }))} />
                                        <input type="email" className="campo-ed" style={styles.inputPlano} placeholder="Correo" value={formIntegrante.email || ''} onChange={e => setFormIntegrante(f => ({ ...f, email: e.target.value }))} />
                                        <input className="campo-ed" style={{ ...styles.inputPlano, fontFamily: t.fontMono }} placeholder="+56 9…" value={formIntegrante.telefono || ''} onChange={e => setFormIntegrante(f => ({ ...f, telefono: e.target.value }))} />
                                        <button onClick={guardarIntegrante} style={styles.btnPrimario}>Guardar</button>
                                        <button onClick={() => setFormIntegrante(null)} style={styles.btnSecundario}>Cancelar</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setFormIntegrante({ nombre: '', puesto: '', calendarioId: '', fechaInicioCiclo: '', email: '', telefono: '' })} style={styles.btnAgregar}>Agregar integrante</button>
                                )}
                            </div>
                        </>
                    )}

                    {/* EQUIPOS Y HERRAMIENTAS */}
                    {tabActiva === 'Equipos y herramientas' && (
                        <div>
                            <div style={styles.tablaHeader('120px minmax(220px,1fr) 116px 116px 116px 24px')}>
                                <span>Código</span><span>Modelo</span><span>Tipo</span><span style={{ textAlign: 'right' }}>Valor</span><span style={{ textAlign: 'right' }}>Estado</span><span />
                            </div>
                            {componentes.map(item => {
                                const colorEstado = item.estado === 'Disponible' ? t.verde : item.estado === 'En Uso' || item.estado === 'Reservado' ? t.ambar : t.rojo;
                                return (
                                    <div key={item._id} style={styles.tablaFila('120px minmax(220px,1fr) 116px 116px 116px 24px')}>
                                        <input className="campo-ed" style={{ ...styles.inputCelda, fontFamily: t.fontMono }} value={item.codigo || ''} onChange={e => actualizarEquipo(item._id, { codigo: e.target.value })} />
                                        <input className="campo-ed" style={styles.inputCelda} value={item.nombre || ''} onChange={e => actualizarEquipo(item._id, { nombre: e.target.value })} />
                                        <input className="campo-ed" style={styles.inputCelda} value={item.tipo || ''} onChange={e => actualizarEquipo(item._id, { tipo: e.target.value })} />
                                        <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={item.precio || 0} onChange={e => actualizarEquipo(item._id, { precio: Number(e.target.value) })} />
                                        <select className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right', color: colorEstado, fontWeight: 600 }} value={item.estado} onChange={e => actualizarEquipo(item._id, { estado: e.target.value })}>
                                            {['Disponible', 'Reservado', 'En Uso', 'Mantenimiento', 'Reparación'].map(e => <option key={e}>{e}</option>)}
                                        </select>
                                        <span onClick={async () => { if (await confirmar('¿Eliminar este activo?')) eliminarEquipo(item._id); }} style={styles.xFila}>×</span>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={() => crearEquipo({ codigo: '', nombre: 'Nuevo activo', tipo: 'Herramienta', precio: 0, estado: 'Disponible' })} style={styles.btnAgregar}>Agregar activo</button>
                            </div>
                        </div>
                    )}

                    {/* SUMINISTROS DIRECTOS */}
                    {tabActiva === 'Suministros directos' && (
                        <div>
                            <div style={styles.tablaHeader('132px minmax(240px,1fr) 124px 116px 150px 24px')}>
                                <span>Código</span><span>Descripción</span><span>Categoría</span><span style={{ textAlign: 'right' }}>Precio</span><span style={{ textAlign: 'right' }}>Stock</span><span />
                            </div>
                            {suministros.map(item => (
                                <div key={item._id} style={styles.tablaFila('132px minmax(240px,1fr) 124px 116px 150px 24px')}>
                                    <input className="campo-ed" style={{ ...styles.inputCelda, fontFamily: t.fontMono }} value={item.codigo || ''} onChange={e => actualizarSuministro(item._id, { codigo: e.target.value })} />
                                    <input className="campo-ed" style={styles.inputCelda} value={item.descripcion || ''} onChange={e => actualizarSuministro(item._id, { descripcion: e.target.value })} />
                                    <select className="campo-ed" style={styles.inputCelda} value={item.categoria || 'Insumo'} onChange={e => actualizarSuministro(item._id, { categoria: e.target.value })}>
                                        {['Insumo', 'Logística', 'Servicio'].map(c => <option key={c}>{c}</option>)}
                                    </select>
                                    <input type="number" className="campo-ed" style={{ ...styles.inputCelda, textAlign: 'right' }} value={item.precio || 0} onChange={e => actualizarSuministro(item._id, { precio: Number(e.target.value) })} />
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                        <span style={{ fontFamily: t.fontMono, fontWeight: 700, color: (item.stockActual ?? 0) > 0 ? t.verde : t.rojo }}>{item.stockActual ?? 0}</span>
                                        <button onClick={() => ajustarStockRapido(item, +1)} title="Ingresar stock" style={styles.btnMini}>+</button>
                                        <button onClick={() => ajustarStockRapido(item, -1)} title="Retirar stock" style={styles.btnMini}>−</button>
                                        <button onClick={() => abrirHistorial(item)} title="Historial" style={styles.btnMini}>H</button>
                                    </span>
                                    <span onClick={async () => { if (await confirmar('¿Eliminar este suministro?')) eliminarSuministro(item._id); }} style={styles.xFila}>×</span>
                                </div>
                            ))}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={() => crearSuministro({ codigo: '', descripcion: 'Nuevo suministro', categoria: 'Insumo', precio: 0, stockActual: 0 })} style={styles.btnAgregar}>Registrar suministro</button>
                            </div>
                        </div>
                    )}

                    {/* CALENDARIOS */}
                    {tabActiva === 'Calendarios' && (
                        <div>
                            <div style={styles.tablaHeader('3px minmax(200px,1fr) 150px 196px 72px')}>
                                <span /><span>Calendario</span><span>Tipo</span><span>Semana · horas por día</span><span style={{ textAlign: 'right' }}>Ciclo</span>
                            </div>
                            {calendarios.map(c => {
                                const semana = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(d => {
                                    const cfg = c.config?.find(x => String(x.dia).toLowerCase().trim() === d);
                                    return { letra: d[0].toUpperCase(), valor: cfg?.activo ? calcularHorasBloques(cfg.bloques) : 0 };
                                });
                                const bloquesResumen = (c.config || []).filter(x => x.activo && x.bloques?.length).map(x => x.bloques.map(b => `${b.inicio}–${b.fin}`).join(' · ')).slice(0, 1).join('') || '—';
                                const totalSemana = semana.reduce((s, d) => s + d.valor, 0);
                                return (
                                    <div key={c._id} onClick={() => prepararEdicionCal(c)} style={{ ...styles.tablaFila('3px minmax(200px,1fr) 150px 196px 72px'), cursor: 'pointer', minHeight: 40 }}>
                                        <span style={{ width: 3, alignSelf: 'stretch', background: calSeleccionado === c._id ? t.textoPrincipal : 'transparent' }} />
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
                                            <span style={{ display: 'block', fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bloquesResumen}</span>
                                        </span>
                                        <span style={{ fontSize: 11.5, color: t.textoAtenuado1 }}>{c.tipo === 'rotativo' ? `Rotativo · ciclo ${c.cicloDias}` : 'Semanal'}</span>
                                        <span style={{ display: 'flex', gap: 2 }}>
                                            {semana.map((d, i) => (
                                                <span key={i} style={{ width: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                                    <span style={{ fontSize: 8.5, color: t.textoDeshabilitado }}>{d.letra}</span>
                                                    <span style={{ fontFamily: t.fontMono, fontSize: 11, color: d.valor > 0 ? t.textoSecundario1 : t.textoDeshabilitado }}>{d.valor || '·'}</span>
                                                </span>
                                            ))}
                                        </span>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 11.5, textAlign: 'right', color: t.textoSecundario1 }}>{totalSemana}h</span>
                                    </div>
                                );
                            })}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={nuevoCalendario} style={styles.btnAgregar}>Nuevo calendario</button>
                            </div>
                        </div>
                    )}

                    {/* PLANTILLAS */}
                    {tabActiva === 'Plantillas' && (
                        <div>
                            <div style={styles.tablaHeader('minmax(200px,1fr) 140px minmax(220px,1.2fr)')}>
                                <span>Hoja de ruta</span><span>Categoría</span><span>Composición</span>
                            </div>
                            {plantillas.map(p => (
                                <div key={p._id} onClick={() => { setFormPlantilla({ ...p }); setPlantillaEditando(p._id); setModalPlantilla(true); }} style={{ ...styles.tablaFila('minmax(200px,1fr) 140px minmax(220px,1.2fr)'), cursor: 'pointer', minHeight: 42 }}>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
                                        <span style={{ display: 'block', fontSize: 10.5, color: t.textoAtenuado3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.descripcion}</span>
                                    </span>
                                    <span style={{ fontSize: 11.5, color: t.textoAtenuado1 }}>{p.categoria}</span>
                                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontFamily: t.fontMono, fontSize: 11, color: t.textoSecundario2 }}>{p.tareas?.length || 0} tareas · {p.componentes?.length || 0} equipos · {p.logistica?.length || 0} suministros</span>
                                        <span onClick={async (e) => { e.stopPropagation(); if (await confirmar(`¿Eliminar "${p.nombre}"?`)) eliminarPlantilla(p._id); }} style={styles.xFila}>×</span>
                                    </span>
                                </div>
                            ))}
                            <div style={{ padding: '8px 16px' }}>
                                <button onClick={() => { setFormPlantilla(plantillaVacia); setPlantillaEditando(null); setModalPlantilla(true); }} style={styles.btnAgregar}>Nueva hoja de ruta</button>
                            </div>
                        </div>
                    )}
                </section>

                {/* Tira de colapso + panel derecho */}
                <div onClick={() => setAsideOculta(v => !v)} title={asideOculta ? 'Mostrar panel' : 'Ocultar panel'} style={styles.asideTira}>{asideOculta ? '‹' : '›'}</div>
                {!asideOculta && (
                    <aside style={styles.aside}>
                        <div style={styles.asideBloque}>
                            <div style={styles.tituloSub}>Resumen</div>
                            {resumen.map(r => (
                                <div key={r.label} style={styles.fichaFila}><span style={styles.fichaLabel}>{r.label}</span><span style={styles.fichaValor}>{r.valor}</span></div>
                            ))}
                        </div>

                        {tabActiva === 'Personal' && (
                            <div style={styles.asideBloque}>
                                <div style={styles.tituloSub}>Puestos</div>
                                {puestosDB.map(p => (
                                    <div key={p._id} style={{ ...styles.fichaFila, borderBottom: `1px solid ${t.hairlineFila}` }}>
                                        <span style={styles.fichaLabel}>{p.nombre}</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={styles.fichaValor}>{CLP(p.costoHora)}</span>
                                            <span onClick={() => eliminarPuesto(p._id)} style={styles.xFila}>×</span>
                                        </span>
                                    </div>
                                ))}
                                <div style={{ ...styles.formInline, marginTop: 8, flexDirection: 'column' }}>
                                    <input className="campo-ed" style={styles.inputPlano} placeholder="Nombre del puesto" value={nuevoPuestoNombre} onChange={e => setNuevoPuestoNombre(e.target.value)} />
                                    <input type="number" className="campo-ed" style={styles.inputPlano} placeholder="Costo por hora" value={nuevoPuestoCosto} onChange={e => setNuevoPuestoCosto(e.target.value)} />
                                    <button
                                        onClick={() => { if (nuevoPuestoNombre.trim()) { crearPuesto(nuevoPuestoNombre.trim(), Number(nuevoPuestoCosto) || 0); setNuevoPuestoNombre(''); setNuevoPuestoCosto(''); } }}
                                        style={styles.btnSecundario}
                                    >Añadir puesto</button>
                                </div>
                            </div>
                        )}

                        {tabActiva === 'Calendarios' && calSeleccionado && (
                            <div style={{ ...styles.asideBloque, flex: 1, overflow: 'auto' }}>
                                <div style={styles.tituloSub}>{calSeleccionado === 'nuevo' ? 'Nuevo calendario' : 'Editar calendario'}</div>
                                <input className="campo-ed" style={{ ...styles.inputPlano, marginBottom: 8 }} placeholder="Nombre" value={nuevoCal.nombre} onChange={e => setNuevoCal({ ...nuevoCal, nombre: e.target.value })} />
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                                    <select className="campo-ed" style={styles.inputPlano} value={nuevoCal.tipo} onChange={e => setNuevoCal({ ...nuevoCal, tipo: e.target.value })}>
                                        <option value="semanal">Semanal</option><option value="rotativo">Rotativo</option>
                                    </select>
                                    {nuevoCal.tipo === 'rotativo' && (
                                        <input type="number" className="campo-ed" style={{ ...styles.inputPlano, width: 60 }} value={nuevoCal.cicloDias} onChange={e => actualizarDiasCiclo(Number(e.target.value))} />
                                    )}
                                </div>
                                {nuevoCal.config.map((dia, diaIdx) => (
                                    <div key={diaIdx} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${t.hairlineFila}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <input type="checkbox" checked={dia.activo} onChange={e => setNuevoCal(prev => { const c = JSON.parse(JSON.stringify(prev)); c.config[diaIdx].activo = e.target.checked; return c; })} />
                                                {/* En rotativo el día se identifica por posición en el ciclo (ver
                                                    utils/calendario.js: cal.config[diaDelCiclo], no usa dia.dia), así
                                                    que acá siempre se muestra "Día N" — dia.dia puede traer todavía
                                                    una etiqueta de día de semana (ej. "lun") heredada de cuando este
                                                    calendario nació semanal, y mostrarla tal cual confundía. */}
                                                {nuevoCal.tipo === 'rotativo' ? `Día ${diaIdx + 1}` : dia.dia}
                                            </label>
                                            <span onClick={() => agregarBloque(diaIdx)} style={{ fontSize: 11, color: t.acento, cursor: 'pointer' }}>+ bloque</span>
                                        </div>
                                        {(dia.bloques || []).map((b, bIdx) => (
                                            <div key={bIdx} style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                                                <input type="time" className="campo-ed" style={styles.inputPlano} value={b.inicio} onChange={e => actualizarHora(diaIdx, bIdx, 'inicio', e.target.value)} />
                                                <input type="time" className="campo-ed" style={styles.inputPlano} value={b.fin} onChange={e => actualizarHora(diaIdx, bIdx, 'fin', e.target.value)} />
                                                <span onClick={() => eliminarBloque(diaIdx, bIdx)} style={styles.xFila}>×</span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                    <button onClick={guardarCalendario} style={{ ...styles.btnPrimario, flex: 1 }}>Guardar</button>
                                    <button onClick={() => setCalSeleccionado(null)} style={styles.btnSecundario}>Cerrar</button>
                                </div>
                                {calSeleccionado !== 'nuevo' && (
                                    <button onClick={async () => { if (await confirmar('¿Eliminar este calendario?')) { eliminarCalendarioMaestro(calSeleccionado); setCalSeleccionado(null); } }} style={{ ...styles.btnSecundario, width: '100%', marginTop: 6, color: t.rojo }}>Eliminar calendario</button>
                                )}
                            </div>
                        )}
                    </aside>
                )}
            </div>

            {/* Popover de ajuste manual (Personal) */}
            {ajusteManual && (
                <div style={styles.overlay} onClick={() => setAjusteManual(null)}>
                    <div style={{ ...styles.modal, width: 280 }} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalHeader}><span style={{ fontSize: 12.5, fontWeight: 700 }}>Ajuste manual</span></div>
                        <div style={{ padding: 16 }}>
                            <p style={{ fontSize: 11.5, color: t.textoSecundario2, margin: '0 0 10px' }}>{ajusteManual.nombre} · {ajusteManual.dia}</p>
                            <span style={styles.etiqueta}>Horas para este día</span>
                            <input type="number" className="campo-ed" style={styles.inputPlano} value={ajusteManual.horas} onChange={e => setAjusteManual({ ...ajusteManual, horas: e.target.value })} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                                <button onClick={() => setAjusteManual(null)} style={styles.btnSecundario}>Cancelar</button>
                                <button onClick={() => { guardarCambioManualGlobal(ajusteManual.recursoId, ajusteManual.dia, ajusteManual.horas); setAjusteManual(null); }} style={styles.btnPrimario}>Confirmar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Historial de stock */}
            {historial && (
                <div style={styles.overlay} onClick={() => setHistorial(null)}>
                    <div style={{ ...styles.modal, width: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={styles.modalHeader}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Historial — {historial.item?.descripcion}</span>
                            <span onClick={() => setHistorial(null)} style={styles.xModal}>×</span>
                        </div>
                        <div style={{ padding: '8px 16px', overflow: 'auto' }}>
                            {(historial.movimientos || []).length === 0 && <div style={{ color: t.textoAtenuado3, fontSize: 11.5, padding: 12 }}>Sin movimientos registrados.</div>}
                            {(historial.movimientos || []).map((m, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${t.hairlineFila}`, fontSize: 11.5 }}>
                                    <span>{m.tipo} {m.motivo ? `· ${m.motivo}` : ''}</span>
                                    <span style={{ fontFamily: t.fontMono, color: m.cantidad > 0 ? t.verde : t.rojo }}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</span>
                                </div>
                            ))}
                        </div>
                        <div style={styles.modalFooter}><button onClick={() => setHistorial(null)} style={styles.btnSecundario}>Cerrar</button></div>
                    </div>
                </div>
            )}

            {/* Editor de plantilla (multi-sección: se mantiene como modal, igual que en Tratamiento) */}
            {modalPlantilla && (
                <div style={styles.overlay}>
                    <div style={{ ...styles.modal, width: 680, maxHeight: '88vh', overflowY: 'auto' }}>
                        <div style={styles.modalHeader}>
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{plantillaEditando ? 'Editar hoja de ruta' : 'Nueva hoja de ruta'}</span>
                            <span onClick={() => { setModalPlantilla(false); setPlantillaEditando(null); }} style={styles.xModal}>×</span>
                        </div>
                        <div style={{ padding: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                <label style={styles.campoLabel}><span style={styles.etiqueta}>Nombre *</span><input className="campo-ed" style={styles.inputPlano} value={formPlantilla.nombre} onChange={e => setFormPlantilla(f => ({ ...f, nombre: e.target.value }))} /></label>
                                <label style={styles.campoLabel}>
                                    <span style={styles.etiqueta}>Categoría</span>
                                    <select className="campo-ed" style={styles.inputPlano} value={formPlantilla.categoria} onChange={e => setFormPlantilla(f => ({ ...f, categoria: e.target.value }))}>
                                        {['General', 'Mantenimiento', 'Instalación', 'Reparación', 'Inspección', 'Montaje'].map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </label>
                            </div>
                            <label style={styles.campoLabel}><span style={styles.etiqueta}>Descripción</span><input className="campo-ed" style={{ ...styles.inputPlano, marginBottom: 10 }} value={formPlantilla.descripcion} onChange={e => setFormPlantilla(f => ({ ...f, descripcion: e.target.value }))} /></label>
                            <label style={styles.campoLabel}><span style={styles.etiqueta}>Procedimiento</span><textarea className="campo-ed" style={{ ...styles.inputPlano, minHeight: 60, marginBottom: 14 }} value={formPlantilla.procedimiento} onChange={e => setFormPlantilla(f => ({ ...f, procedimiento: e.target.value }))} /></label>

                            {[
                                { key: 'tareas', titulo: 'Tareas', vacio: { descripcion: '', puesto: '', duracion: 1 }, cols: ['descripcion', 'puesto', 'duracion'] },
                                { key: 'componentes', titulo: 'Equipos / herramientas', vacio: { descripcion: '', cantidad: 1, tipo: 'Herramienta' }, cols: ['descripcion', 'cantidad', 'tipo'] },
                                { key: 'logistica', titulo: 'Suministros directos', vacio: { descripcion: '', cantidad: 1, unidad: 'un', precio: 0 }, cols: ['descripcion', 'cantidad', 'unidad'] },
                            ].map(sec => (
                                <div key={sec.key} style={{ marginBottom: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{sec.titulo}</span>
                                        <span onClick={() => setFormPlantilla(f => ({ ...f, [sec.key]: [...f[sec.key], sec.vacio] }))} style={{ fontSize: 11, color: t.acento, cursor: 'pointer' }}>+ Agregar</span>
                                    </div>
                                    {formPlantilla[sec.key].map((row, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 20px', gap: 6, marginBottom: 5, alignItems: 'center' }}>
                                            {sec.cols.map(colKey => (
                                                <input
                                                    key={colKey} className="campo-ed" style={styles.inputCelda}
                                                    type={colKey === 'cantidad' || colKey === 'duracion' ? 'number' : 'text'}
                                                    placeholder={colKey}
                                                    value={row[colKey]}
                                                    onChange={e => {
                                                        const lista = [...formPlantilla[sec.key]];
                                                        const val = (colKey === 'cantidad' || colKey === 'duracion') ? Number(e.target.value) : e.target.value;
                                                        lista[i] = { ...lista[i], [colKey]: val };
                                                        setFormPlantilla(f => ({ ...f, [sec.key]: lista }));
                                                    }}
                                                />
                                            ))}
                                            <span onClick={() => setFormPlantilla(f => ({ ...f, [sec.key]: f[sec.key].filter((_, idx) => idx !== i) }))} style={styles.xFila}>×</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => { setModalPlantilla(false); setPlantillaEditando(null); }} style={styles.btnSecundario}>Cancelar</button>
                            <button onClick={guardarPlantilla} style={styles.btnPrimario}>{plantillaEditando ? 'Guardar cambios' : 'Crear plantilla'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', height: 46, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

    tabs: { flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 1, padding: '0 16px', background: t.hairlineBloque, borderBottom: `1px solid ${t.hairlineBloque}` },
    tab: { height: 31, padding: '0 12px', background: 'transparent', border: 0, borderBottom: '2px solid transparent', fontSize: 11.5, color: t.textoAtenuado1, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    tabActivo: { height: 31, padding: '0 12px', background: t.superficie, border: 0, borderBottom: `2px solid ${t.textoPrincipal}`, fontSize: 11.5, fontWeight: 700, color: t.textoPrincipal, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },

    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    contenido: { flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: t.superficie },

    barraContexto: { flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: t.barraContexto, borderBottom: `1px solid ${t.hairlineBloque}` },
    etiquetaBarra: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2, flex: 'none' },
    scrollTabla: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' },

    tablaHeader: (grid) => ({ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'center', height: 26, padding: '0 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700 }),
    tablaFila: (grid) => ({ display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'center', minHeight: 34, padding: '4px 16px', borderBottom: `1px solid ${t.hairlineFila}` }),
    inputCelda: { height: 24, minWidth: 0, padding: '0 6px', fontFamily: 'inherit', fontSize: 11.5, color: t.textoPrincipal, borderRadius: 2, width: '100%', boxSizing: 'border-box' },
    xFila: { fontFamily: t.fontMono, fontSize: 12, color: '#c9c7c0', cursor: 'pointer', textAlign: 'center' },
    btnMini: { height: 18, width: 18, padding: 0, background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 10, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, lineHeight: 1 },

    btnAgregar: { height: 24, padding: '0 10px', background: t.superficie, border: '1px dashed rgba(0,0,0,.28)', fontSize: 11.5, color: t.textoSecundario2, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    formInline: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
    campoLabel: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    inputPlano: { height: 27, minWidth: 0, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, outline: 'none', borderRadius: 2, width: '100%', boxSizing: 'border-box', marginTop: 3 },
    tituloSub: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: 7 },

    asideTira: { width: 13, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.encabezadoTabla, color: t.textoAtenuado3, fontFamily: t.fontMono, fontSize: 12, cursor: 'pointer', borderLeft: `1px solid ${t.hairlineBloque}` },
    aside: { width: 264, flex: 'none', display: 'flex', flexDirection: 'column', background: t.fondoMain, borderLeft: `1px solid ${t.bordeZona}`, overflow: 'auto' },
    asideBloque: { flex: 'none', padding: '11px 16px 12px', borderBottom: `1px solid ${t.hairlineBloque}` },
    fichaFila: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: 11.5 },
    fichaLabel: { color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    fichaValor: { fontFamily: t.fontMono, color: '#262622', flex: 'none' },

    btnPrimario: { height: 30, padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    btnSecundario: { height: 27, padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 12, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    modal: { background: t.superficie, borderRadius: 2, boxShadow: '0 8px 24px rgba(0,0,0,.14)' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${t.hairlineBloque}` },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: `1px solid ${t.hairlineBloque}` },
    xModal: { fontFamily: t.fontMono, fontSize: 14, color: t.textoAtenuado3, cursor: 'pointer' },
};

export default RecursosScreen;
