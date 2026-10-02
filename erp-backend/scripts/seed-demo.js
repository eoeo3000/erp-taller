// Siembra la base de demostración con el juego de datos ficticios de scripts/datos-demo.js.
// Es el "estado cero" del video de la landing: `npm run demo:reset` lo restaura tal cual,
// tantas veces como haga falta, para poder re-grabar sin arrastrar lo que dejó la corrida
// anterior.
//
// SEGURIDAD — este script BORRA colecciones completas antes de insertar, así que tiene dos
// candados y no uno:
//   1. Solo lee MONGO_URI_DEMO. Nunca toca MONGO_URI (producción); la variable no se lee en
//      ninguna línea de este archivo.
//   2. Ya conectado, verifica que el nombre REAL de la base sea 'erp_taller_demo' y aborta si
//      no lo es. Se verifica el nombre de la base que Mongo devuelve, no el texto de la URI:
//      una URI puede apuntar a otro lado de lo que parece leyéndola.
// Es el mismo criterio de scripts/peligrosos/ (ver su README), resuelto sin preguntar nada
// por consola para que `npm run demo:reset` pueda correr dentro del pipeline de grabación.
//
// Uso:
//   npm run demo:reset                     (desde erp-backend, o desde la raíz del repo)
//   node scripts/seed-demo.js --silencioso  (sin el detalle por colección)
//
// La clave de la cuenta de oficina de la demo sale de DEMO_PASSWORD (default más abajo).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const datos = require('./datos-demo');
const { hashPassword } = require('../src/utils/password');
const { hashToken } = require('../src/utils/tokens');

const BASE_ESPERADA = 'erp_taller_demo';

// Cuenta de oficina de la demo. La clave es débil y pública a propósito: solo sirve contra la
// base de demostración, con datos inventados. Si se quiere otra, DEMO_PASSWORD la reemplaza.
const CUENTA_DEMO = {
    email: process.env.DEMO_EMAIL || 'demo@siandes.demo',
    nombre: 'Operador Demo',
    password: process.env.DEMO_PASSWORD || 'demo-erp-2026',
};

// Tokens deterministas: derivados de una frase fija, no aleatorios. Así `demo:reset` deja
// SIEMPRE los mismos accesos y un link de la PWA guardado en el teléfono sigue funcionando
// después de re-sembrar. Solo valen contra erp_taller_demo.
function tokenDemo(semilla) {
    return crypto.createHash('sha256').update(`erp-taller-demo::${semilla}`).digest('hex').slice(0, 40);
}

