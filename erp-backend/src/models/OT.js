const mongoose = require('mongoose');

const OTSchema = new mongoose.Schema({
    // Identificadores básicos
    numeroOT: { type: String, unique: true },
    solicitante: { type: String, required: true },
    solicitudId: { type: mongoose.Schema.Types.ObjectId, ref: 'Solicitud' },
    descripcion: { type: String, required: true },

    // Estado del flujo
    estado: {
        type: String,
        enum: [
            'Pendiente',        // OT creada, sin planificar
            'Tratada',          // Tratamiento iniciado
            'Planificada',      // Tareas y recursos definidos, cotización armada
            'Aprobada',         // Cliente aceptó la cotización
            'Rechazada',        // Cliente rechazó la cotización (cierre)
            'Programada',       // Agendada en Gantt
            'En Ejecución',     // Trabajo en terreno
            'Reprogramar',      // El supervisor marcó (S3, PWA Operativa) que no sigue en la fecha planificada
            'Trabajo Terminado',// Faena completada
            'Con Informe',      // Reporte entregado
            'Pagada'            // Cobro recibido
        ],
        default: 'Pendiente'
    },
    origen: { type: String, default: 'Manual' },

    // Marca liviana aparte de `estado`: el supervisor la deja en 'Replanificar' desde S3 cuando
    // la OT sigue en curso pero necesita más HH/materiales de lo cotizado — no mueve el pipeline
    // principal, solo alerta al planificador (Gantt/Tratamiento) hasta que prepara y envía la
    // extensión de cotización correspondiente (ver excepciones más abajo), momento en que se limpia.
    subEstado: { type: String, default: '' },

    // El cliente puede cancelar su propia solicitud desde la PWA Cliente, hasta antes de que
    // el trabajo empiece en terreno (estado 'En Ejecución' en adelante — ver
    // portalController.ESTADOS_OT_CANCELABLE). No se borra nada ni se reemplaza ot.estado
    // (mismo criterio que cotizacion.respuestaCliente/subEstado: un flag encima del estado,
    // no un valor nuevo de estado) — así se conserva el registro completo y se puede seguir
    // facturando lo ya ejecutado (ej. una visita de evaluación) aunque el cliente haya
    // cancelado el resto del trabajo.
    cancelada: {
        activa: { type: Boolean, default: false },
        motivo: { type: String, default: '' },
        fecha: { type: Date, default: null },
    },

    // Informe de Evaluación: levantamiento en terreno previo a cotizar (ver docs/funcionalidades-v2.md)
    informeEvaluacion: {
        fecha: String,
        responsable: String,
        condicionesSitio: String,
        fotos: [String],
        recursosObservados: String,
        riesgos: String,
        metodologia: String,
        completo: { type: Boolean, default: false },
        tareas: [{
            descripcion: String,
            puesto: String,
            duracion: Number
        }],
        componentes: [{
            codigo: String,
            descripcion: String,
            cantidad: Number,
            precio: Number,
            tipo: String
        }],
        logistica: [{
            descripcion: String,
            cantidad: Number,
            unidad: String,
            precio: Number
        }],
        // Formulario adaptativo — ver docs/plan-formulario-adaptativo.md. Aditivo: no
        // reemplaza nada de lo de arriba. Cada hallazgo mantiene sincronizada una fila propia
        // en `tareas` de acá arriba (tareaVinculadaId guarda el _id de ese subdocumento) — ver
        // plan §3.4.1. Eliminar un hallazgo elimina también su tarea vinculada.
        hallazgos: [{
            tipoTrabajoId: { type: mongoose.Schema.Types.ObjectId, ref: 'TipoTrabajo', default: null },
            valores: { type: mongoose.Schema.Types.Mixed, default: {} },
            textoGenerado: { type: String, default: '' },
            textoDescriptivo: { type: String, default: '' },
            textoEditadoManualmente: { type: Boolean, default: false },
            fotos: { type: [String], default: [] },
            casoNoCubierto: { type: Boolean, default: false },
            tareaVinculadaId: { type: String, default: '' },
            fecha: { type: Date, default: Date.now },
        }],
        // Revisión del Planificador sobre el informe del Supervisor: informativa, no bloquea
        // el resto del tratamiento (tareas/equipos/suministros siguen editables igual) — solo
        // bloquea el cierre de planificación (ver TratamientoScreen, puedeTerminarPlanificacion).
        // 'ConObservaciones' se muestra al Supervisor en la PWA Operativa (Mis informes) para
        // que corrija; O5_InformeEvaluacion resetea esto a 'Pendiente' al regrabar.
        revision: {
            estado: { type: String, enum: ['Pendiente', 'Aceptado', 'ConObservaciones'], default: 'Pendiente' },
            comentario: { type: String, default: '' },
            fecha: { type: Date, default: null },
            autor: { type: String, default: '' },
        },
    },

    // --- NUEVOS CAMPOS PARA GUARDAR EL TRATAMIENTO ---

    // 1. Tareas (Array de objetos)
    tareas: [{
        descripcion: String,
        // Metodología/desarrollo de la tarea (pestaña Tareas del tratamiento): la primera
        // línea se edita inline en la tabla, el texto completo en el panel expandido. Viaja
        // tal cual a la PWA Operativa (mi-día) y al Informe de Ejecución para comparar plan
        // contra terreno — no necesita serialización especial, es un campo más del subdocumento.
        desarrollo: { type: String, default: '' },
        puesto: String,
        duracion: Number,
        fecha: String,
        hora: String,
        // Real, no derivado de hora+duracion en cada lectura: la detección de cruces de
        // horario (PWA Operativa, modo supervisor) los necesita ya calculados y persistidos.
        // Se recalculan en TratamientoScreen.actualizarTarea cada vez que cambian hora/duracion.
        horaInicio: { type: String, default: '' },
        horaFin: { type: String, default: '' },
        operarioId: [String],
        operarioNombre: [String],
        valorHora: Number,
        completada: { type: Boolean, default: false },
        // PWA Operativa, modo supervisor (S3): motivo de una tarea NO realizada (ej. cancelada
        // por el cliente). completada sigue en false — el Portal Cliente la sigue mostrando como
        // no terminada, correcto desde su vista — pero con motivo no vacío la tarea ya no bloquea
        // el cierre de la OT: se puede cerrar con todas realizadas O no-realizadas-y-notificadas.
        motivoNoRealizada: { type: String, default: '' },
        // Ingreso de lo realizado en terreno, por tarea (no por OT, a diferencia de OT.reportes
        // que usa ReporteTerreno.jsx). Uno por tarea: se sobreescribe si se vuelve a guardar.
        registro: {
            texto: { type: String, default: '' },
            fotos: [String],
            hora: { type: String, default: '' },
            autor: { type: String, default: '' }
        }
    }],

    // 2. Componentes y Materiales
    componentes: [{
        codigo: String,
        // Referencia real hacia EquiposHerramientas, capturada cuando se elige desde el
        // autocompletado (ver TabEquiposMateriales.jsx) — en paralelo a 'codigo', no lo
        // reemplaza. otController.aplicarReservaPorCambioEstado prioriza este campo sobre el
        // match por texto cuando está presente. Suministro no tiene un punto de captura
        // propio hoy (no hay autocompletado contra ese catálogo acá), así que los
        // componentes tipo 'Material' siguen cruzándose solo por 'codigo'. Ver plan de
        // robustecimiento, punto 7.
        catalogoId: { type: mongoose.Schema.Types.ObjectId, default: null },
        descripcion: String,
        cantidad: Number,
        precio: Number,
        tipo: String // 'Material', 'Equipo', 'Herramienta'
    }],

    // 3. Logística y otros gastos
    // En tu archivo de modelo:
    logistica: [{
        unidad: String,
        patente: String,
        descripcion: String,
        cantidad: Number,
        precio: Number
    }],
    reportes: [{
        fecha: { type: Date, default: Date.now },
        tareaId: String,
        comentario: String,
        foto: String, // Base64 o URL
        usuario: String // Nombre del supervisor
    }],
    // 4. Totales Financieros
    granTotal: { type: Number, default: 0 },

    // 5. Control de Pago — "Pagado" ya no es un selector manual (Pendiente/Parcial/Pagado):
    // se calcula solo cuando los 3 documentos del flujo chileno de pago están completos
    // (Orden de Compra → Estado de Pago/EDP → Hoja de Entrada de Servicio/HES), ver
    // otController.actualizarOT y portalController.actualizarEdp/actualizarHes. `estado` se
    // mantiene en el schema (otras pantallas/reportes ya lo leen — finanzasController,
    // DashboardScreen, importExportController) pero ahora es de solo lectura desde TabPago.jsx.
    pago: {
        estado: { type: String, enum: ['Pendiente', 'Parcial', 'Pagado'], default: 'Pendiente' },
        montoPagado: { type: Number, default: 0 },
        fechaPago: { type: String, default: '' },
        metodoPago: { type: String, default: 'Transferencia' },
        referencia: { type: String, default: '' },
        notas: { type: String, default: '' },
        anulado: { type: Boolean, default: false },
        fechaAnulacion: { type: String, default: '' },
        motivoAnulacion: { type: String, default: '' },
        // Estado de Pago (EDP) — lo emite la oficina, pero el cliente también puede adjuntarlo
        // desde Cuenta y Pago si lo recibió por otro canal.
        estadoPago: {
            numero: { type: String, default: '' },
            archivo: { type: String, default: '' },
        },
        // Hoja de Entrada de Servicio (HES) — confirma que el cliente recibió el trabajo.
        hes: {
            numero: { type: String, default: '' },
            archivo: { type: String, default: '' },
        },
    },

    // 5b. Informe final al cliente (Solicitud + Informe Inicial + plan + lo reportado en
    // terreno, armado en la pestaña Ejecución) — el botón que lo marca como enviado vive en
    // la pestaña Pago (TabPago.jsx), no en Ejecución: pedido explícito del usuario, mismo
    // criterio que cotizacion.enviada más abajo (un booleano + fecha).
    informeFinal: {
        enviado: { type: Boolean, default: false },
        fechaEnvio: { type: Date, default: null },
        // Borrador editable del informe — copia independiente de tareas/informeEvaluacion/
        // reportes (TratamientoScreen.armarBorradorDesdeVivo la genera la primera vez que se
        // abre "Editar informe"). Decisión explícita del usuario: corregir redacción/ortografía
        // o agregar/quitar fotos acá NO debe tocar los registros originales de planificación/
        // ejecución. Mixed porque es un snapshot de forma libre armado en el frontend — el
        // backend no necesita validar su forma, solo guardarlo y devolverlo tal cual.
        contenido: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // 6. Cotización y programación — respuesta del cliente ('Aprobada'/'Rechazada') dejó de
    // ser un valor de OT.estado (mezclaba un sub-proceso con el pipeline principal, causaba
    // el bug de 'Aprobada' compartiendo casillero visual con 'Planificada' en el panel).
    // El macro-estado se queda en 'Planificada' durante todo este tramo (verificando
    // capacidad -> cotización enviada -> esperando respuesta) y solo pasa a 'Programada'
    // cuando el cliente aprueba (otController.responderCotizacionCliente). Un rechazo no
    // mueve el estado, solo respuestaCliente — la OT queda "esperando corrección" sin salir
    // de 'Planificada'. Escribir siempre con notación de punto (`cotizacion.campo`) en el
    // $set, nunca reemplazando el subdocumento completo, para no pisar campos hermanos.
    cotizacion: {
        capacidadVerificada: { type: Boolean, default: false },
        fechaVerificacion: { type: Date, default: null },
        fechasPropuestas: {
            inicio: { type: Date, default: null },
            fin: { type: Date, default: null },
        },
        enviada: { type: Boolean, default: false },
        fechaEnvio: { type: Date, default: null },
        respuestaCliente: { type: String, enum: ['Pendiente', 'Aprobada', 'Rechazada'], default: 'Pendiente' },
        fechaRespuesta: { type: Date, default: null },
        motivoRechazo: { type: String, default: '' },
    },

    // 7. Excepciones — "extensión de cotización": el supervisor la crea en Borrador desde S3
    // (accion:'replanificar', ver otController.aplicarAccionOT) cuando necesita más HH o
    // materiales de los ya cotizados; el planificador completa componentesExtra/tareasExtra
    // con precios en Tratamiento y la envía al cliente (POST /mail/enviar-excepcion), que
    // aprueba/rechaza desde la PWA Cliente igual que la cotización inicial. Al aprobar, esos
    // ítems se concatenan a componentes/tareas y granTotal += montoExtra (ver
    // otController.aplicarRespuestaExcepcion) — es la única vía del sistema donde el backend
    // recalcula granTotal, porque ahí no hay ningún frontend de escritorio en la transacción.
    excepciones: [{
        descripcion: { type: String, default: '' },
        creadoPor: { type: String, default: '' },
        fecha: { type: Date, default: Date.now },
        foto: { type: String, default: '' },

        componentesExtra: [{ codigo: String, descripcion: String, cantidad: Number, precio: Number, tipo: String }],
        tareasExtra: [{ descripcion: String, puesto: String, duracion: Number, valorHora: Number }],
        montoExtra: { type: Number, default: 0 },

        estado: { type: String, enum: ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'], default: 'Borrador' },
        fechaEnvio: { type: Date, default: null },
        fechaRespuesta: { type: Date, default: null },
        motivoRechazo: { type: String, default: '' },
    }],

    // --- Metadatos y Asignación ---
    // 'Media'/'Alta' quedaron en el enum viejo pero nunca se usaron en ningún lado del
    // frontend (grep confirmado sobre erp-web/src) — se reemplaza sin costo de migración
    // de datos reales. Ver pestaña Antecedentes, docs/rediseno/design_handoff_panel_control.
    prioridad: { type: String, enum: ['Baja', 'Normal', 'Urgente'], default: 'Normal' },
    tecnicoAsignado: { type: String },
    fechaInicio: { type: Date },
    fechaEntrega: { type: Date },

    // Pestaña Antecedentes: supervisor a cargo de la OT completa (independiente del
    // responsable de cada tarea en tareas[].operarioNombre — no se sobreescribe).
    // Referencia a Recurso (el catálogo real de personal que usa todo el resto de la app:
    // Gantt, responsables de tarea), NO a Usuario (acceso móvil PWA, que hoy casi ningún
    // Recurso tiene todavía). Si ese Recurso además tiene Recurso.usuarioId, la OT se
    // refleja en su "mi día"/"mi semana" — ver asignacionController.otsSupervisadasEnFechas.
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recurso', default: null },
    // Fecha en que se ejecuta el trabajo (distinto de fechaInicio/fechaEntrega, que ya
    // existían sin uso claro en el frontend — este es el campo que la pestaña edita).
    fechaEjecucion: { type: Date, default: null },
    // OC del CLIENTE (texto libre) — no confundir con ordenesCompra de abajo, que son las
    // Ordenes de Compra propias generadas para cubrir faltantes de stock (Gap 3). Editable
    // desde la pestaña Pago (erp-web) y desde Cuenta y Pago (PWA Cliente) — es uno de los 3
    // documentos que completan el pago, ver pago.estadoPago/pago.hes más arriba.
    ordenCompra: { type: String, default: '' },
    ordenCompraArchivo: { type: String, default: '' },
    instruccionesTerreno: { type: String, default: '' },
    // Mejora v3 #6 (Cotización ampliada) — sección "Condiciones comerciales" del PDF.
    condicionesComerciales: {
        validez: { type: String, default: '30 días corridos desde la emisión' },
        plazoPago: { type: String, default: '30 días desde la factura' },
        formaPago: { type: String, default: 'Transferencia electrónica' },
        garantia: { type: String, default: '6 meses por defectos de montaje' },
        plazoEjecucion: { type: String, default: '' },
        noIncluye: { type: String, default: '' },
    },
    asignadaEn: { type: Date, default: null },
    // Sin sistema de login para el staff interno (ver CLAUDE.md) — no hay de dónde sacar
    // "quién" asignó de forma confiable hoy. Se deja el campo para cuando exista una sesión
    // real; queda null en vez de inventar un valor.
    asignadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    // Bitácora de la OT (por ahora solo la usa la asignación de supervisor).
    bitacora: [{
        fecha: { type: Date, default: Date.now },
        texto: String,
    }],

    // Órdenes de Compra generadas para cubrir faltantes de stock de esta OT (ver docs/funcionalidades-v2.md, Gap 3)
    ordenesCompra: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrdenCompra' }],

    tokenEjecucion: { type: String, default: '' },
    ultimaEdicion: { type: Date, default: Date.now },
    fechaCreacion: { type: Date, default: Date.now }
}, {
    timestamps: true
});

// getAllData (dataController.js) ordena por createdAt en cada carga/poll de /api/data.
OTSchema.index({ createdAt: -1 });
// mi-dia/mi-semana/mi-panel (PWA Operativa, modo supervisor) filtran por estos dos campos
// en cada request — sin índice, cada llamada hace un collection scan completo. Se vio en
// producción: mi-semana tardaba ~8s con datos reales (la demo, con pocos documentos, nunca
// lo mostró).
OTSchema.index({ supervisorId: 1, estado: 1 });

module.exports = (conn) => conn.models.OT || conn.model('OT', OTSchema);