// --- Fechas relativas al momento de la carga (mismo criterio que demoController.resolverFechas) ---
function dia(offset) {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // mediodía: evita que la zona horaria corra el día
    d.setDate(d.getDate() + offset);
    return d;
}
function diaTexto(offset) {
    const d = dia(offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Misma regla que portalController.normalizarTelefono: el portal del cliente compara el
// teléfono de la sesión contra el de cada solicitud YA normalizado, así que guardarlo en
// bruto hace que el cliente entre y vea CERO trabajos (encontrado probando la grabación).
function telefonoNormalizado(t) {
    const soloDigitos = String(t || '').replace(/\D/g, '');
    return soloDigitos.length === 11 && soloDigitos.startsWith('569') ? soloDigitos.slice(2) : soloDigitos;
}

function hora(h, m = 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const modelos = (conn) => ({
    Cliente: require('../src/models/Cliente')(conn),
    Puesto: require('../src/models/puesto')(conn),
    Calendario: require('../src/models/Calendario')(conn),
    Recurso: require('../src/models/Recurso')(conn),
    Usuario: require('../src/models/Usuario')(conn),
    Asignacion: require('../src/models/Asignacion')(conn),
    EquiposHerramientas: require('../src/models/equiposHerramientas')(conn),
    Suministro: require('../src/models/suministro')(conn),
    MovimientoStock: require('../src/models/MovimientoStock')(conn),
    Proveedor: require('../src/models/Proveedor')(conn),
    OrdenCompra: require('../src/models/OrdenCompra')(conn),
    Plantilla: require('../src/models/Plantilla')(conn),
    Solicitud: require('../src/models/Solicitud')(conn),
    OT: require('../src/models/OT')(conn),
    CuentaContable: require('../src/models/CuentaContable')(conn),
    AsientoContable: require('../src/models/AsientoContable')(conn),
    TipoTrabajo: require('../src/models/TipoTrabajo')(conn),
    CatalogoTransversal: require('../src/models/CatalogoTransversal')(conn),
    SesionPortal: require('../src/models/SesionPortal')(conn),
    SesionStaff: require('../src/models/SesionStaff')(conn),
});

// Estados en los que la OT YA tomó reserva de materiales y equipos (ver
// otController.aplicarReservaPorCambioEstado): la reserva se toma al pasar a 'Programada' y
// se libera al terminar. El seed calcula stockReservado desde acá, en vez de inventar un
// número, para que la bodega cuadre con el pipeline que muestra el panel.
const ESTADOS_CON_RESERVA = ['Programada', 'En Ejecución', 'Reprogramar'];
// Estados en los que el trabajo ya terminó: el material salió de bodega de verdad.
const ESTADOS_CONSUMIDOS = ['Trabajo Terminado', 'Con Informe', 'Pagada'];

function construirTrabajo(t, indice, ctx) {
    const correlativo = String(datos.PRIMER_CORRELATIVO + indice).padStart(4, '0');
    const numeroSolicitud = `SOL-2026-${correlativo}`;
    const cliente = ctx.clientes.get(t.clienteRef);
    const contacto = cliente.contactos[0];
    const plantilla = datos.plantillas[t.plantilla];
    const _id = new mongoose.Types.ObjectId();

    const solicitud = {
        _id,
        numeroSolicitud,
        solicitante: contacto.nombre,
        empresaSolicitante: cliente.empresa,
        clienteId: cliente._id,
        correo: contacto.correo,
        numero: contacto.telefono,
        direccion: cliente.direccion,
        descripcion: t.descripcion,
        origen: indice % 3 === 0 ? 'Portal Cliente' : 'WhatsApp',
        estado: t.sinOT ? 'Pendiente' : t.estado,
        fechaHoraSolicitud: dia(t.dias - 6),
        fechaEjecucionSolicitada: dia(t.dias),
        plazoEjecucionSugerido: '10 días hábiles',
        fechaCreacion: dia(t.dias - 6),
    };

    if (t.sinOT) return { solicitud, ot: null };

    const responsable = ctx.personal.get(t.responsableRef);
    const supervisora = ctx.personal.get('per-salas');

    // Tareas: salen de la plantilla, repartidas en el día de ejecución a partir de las 08:00.
    let cursor = 8;
    const tareas = plantilla.tareas.map((tarea) => {
        const horaInicio = hora(cursor);
        const horaFin = hora(cursor + tarea.duracion);
        cursor += tarea.duracion;
        const terminada = ESTADOS_CONSUMIDOS.includes(t.estado);
        return {
            descripcion: tarea.descripcion,
            desarrollo: plantilla.procedimiento,
            puesto: tarea.puesto,
            duracion: tarea.duracion,
            fecha: diaTexto(t.dias),
            hora: horaInicio,
            horaInicio,
            horaFin,
            operarioId: [String(responsable._id)],
            operarioNombre: [responsable.nombre],
            valorHora: responsable.tarifaHora,
            completada: terminada,
            registros: terminada
                ? [{
                    texto: 'Trabajo ejecutado conforme al procedimiento. Sin observaciones.',
                    fotos: [],
                    fecha: dia(t.dias),
                    autor: supervisora.nombre,
                }]
                : [],
        };
    });

    // Materiales: el precio sale del catálogo, no se escribe dos veces.
    const componentes = plantilla.componentes.map((c) => {
        const sum = ctx.suministros.get(c.codigo);
        return { codigo: c.codigo, descripcion: sum.descripcion, cantidad: c.cantidad, precio: sum.precio, tipo: c.tipo };
    });
    // Equipos/herramientas comprometidos por el trabajo.
    for (const codigo of plantilla.equipos || []) {
        const eq = ctx.equipos.get(codigo);
        componentes.push({ codigo, catalogoId: eq._id, descripcion: eq.nombre, cantidad: 1, precio: eq.precio, tipo: 'Herramienta' });
    }

    const logistica = (plantilla.logistica || []).map((l) => ({ ...l, unidad: l.unidad || 'viaje', patente: '' }));

    const totalTareas = tareas.reduce((s, x) => s + x.duracion * x.valorHora, 0);
    const totalComponentes = componentes.reduce((s, x) => s + x.cantidad * x.precio, 0);
    const totalLogistica = logistica.reduce((s, x) => s + x.cantidad * x.precio, 0);
    const granTotal = totalTareas + totalComponentes + totalLogistica;

    const pagada = t.estado === 'Pagada';
    const conInforme = t.estado === 'Con Informe' || pagada;
    const cotizacionRespondida = !['Tratada', 'Planificada'].includes(t.estado);

    const bitacora = [{ fecha: dia(t.dias - 5), texto: `Supervisora asignada: ${supervisora.nombre}`, autor: 'Oficina' }];
    if (ESTADOS_CONSUMIDOS.includes(t.estado) || t.estado === 'En Ejecución') {
        bitacora.push({ fecha: dia(t.dias), texto: 'Trabajo iniciado en terreno', autor: supervisora.nombre });
    }
    if (ESTADOS_CONSUMIDOS.includes(t.estado)) {
        bitacora.push({ fecha: dia(t.dias), texto: 'Trabajo marcado como terminado', autor: supervisora.nombre });
    }
    if (t.estado === 'Reprogramar') {
        bitacora.push({ fecha: dia(-2), texto: 'Reprogramación solicitada: la planta no entregó el equipo a tiempo', autor: supervisora.nombre });
    }

    const ot = {
        _id,
        numeroOT: `OT-2026-${correlativo}`,
        solicitudId: _id,
        solicitante: contacto.nombre,
        descripcion: t.descripcion,
        estado: t.estado,
        origen: solicitud.origen,
        subEstado: '',
        tareas,
        componentes,
        logistica,
        granTotal,
        prioridad: indice % 7 === 0 ? 'Urgente' : 'Normal',
        supervisorId: supervisora._id,
        fechaEjecucion: dia(t.dias),
        asignadaEn: dia(t.dias - 5),
        instruccionesTerreno: 'Coordinar bloqueo con el jefe de turno antes de intervenir. Uso obligatorio de EPP.',
        cotizacion: {
            capacidadVerificada: t.estado !== 'Tratada',
            fechaVerificacion: t.estado !== 'Tratada' ? dia(t.dias - 4) : null,
            fechasPropuestas: { inicio: dia(t.dias), fin: dia(t.dias + 1) },
            enviada: Boolean(t.cotizacionEnviada) || cotizacionRespondida,
            fechaEnvio: Boolean(t.cotizacionEnviada) || cotizacionRespondida ? dia(t.dias - 3) : null,
            respuestaCliente: cotizacionRespondida ? 'Aprobada' : 'Pendiente',
            fechaRespuesta: cotizacionRespondida ? dia(t.dias - 2) : null,
            motivoRechazo: '',
        },
        bitacora,
        reportes: ESTADOS_CONSUMIDOS.includes(t.estado)
            ? [{ fecha: dia(t.dias), comentario: 'Trabajo terminado y entregado al jefe de turno.', foto: '', usuario: supervisora.nombre }]
            : [],
        informeFinal: {
            enviado: conInforme,
            fechaEnvio: conInforme ? dia(t.dias + 1) : null,
            contenido: null,
            revision: conInforme
                ? { estado: 'Aceptado', comentario: '', fecha: dia(t.dias + 1), autor: 'Oficina' }
                : { estado: 'Pendiente', comentario: '', fecha: null, autor: '' },
        },
        pago: pagada
            ? {
                estado: 'Pagado', montoPagado: granTotal, fechaPago: diaTexto(t.dias + 12),
                metodoPago: 'Transferencia', referencia: `TRF-${correlativo}`, notas: '',
                estadoPago: { numero: `EDP-${correlativo}`, archivo: '' },
                hes: { numero: `HES-${correlativo}`, archivo: '' },
            }
            : { estado: 'Pendiente', montoPagado: 0 },
        ordenCompra: pagada ? `OC-CLI-${correlativo}` : '',
        fechaCreacion: dia(t.dias - 6),
    };

    return { solicitud, ot };
}

async function main() {
    const silencioso = process.argv.includes('--silencioso');
    const uri = process.env.MONGO_URI_DEMO;

    if (!uri) {
        console.error('❌ Falta MONGO_URI_DEMO en erp-backend/.env. Este script no usa MONGO_URI: no puede sembrar producción.');
        process.exit(1);
    }

    const conn = mongoose.createConnection(uri);
    await conn.asPromise();

    // --- Candado: el nombre real de la base, no el texto de la URI ---
    if (conn.name !== BASE_ESPERADA) {
        console.error(`❌ ABORTADO. MONGO_URI_DEMO apunta a la base '${conn.name}', y este script solo escribe en '${BASE_ESPERADA}'.`);
        console.error('   No se borró ni se escribió nada. Corrige MONGO_URI_DEMO en erp-backend/.env.');
        await conn.close();
        process.exit(1);
    }
    console.log(`Conectado a la base de demostración: ${conn.name}`);

    const M = modelos(conn);
    const conteos = {};

    try {
        // --- 1. Vaciar. Idempotencia: el seed no acumula, reemplaza. ---
        await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
        console.log('Colecciones de demostración vaciadas.');

        // --- 2. Catálogos sin dependencias ---
        const clientesCreados = await M.Cliente.insertMany(datos.clientes.map(({ ref, ...c }) => c));
        const ctxClientes = new Map(datos.clientes.map((c, i) => [c.ref, clientesCreados[i]]));
        conteos.clientes = clientesCreados.length;

        conteos.puestos = (await M.Puesto.insertMany(datos.puestos)).length;

        const calendariosCreados = await M.Calendario.insertMany(datos.calendarios.map(({ ref, ...c }) => c));
        const ctxCalendarios = new Map(datos.calendarios.map((c, i) => [c.ref, calendariosCreados[i]._id]));
        conteos.calendarios = calendariosCreados.length;

        const equiposCreados = await M.EquiposHerramientas.insertMany(datos.equipos);
        const ctxEquipos = new Map(datos.equipos.map((e, i) => [e.codigo, equiposCreados[i]]));
        conteos.equipos = equiposCreados.length;

        const suministrosCreados = await M.Suministro.insertMany(datos.suministros.map((s) => ({ ...s, stockReservado: 0 })));
        const ctxSuministros = new Map(datos.suministros.map((s, i) => [s.codigo, suministrosCreados[i]]));
        conteos.suministros = suministrosCreados.length;

        const proveedoresCreados = await M.Proveedor.insertMany(datos.proveedores.map(({ ref, ...p }) => p));
        const ctxProveedores = new Map(datos.proveedores.map((p, i) => [p.ref, proveedoresCreados[i]._id]));
        conteos.proveedores = proveedoresCreados.length;

        // Las plantillas se guardan con el precio resuelto desde el catálogo de materiales.
        conteos.plantillas = (await M.Plantilla.insertMany(datos.plantillas.map((p) => ({
            nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, procedimiento: p.procedimiento,
            tareas: p.tareas,
            componentes: p.componentes.map((c) => {
                const s = ctxSuministros.get(c.codigo);
                return { codigo: c.codigo, descripcion: s.descripcion, cantidad: c.cantidad, precio: s.precio, tipo: c.tipo };
            }),
            logistica: p.logistica,
        })))).length;

        // Catálogo del formulario adaptativo (Informe de Evaluación de la PWA Operativa). Sin
        // esto el supervisor no tiene nada que elegir en terreno y la oficina se queda sin poder
        // cotizar, porque Tratamiento exige el informe completo antes de abrir las pestañas 1-4.
        conteos.catalogosTransversales = (await M.CatalogoTransversal.insertMany(datos.catalogosTransversales)).length;
        conteos.tiposTrabajo = (await M.TipoTrabajo.insertMany(datos.tiposTrabajo)).length;

        const cuentasCreadas = await M.CuentaContable.insertMany(datos.cuentasContables);
        const ctxCuentas = new Map(datos.cuentasContables.map((c, i) => [c.codigo, cuentasCreadas[i]]));
        conteos.cuentasContables = cuentasCreadas.length;

        // --- 3. Personal: Recurso + Usuario (acceso a la PWA Operativa), enlazados en ambos sentidos ---
        const ctxPersonal = new Map();
        const accesosOperativos = [];
        for (const p of datos.personal) {
            const usuario = await M.Usuario.create({
                nombre: p.nombre,
                puesto: p.puesto,
                rol: p.rol,
                token: tokenDemo(p.ref),
                estado: 'activo',
            });
            const recurso = await M.Recurso.create({
                nombre: p.nombre, puesto: p.puesto, tipo: p.tipo,
                calendarioId: ctxCalendarios.get(p.calendarioRef),
                telefono: p.telefono, email: p.email,
                tarifaHora: p.tarifaHora, senior: Boolean(p.senior),
                usuarioId: usuario._id,
                fechaInicioCiclo: diaTexto(-7),
            });
            usuario.recursoId = recurso._id;
            await usuario.save();
            ctxPersonal.set(p.ref, recurso);
            accesosOperativos.push({ nombre: p.nombre, rol: p.rol, token: usuario.token });
        }
        conteos.personal = ctxPersonal.size;

        // --- 4. Cuenta de oficina (login de la SPA) ---
        await M.Usuario.create({
            nombre: CUENTA_DEMO.nombre,
            rol: 'administrador',
            email: CUENTA_DEMO.email,
            passwordHash: await hashPassword(CUENTA_DEMO.password),
            debeCambiarPassword: false,
            estado: 'activo',
        });
        conteos.cuentaOficina = 1;

        // --- 5. Trabajos: Solicitud + OT ---
        const ctx = { clientes: ctxClientes, personal: ctxPersonal, suministros: ctxSuministros, equipos: ctxEquipos };
        const construidos = datos.trabajos.map((t, i) => construirTrabajo(t, i, ctx));

        conteos.solicitudes = (await M.Solicitud.insertMany(construidos.map((c) => c.solicitud))).length;
        const ots = construidos.map((c) => c.ot).filter(Boolean);
        conteos.ots = (await M.OT.insertMany(ots)).length;

        // --- 6. Asignaciones: lo que cada persona ve en "mi día" de la PWA Operativa ---
        const asignaciones = [];
        for (const ot of ots) {
            if (!['Programada', 'En Ejecución', 'Reprogramar'].includes(ot.estado)) continue;
            const supervisora = ctxPersonal.get('per-salas');
            asignaciones.push({
                tipo: 'supervision',
                usuarioId: supervisora.usuarioId,
                otId: ot._id,
                fechaPlanificada: ot.tareas[0]?.fecha || diaTexto(0),
                estado: ot.estado === 'En Ejecución' ? 'en_curso' : 'pendiente',
            });
            const nombreResponsable = ot.tareas[0]?.operarioNombre?.[0];
            const responsable = [...ctxPersonal.values()].find((r) => r.nombre === nombreResponsable);
            if (responsable) {
                asignaciones.push({
                    tipo: 'ejecucion',
                    usuarioId: responsable.usuarioId,
                    otId: ot._id,
                    tareaId: '',
                    fechaPlanificada: ot.tareas[0]?.fecha || diaTexto(0),
                    estado: ot.estado === 'En Ejecución' ? 'en_curso' : 'pendiente',
                });
            }
        }
        conteos.asignaciones = (await M.Asignacion.insertMany(asignaciones)).length;

        // --- 7. Bodega: reservas y consumos coherentes con el estado de cada OT ---
        const movimientos = [];
        const ajustes = new Map(); // codigo -> { reservado, consumido }
        const sumar = (codigo, campo, cantidad) => {
            const actual = ajustes.get(codigo) || { reservado: 0, consumido: 0 };
            actual[campo] += cantidad;
            ajustes.set(codigo, actual);
        };

        for (const ot of ots) {
            for (const c of ot.componentes) {
                if (c.tipo !== 'Material') continue;
                if (ESTADOS_CON_RESERVA.includes(ot.estado)) {
                    sumar(c.codigo, 'reservado', c.cantidad);
                    movimientos.push({
                        suministroId: ctxSuministros.get(c.codigo)._id, tipo: 'Reserva', cantidad: c.cantidad,
                        fecha: ot.cotizacion.fechaRespuesta || dia(-3), otId: ot._id,
                        motivo: `Reserva por aprobación de OT ${ot.numeroOT}`, usuario: 'Sistema',
                    });
                } else if (ESTADOS_CONSUMIDOS.includes(ot.estado)) {
                    sumar(c.codigo, 'consumido', c.cantidad);
                    movimientos.push({
                        suministroId: ctxSuministros.get(c.codigo)._id, tipo: 'Salida', cantidad: -c.cantidad,
                        fecha: ot.fechaEjecucion, otId: ot._id,
                        motivo: `Consumo al terminar OT ${ot.numeroOT}`, usuario: 'Sistema',
                    });
                }
            }
        }

        // Equipos: los de una OT en ejecución están En Uso; los de una programada, Reservados.
        for (const ot of ots) {
            const estadoEquipo = ot.estado === 'En Ejecución' ? 'En Uso'
                : ['Programada', 'Reprogramar'].includes(ot.estado) ? 'Reservado' : null;
            if (!estadoEquipo) continue;
            for (const c of ot.componentes) {
                if (c.tipo !== 'Herramienta' && c.tipo !== 'Equipo') continue;
                await M.EquiposHerramientas.updateOne({ _id: c.catalogoId, estado: 'Disponible' }, { estado: estadoEquipo });
            }
        }

        // Ingreso inicial de bodega, calculado HACIA ATRÁS: el stockActual que declara
        // datos-demo.js es el que la demo tiene que mostrar HOY, ya descontado lo que
        // consumieron los trabajos terminados, así que el ingreso original fue ese número más
        // lo consumido. Restarle los consumos al número declarado (que es lo que hacía antes)
        // dejaba materiales en stock negativo cuando varias OT cerradas ocupaban el mismo
        // material — visto de verdad al probar el cierre: un relé térmico quedó en -1.
        const alertas = [];
        for (const [codigo, sum] of ctxSuministros) {
            const aj = ajustes.get(codigo) || { reservado: 0, consumido: 0 };
            movimientos.push({
                suministroId: sum._id, tipo: 'Ingreso', cantidad: sum.stockActual + aj.consumido,
                fecha: dia(-60), motivo: 'Inventario inicial de bodega', usuario: 'Sistema',
            });
            if (aj.reservado) {
                await M.Suministro.updateOne({ _id: sum._id }, { $set: { stockReservado: aj.reservado } });
            }
            // El "disponible" de la pantalla de tratamiento es stockActual - stockReservado. Si
            // sale negativo el dato es incoherente y se ve en el video, así que el seed lo avisa
            // en vez de dejarlo pasar: se corrige subiendo el stock en datos-demo.js.
            if (sum.stockActual - aj.reservado < 0) {
                alertas.push(`${codigo}: stock ${sum.stockActual} con ${aj.reservado} reservados → disponible ${sum.stockActual - aj.reservado}`);
            }
        }
        conteos.movimientosStock = (await M.MovimientoStock.insertMany(movimientos)).length;

        // --- 8. Órdenes de compra ---
        const ordenes = datos.ordenesCompra.map((oc) => {
            const items = oc.items.map((i) => {
                const s = ctxSuministros.get(i.codigo);
                return { suministroId: s._id, descripcion: s.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario };
            });
            return {
                numeroOC: oc.numeroOC,
                proveedorId: ctxProveedores.get(oc.proveedorRef),
                otId: ots[oc.otIndice]._id,
                items,
                estado: oc.estado,
                fechaEmision: dia(oc.dias),
                fechaRecepcion: oc.estado === 'Recibida' ? dia(oc.dias + 5) : undefined,
                total: items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0),
            };
        });
        conteos.ordenesCompra = (await M.OrdenCompra.insertMany(ordenes)).length;

        // --- 9. Contabilidad: un asiento de ingreso por cada OT pagada ---
        const cuentaClientes = ctxCuentas.get('1201');
        const cuentaIngresos = ctxCuentas.get('4101');
        const cuentaIva = ctxCuentas.get('2102');
        const linea = (cuenta, debe, haber, glosa) => ({
            cuentaId: cuenta._id, cuentaCodigo: cuenta.codigo, cuentaNombre: cuenta.nombre, debe, haber, glosa,
        });
        const asientos = ots.filter((o) => o.pago.estado === 'Pagado').map((ot, i) => {
            const neto = Math.round(ot.granTotal / 1.19);
            const iva = ot.granTotal - neto;
            return {
                numeroAsiento: `AS-2026-${String(i + 1).padStart(4, '0')}`,
                fecha: ot.pago.fechaPago,
                descripcion: `Facturación ${ot.numeroOT}`,
                tipo: 'automatico',
                origen: { tipo: 'OT', referenciaId: ot._id, referenciaNro: ot.numeroOT },
                lineas: [
                    linea(cuentaClientes, ot.granTotal, 0, `Factura ${ot.numeroOT}`),
                    linea(cuentaIngresos, 0, neto, 'Ingreso por servicios'),
                    linea(cuentaIva, 0, iva, 'IVA débito fiscal'),
                ],
                totalDebe: ot.granTotal,
                totalHaber: ot.granTotal,
                estado: 'vigente',
                creadoPor: 'Sistema',
            };
        });
        conteos.asientosContables = (await M.AsientoContable.insertMany(asientos)).length;

        // --- 10. Acceso del cliente protagonista a su PWA ---
        // Mismo formato que portalController.emitirSesionParaTelefono: se guarda el hash, no el
        // token. Acá el token en claro sí se conoce porque es determinista (ver tokenDemo).
        const clientePrincipal = ctxClientes.get(datos.clientes[0].ref);
        const contactoPrincipal = clientePrincipal.contactos[0];
        const tokenCliente = tokenDemo('cliente-principal');
        await M.SesionPortal.create({
            tipo: 'cliente',
            telefono: telefonoNormalizado(contactoPrincipal.telefono),
            empresaSolicitante: clientePrincipal.empresa,
            clienteId: clientePrincipal._id,
            contactoId: contactoPrincipal._id,
            alcance: 'empresa',
            tokenHash: hashToken(tokenCliente),
            tokenPreview: tokenCliente.slice(0, 4),
            expira: dia(365),
            estado: 'activo',
            emitidoPor: 'seed-demo',
        });
        conteos.sesionesPortal = 1;

        // --- 11. Sello de la demo ---
        // La colección _demoMeta es la que lee GET /api/demo/estado para pintar la tarjeta
        // "Entorno de trabajo" en Importar/Exportar (ver demoController). Si no se actualiza acá,
        // esa pantalla queda mostrando la fecha y el conteo de la última carga hecha por el
        // endpoint POST /api/demo/cargar, que no tiene nada que ver con lo que acaba de sembrar
        // este script. Se escribe contra la colección cruda para no duplicar el modelo, que hoy
        // vive declarado dentro del controlador.
        const totalRegistros = Object.values(conteos).reduce((s, n) => s + n, 0);
        await conn.db.collection('_demoMeta').deleteMany({});
        await conn.db.collection('_demoMeta').insertOne({ cargado: true, fecha: new Date(), registros: totalRegistros });

        // --- 12. Archivo de traspaso para el grabador ---
        // Va a demo-output/, que está en .gitignore: los tokens no se versionan aunque sean
        // deterministas y solo sirvan contra la base de demostración.
        const carpetaSalida = path.join(__dirname, '../../demo-output');
        fs.mkdirSync(carpetaSalida, { recursive: true });
        const acceso = {
            generado: new Date().toISOString(),
            base: conn.name,
            oficina: { email: CUENTA_DEMO.email, password: CUENTA_DEMO.password },
            operativos: accesosOperativos,
            cliente: {
                empresa: clientePrincipal.empresa,
                contacto: contactoPrincipal.nombre,
                telefono: contactoPrincipal.telefono,
                token: tokenCliente,
            },
            proximaSolicitud: `SOL-2026-${String(datos.PRIMER_CORRELATIVO + datos.trabajos.length).padStart(4, '0')}`,
            proximaOT: `OT-2026-${String(datos.PRIMER_CORRELATIVO + datos.trabajos.length).padStart(4, '0')}`,
            // Trabajos dejados a propósito en el punto exacto que necesita cada escena del video.
            // Se calculan desde `trabajos` en vez de escribirse a mano, así reordenar esa lista no
            // deja al grabador apuntando a una OT que ya no está en ese estado.
            escenas: (() => {
                const ref = (i) => ({
                    solicitud: `SOL-2026-${String(datos.PRIMER_CORRELATIVO + i).padStart(4, '0')}`,
                    ot: `OT-2026-${String(datos.PRIMER_CORRELATIVO + i).padStart(4, '0')}`,
                    descripcion: datos.trabajos[i].descripcion,
                });
                const empresaCliente = datos.clientes[0].ref;
                // Cotización enviada y esperando respuesta, del cliente protagonista: es la que él
                // aprueba desde su teléfono.
                const iPorAprobar = datos.trabajos.findIndex(
                    (t) => t.cotizacionEnviada && t.estado === 'Planificada' && t.clienteRef === empresaCliente);
                // En ejecución y con materiales, para que cerrarla mueva bodega de verdad.
                const iEnEjecucion = datos.trabajos.findIndex((t) => t.estado === 'En Ejecución' && t.plantilla === 0);
                return {
                    porAprobar: iPorAprobar >= 0 ? ref(iPorAprobar) : null,
                    enEjecucion: iEnEjecucion >= 0 ? ref(iEnEjecucion) : null,
                    materialesQueConsume: iEnEjecucion >= 0
                        ? datos.plantillas[datos.trabajos[iEnEjecucion].plantilla].componentes.map((c) => c.codigo)
                        : [],
                    // Quién ejecuta ese trabajo: el grabador entra con SU token para el tramo sin
                    // señal, porque "Mi día" (donde vive el reporte de terreno y su cola) es la
                    // pantalla de entrada del rol ejecutor, no la del supervisor.
                    ejecutor: iEnEjecucion >= 0
                        ? (datos.personal.find((x) => x.ref === datos.trabajos[iEnEjecucion].responsableRef)?.nombre || null)
                        : null,
                };
            })(),
        };
        fs.writeFileSync(path.join(carpetaSalida, 'acceso-demo.json'), `${JSON.stringify(acceso, null, 2)}\n`);

        // --- Resumen ---
        if (!silencioso) {
            console.log('');
            for (const [nombre, cantidad] of Object.entries(conteos)) {
                console.log(`  ${nombre.padEnd(20, '.')} ${cantidad}`);
            }
        }
        if (alertas.length) {
            console.log('');
            console.log('⚠️  Materiales con disponible negativo (sube su stockActual en scripts/datos-demo.js):');
            for (const a of alertas) console.log(`     ${a}`);
        }
        console.log('');
        console.log(`✅ Demo lista en ${conn.name}.`);
        console.log(`   Oficina: ${acceso.oficina.email} / ${acceso.oficina.password}`);
        console.log(`   La próxima solicitud que se cree será ${acceso.proximaSolicitud} y su OT, ${acceso.proximaOT}.`);
        console.log('   Accesos completos en demo-output/acceso-demo.json');
    } finally {
        await conn.close();
    }
}

main().catch((err) => {
    console.error('❌ Error sembrando la demo:', err.message);
    process.exit(1);
});
