// src/App.jsx
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';

function NavPortalGuard({ children }) {
  const loc = useLocation();
  if (loc.pathname.startsWith('/portal')) return null;
  return children;
}

// Franja ámbar persistente del modo demostración (§9.2 del README de rediseño): visible en
// todas las pantallas internas mientras el entorno activo sea 'demo', nunca en el portal
// cliente (esa pantalla la ve un cliente externo, no el staff que alterna de entorno).
function BannerDemo({ entorno, onVolver }) {
  const loc = useLocation();
  if (loc.pathname.startsWith('/portal')) return null;
  if (entorno !== 'demo') return null;
  return (
    <div style={stylesBannerDemo.franja}>
      <span>Entorno de demostración — estos datos son ficticios, no son del taller.</span>
      <span onClick={onVolver} style={stylesBannerDemo.accion}>Volver a producción</span>
    </div>
  );
}

const stylesBannerDemo = {
  franja: {
    flex: 'none', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
    background: 'oklch(0.55 0.11 65)', color: '#ffffff', fontSize: 11, fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  accion: { textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 },
};
import axios from 'axios';
import IngresoScreen from './screens/IngresoScreen';
import TratamientoScreen from './screens/TratamientoScreen';
import GanttScreen from './screens/GanttScreen';
import DashboardScreen from './screens/DashboardScreen';
import RecursosScreen from './screens/RecursosScreen'
import React, { useState, useEffect } from 'react';
import ReporteTerreno from './screens/ReporteTerreno';
import FinanzasScreen from './screens/FinanzasScreen';
import ComprasScreen from './screens/ComprasScreen';
import ContabilidadScreen from './screens/ContabilidadScreen';
import ImportExportScreen from './screens/ImportExportScreen';
import PortalClienteScreen from './screens/PortalClienteScreen';
import ClientesScreen from './screens/ClientesScreen';
import BodegaTokensScreen from './screens/BodegaTokensScreen';
import TableroSupervisoresScreen from './screens/TableroSupervisoresScreen';
import useIsMobile from './hooks/useIsMobile';
import { headerEntorno, obtenerEntorno, fijarEntorno } from './utils/entorno';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
function App() {
  const isMobile = useIsMobile();
  const [navW, setNavW] = useState(186);
  const [navOculta, setNavOculta] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [entornoActivo] = useState(obtenerEntorno());
  const volverAProduccion = () => { fijarEntorno('produccion'); window.location.reload(); };
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [recursos, setRecursos] = useState([]);
  const [ots, setOts] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [calendarios, setCalendarios] = useState([]);
  const [componentes, setComponentes] = useState([]);
  const [suministros, setSuministros] = useState([]);
  const [puestosDB, setPuestosDB] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [modalPuestosAbierto, setModalPuestosAbierto] = useState(false);
  const [otSeleccionada, setOtSeleccionada] = useState(null);
  const cargarDatos = async () => {
    try {
      const respuesta = await axios.get(`${API}/data`);
      const d = respuesta.data;

      // Data consolidada existente
      setOts(d.ots || []);
      setSolicitudes(d.solicitudes || []);
      setCalendarios(d.calendarios || []);

      // Pantalla de Recursos
      setRecursos(d.recursos || []); // Personal
      setComponentes(d.equipos || []); // Activos
      setSuministros(d.suministros || []); // Antes logistica

      // 🚩 NUEVO: Cargamos los puestos/especialidades configurados
      if (d.puestos) setPuestosDB(d.puestos);
      if (d.plantillas) setPlantillas(d.plantillas);

      setUltimaSync(new Date());
      setErrorCarga(null);
    } catch (error) {
      console.error("❌ Error en la carga inicial:", error);
      setErrorCarga('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };
  const actualizarRecurso = async (id, datosActualizados) => {
    try {
      const datosParaEnviar = {
        ...datosActualizados,
        // 🛡️ Priorizamos 'puesto'. Si no existe, usamos 'especialidad'.
        puesto: datosActualizados.puesto || datosActualizados.especialidad
      };

      const res = await axios.put(`${API}/recursos/${id}`, datosParaEnviar);

      if (res.status === 200) {
        // Actualizamos el estado local con la respuesta fresca del servidor
        setRecursos(prev => prev.map(r => r._id === id ? res.data : r));

        // ... resto de tu lógica de OTs ...
        return { success: true };
      }
    } catch (error) {
      console.error("Error al actualizar recurso:", error);
      return { success: false };
    }
  };
  const crearSolicitudGlobal = async (datosForm, archivo) => {
    try {
      const formData = new FormData();

      // 1. Adjuntar archivo físico
      if (archivo) {
        formData.append('archivo', archivo);
      }

      // 2. Adjuntar solo campos con contenido real
      Object.keys(datosForm).forEach(key => {
        const valor = datosForm[key];

        // CRUCIAL: Solo agregamos si el valor no es nulo, indefinido o vacío
        // Esto permite que Mongoose use los valores por defecto (como Date.now)
        if (
          valor !== undefined &&
          valor !== null &&
          valor !== "" &&
          valor !== "undefined" &&
          key !== 'adjuntos'
        ) {
          formData.append(key, valor);
        }
      });
      // En App.jsx, dentro de crearSolicitudGlobal
      const respuesta = await axios.post(`${API}/solicitudes`, formData);
      // Quitar el objeto { headers: ... }, Axios lo detecta solo al ver el formData


      if (respuesta.status === 200 || respuesta.status === 201) {
        await cargarDatos();
        return true;
      }
    } catch (error) {
      // Si falla, esto te dirá EXACTAMENTE qué campo del modelo está rechazando Mongoose
      console.error("❌ Detalle del error:", error.response?.data);
      return false;
    }
  };
  // Editar una solicitud ya creada (doble clic en la fila, Ingreso) — reutiliza el mismo
  // endpoint PUT que ya actualizaba solo el estado, ahora ampliado para aceptar el resto
  // de los campos del formulario.
  const actualizarSolicitudGlobal = async (id, datosForm) => {
    try {
      const { data } = await axios.put(`${API}/solicitudes/${id}`, datosForm);
      setSolicitudes(prev => prev.map(s => String(s._id) === String(id) ? data : s));
      return true;
    } catch (error) {
      console.error("Error al actualizar solicitud:", error.response?.data || error.message);
      return false;
    }
  };
  const crearRecurso = async (nuevoRecurso) => {
    try {
      const datosParaEnviar = {
        ...nuevoRecurso,
        // 🛡️ Aseguramos que tome el valor correcto
        puesto: nuevoRecurso.puesto || nuevoRecurso.especialidad
      };

      if (!datosParaEnviar.calendarioId || datosParaEnviar.calendarioId.trim() === "") {
        delete datosParaEnviar.calendarioId;
      }

      const respuesta = await axios.post(`${API}/recursos`, datosParaEnviar);
      setRecursos(prev => [...prev, respuesta.data]);
      return true;
    } catch (error) {
      console.error("❌ Error en el Backend:", error.response?.data);
      alert("Error al crear recurso");
      return false;
    }
  };
  const actualizarAjusteRecurso = async (recursoId, dia, nuevasHoras) => {
    try {
      // 1. Usamos _id en lugar de id
      const recursoActual = recursos.find(r => String(r._id) === String(recursoId));

      if (!recursoActual) return;

      const nuevosAjustes = {
        ...(recursoActual.ajustes || {}),
        [dia]: parseFloat(nuevasHoras)
      };

      // 2. La petición al backend ahora usa _id
      await axios.put(`${API}/recursos/${recursoId}`, {
        ajustes: nuevosAjustes
      });

      // 3. Actualizamos el estado global usando _id
      setRecursos(prev => prev.map(r =>
        String(r._id) === String(recursoId) ? { ...r, ajustes: nuevosAjustes } : r
      ));

    } catch (error) {
      console.error("❌ Error al actualizar recurso:", error);
    }
  };
  useEffect(() => {
    cargarDatos(); // Carga inicial inmediata

    const interval = setInterval(async () => {
      try {
        // Usamos axios para mantener la consistencia
        const { data } = await axios.get(`${API}/data`);

        // Sincronización inteligente: solo actualiza si hay cambios reales
        // Esto evita que React vuelva a dibujar la pantalla cada 30 segundos si nada cambió
        const syncState = (prev, next, setter) => {
          if (JSON.stringify(prev) !== JSON.stringify(next)) {
            setter(next || []);
          }
        };

        syncState(ots, data.ots, setOts);
        syncState(solicitudes, data.solicitudes, setSolicitudes);
        syncState(recursos, data.recursos, setRecursos);
        syncState(calendarios, data.calendarios, setCalendarios);
        syncState(componentes, data.equipos, setComponentes);
        syncState(suministros, data.suministros, setSuministros);

      } catch (error) {
        console.error("❌ Error en refresco automático:", error);
      }
    }, 30000); // 30 segundos es un buen equilibrio

    return () => clearInterval(interval);
  }, [ots, solicitudes, recursos, calendarios, componentes, suministros]); // Dependencias para la comparación
  const eliminarOT = async (id) => {
    if (!id || id === 'null') return;

    if (window.confirm("¿Deseas eliminar esta OT? (La solicitud volverá a estar pendiente)")) {
      try {

        // 1. Solo una petición: El backend hace el resto del trabajo sucio
        const res = await axios.delete(`${API}/ots/${id}`);


        // 2. Refrescamos la UI con los nuevos estados
        await cargarDatos();

        alert("OT eliminada y solicitud liberada automáticamente.");

      } catch (error) {
        console.error("❌ ERROR AL ELIMINAR:", error.response?.data || error.message);
        alert("No se pudo completar la operación.");
      }
    }
  };
  // Shell nuevo (ver docs/rediseno/design_handoff_panel_control/README.md, paso 1):
  // nav lateral colapsable con ancho arrastrable, en vez del top bar. En móvil arranca colapsada.
  useEffect(() => { if (isMobile) setNavOculta(true); }, [isMobile]);

  const dragNav = (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = navW;
    const mover = (ev) => setNavW(Math.min(320, Math.max(132, Math.round(w0 + (ev.clientX - x0)))));
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };
  const guardarCalendarioGlobal = async (datos, id) => {
    // URL apuntando explícitamente al BACKEND (Puerto 5000)
    const API_URL = `${API}/calendarios`;
    try {
      if (id && id !== "null") {
        await axios.put(`${API_URL}/${id}`, datos);
      } else {
        // Quitamos el _id si viene del estado inicial para que no choque
        const { _id, ...datosNuevos } = datos;
        await axios.post(API_URL, datosNuevos);
      }
      await cargarDatos(); // Recarga la lista de /api/data
      return true;
    } catch (error) {
      console.error("Error al guardar:", error);
      return false;
    }
  };
  const actualizarOtGlobal = async (id, dataCompleta) => {
    try {
      const { _id, ...datosParaEnviar } = dataCompleta;
      if (!datosParaEnviar.solicitudId) datosParaEnviar.solicitudId = id;

      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headerEntorno() },
        body: JSON.stringify(datosParaEnviar)
      });

      if (respuesta.ok) {
        const resultado = await respuesta.json();
        const otNueva = resultado.ot || resultado;

        // 🚩 ACTUALIZACIÓN TRIPLE:
        // 1. La lista general
        setOts(prev => prev.map(o => o._id === id ? otNueva : o));
        // 2. La OT activa en pantalla (Esto es lo que hace que se vea el reporte)
        setOtSeleccionada(otNueva);
        // 3. Fondo
        await cargarDatos();

        return { exito: true, otActualizada: otNueva };
      }
      // p.ej. 409 "La OT no tiene supervisor asignado" (pestaña Antecedentes) — se
      // reenvía el mensaje del backend en vez de descartarlo, para que quien llame
      // (GanttScreen al programar, etc.) pueda mostrárselo a quien está operando.
      const cuerpo = await respuesta.json().catch(() => ({}));
      return { exito: false, error: cuerpo.error || cuerpo.mensaje || null };
    } catch (error) {
      console.error("Error:", error);
      return { exito: false };
    }
  };
  const liberarSolicitudManual = async (solicitudId) => {
    try {
      await axios.put(`${API}/solicitudes/${solicitudId}`, { estado: 'Pendiente' });
      await cargarDatos();
      alert("Estado reseteado a Pendiente");
    } catch (error) {
      console.error("Error al liberar:", error);
    }
  };
  const actualizarEstadoSolicitud = async (solicitudId, nuevoEstado) => {
    try {
      await axios.put(`${API}/solicitudes/${solicitudId}`, { estado: nuevoEstado });
      setSolicitudes(prev => prev.map(s => String(s._id) === String(solicitudId) ? { ...s, estado: nuevoEstado } : s));
    } catch (error) {
      console.error("Error al actualizar solicitud:", error);
    }
  };
  const editarOtGlobal = async (id, otActualizada) => {
    try {
      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headerEntorno() },
        body: JSON.stringify(otActualizada)
      });

      if (respuesta.ok) {
        await cargarDatos(); // Refrescamos la lista global
        return true;
      }
    } catch (error) {
      console.error("❌ Error al editar:", error);
      return false;
    }
  };
  const calcularHorasDia = (bloques) => {
    if (!bloques || !Array.isArray(bloques)) return 0;
    return bloques.reduce((total, bloque) => {
      if (!bloque.inicio || !bloque.fin) return total;
      const [hInicio, mInicio] = bloque.inicio.split(':').map(Number);
      const [hFin, mFin] = bloque.fin.split(':').map(Number);
      const minutos = (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
      return total + (minutos / 60);
    }, 0);
  };
  const obtenerHorasParaDia = (recurso, diaCalendario) => {
    // 1. PRIORIDAD ABSOLUTA: Ajustes manuales
    const fechaISO = new Date(diaCalendario.fechaCompleta).toISOString().split('T')[0];

    if (recurso.ajustes) {
      if (recurso.ajustes instanceof Map && recurso.ajustes.has(fechaISO)) {
        return Number(recurso.ajustes.get(fechaISO));
      }
      if (recurso.ajustes[fechaISO] !== undefined) {
        return Number(recurso.ajustes[fechaISO]);
      }
    }

    // 2. Lógica de Calendario
    if (!recurso.calendarioId || !calendarios) return 0;

    const cal = calendarios.find(c => String(c._id) === String(recurso.calendarioId));
    if (!cal || !cal.config) return 0;

    const fecha = new Date(diaCalendario.fechaCompleta);

    // DETERMINAMOS LA FECHA DE ANCLAJE
    // Si no tiene fechaInicioCiclo, usamos una por defecto, pero lo ideal es que siempre tenga.
    const fechaInicio = recurso.fechaInicioCiclo ? new Date(recurso.fechaInicioCiclo) : new Date(fecha);

    // Calculamos días transcurridos reales
    const diasTranscurridos = Math.floor((fecha - fechaInicio) / (1000 * 60 * 60 * 24));
    if (diasTranscurridos < 0) return 0; // No ha empezado a trabajar

    // LÓGICA UNIFICADA POR CICLO (Para que el 5x2 funcione desde el día de inicio)
    if (cal.tipo === 'rotativo' || cal.config.length === 7) {
      // Si es rotativo O si tiene 7 días (como un 5x2 que se comporta como ciclo)
      const largoCiclo = cal.tipo === 'rotativo' ? (cal.cicloDias || 1) : cal.config.length;
      const diaDelCiclo = diasTranscurridos % largoCiclo;

      const configDia = cal.config[diaDelCiclo];
      return (configDia && configDia.activo) ? calcularHorasDia(configDia.bloques) : 0;
    } else {
      // Lógica semanal tradicional (Lunes es Lunes) solo si no es rotativo
      const diasMapa = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
      const nombreDiaReal = diasMapa[fecha.getDay()];
      const configDia = cal.config.find(c =>
        String(c.dia).toLowerCase().trim() === nombreDiaReal
      );
      return (configDia && configDia.activo) ? calcularHorasDia(configDia.bloques) : 0;
    }
  };
  const eliminarRecurso = async (id) => {
    try {
      const respuesta = await axios.delete(`${API}/recursos/${id}`);

      if (respuesta.status === 200 || respuesta.status === 204) {
        // 1. Quitamos a la persona de la lista de operarios
        setRecursos(prev => prev.filter(r => String(r._id) !== String(id)));

        // 2. LA CLAVE PARA LA GANTT: Limpiamos su nombre de todas las tareas
        setOts(prevOts => prevOts.map(ot => ({
          ...ot,
          tareas: ot.tareas?.map(t =>
            String(t.operarioId) === String(id)
              ? { ...t, operarioId: null, operarioNombre: "Sin asignar", puesto: "" }
              : t
          )
        })));

      }
    } catch (error) {
      console.error("❌ Error al eliminar:", error);
      alert("No se pudo eliminar el recurso");
    }
  };
  const eliminarCalendarioMaestro = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este turno? Los operarios asignados quedarán 'Sin Turno'.")) return;

    try {
      // Asegúrate de que la URL sea la de calendarios, no recursos
      const respuesta = await axios.delete(`${API}/calendarios/${id}`);

      if (respuesta.status === 200) {
        // 1. Quitar de la lista de calendarios maestros
        setCalendarios(prev => prev.filter(c => String(c._id) !== String(id)));

        // 2. Actualizar localmente los recursos para que no apunten al ID borrado
        setRecursos(prev => prev.map(r =>
          String(r.calendarioId) === String(id)
            ? { ...r, calendarioId: null }
            : r
        ));
      }
    } catch (error) {
      console.error("❌ Error al eliminar calendario:", error);
      alert("No se pudo eliminar el calendario");
    }
  };
  const asignarCalendarioGlobal = async (recursoId, calendarioId) => {
    try {
      const valorParaEnviar = calendarioId || null;

      // FORZAMOS el objeto vacío aquí
      const bodyPeticion = {
        calendarioId: valorParaEnviar,
        ajustes: {}
      };

      console.log("Cuerpo exacto que sale al servidor:", JSON.stringify(bodyPeticion));

      const res = await axios.put(`${API}/recursos/${recursoId}`, bodyPeticion);

      // Actualizamos el estado local
      setRecursos(prev => prev.map(r =>
        r._id === recursoId
          ? { ...r, calendarioId: valorParaEnviar, ajustes: {} }
          : r
      ));

      // IMPORTANTE: Si cargarDatos() vuelve a traer los recursos de la BD, 
      // asegúrate de que el backend realmente haya guardado el {}
      await cargarDatos();

    } catch (error) {
      console.error("❌ Error:", error);
    }
  };
  const guardarCambioManualGlobal = async (recursoId, dia, nuevasHoras) => {
    try {
      const recursoActual = recursos.find(r => r._id === recursoId);
      if (!recursoActual) return false;

      const recursoActualizado = {
        ...recursoActual,
        // Agregamos o pisamos el día específico en el objeto de ajustes
        ajustes: {
          ...(recursoActual.ajustes || {}),
          [dia]: Number(nuevasHoras)
        }
      };

      const response = await fetch(`${API}/recursos/${recursoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headerEntorno() },
        body: JSON.stringify(recursoActualizado)
      });

      if (response.ok) {
        // Actualizamos el estado global para que todas las pantallas se enteren
        setRecursos(prev => prev.map(r => r._id === recursoId ? recursoActualizado : r));
        return true;
      }
    } catch (error) {
      console.error("Error al guardar ajuste manual:", error);
    }
    return false;
  };
  const crearEquipo = async (nuevoEquipo) => {
    try {
      const datosNormalizados = {
        ...nuevoEquipo,
        // 🚩 Aseguramos que la primera letra sea mayúscula para cumplir con el enum
        tipo: nuevoEquipo.tipo
          ? nuevoEquipo.tipo.charAt(0).toUpperCase() + nuevoEquipo.tipo.slice(1).toLowerCase()
          : 'Herramienta',
        precio: parseFloat(nuevoEquipo.precio) || 0,
        codigo: nuevoEquipo.codigo || `EQ-${Date.now()}` // Genera un código si no hay uno
      };

      const res = await axios.post(`${API}/equipos`, datosNormalizados);
      if (res.status === 201 || res.status === 200) {
        setComponentes(prev => [...prev, res.data]);
        return true;
      }
    } catch (error) {
      console.error("❌ Error de Validación:", error.response?.data);
      return false;
    }
  };
  const eliminarEquipo = async (id) => {
    if (!window.confirm("¿Eliminar este equipo?")) return;
    try {
      await axios.delete(`${API}/equipos/${id}`);
      setComponentes(prev => prev.filter(e => e._id !== id));
    } catch (error) {
      console.error("❌ Error al eliminar equipo:", error);
    }
  };
  const actualizarEquipo = async (id, datosActualizados) => {
    console.log("📦 Datos que se enviarán al servidor:", datosActualizados);
    try {
      const res = await axios.put(`${API}/equipos/${id}`, datosActualizados);
      if (res.status === 200) {
        // Actualizamos el estado local de componentes (equipos)
        setComponentes(prev => prev.map(e => (e._id === id ? res.data : e)));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al actualizar equipo:", error.response?.data);
      return false;
    }
  };
  // --- SECCIÓN SUMINISTROS (CRUD) ---
  const crearSuministro = async (datos) => {
    try {
      // 🛡️ BLINDAJE: Solo extraemos lo que el Schema de Mongoose permite
      const datosLimpios = {
        codigo: String(datos.codigo).trim(),
        descripcion: String(datos.descripcion).trim(),
        precio: Number(datos.precio) || 0,
        categoria: datos.categoria || 'Insumo', // Usamos el default del Schema
        stockActual: Number(datos.stockActual) || 0,
        bodega: datos.bodega || ''
      };

      console.log("📡 Enviando datos limpios al servidor:", datosLimpios);

      const res = await axios.post(`${API}/suministros`, datosLimpios);

      if (res.status === 201 || res.status === 200) {
        setSuministros(prev => [...prev, res.data]);
        return true;
      }
    } catch (error) {
      // 🚩 Log detallado para ver exactamente qué rechazó el servidor
      const mensajeServidor = error.response?.data?.error || error.message;
      console.error("❌ Error al crear suministro:", mensajeServidor);
      alert(`No se pudo crear: ${mensajeServidor}`);
      return false;
    }
  };
  const eliminarSuministro = async (id) => {
    try {
      const res = await axios.delete(`${API}/suministros/${id}`);
      if (res.status === 200) {
        // ✅ Filtramos sobre el estado correcto
        setSuministros(prev => prev.filter(s => s._id !== id));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al eliminar suministro:", error);
      alert("No se pudo eliminar el registro");
    }
  };
  const actualizarSuministro = async (id, datosActualizados) => {
    try {
      // Sanitización para evitar enviar el _id dentro del body
      const { _id, ...soloDatos } = datosActualizados;

      const datosLimpios = {
        ...soloDatos,
        precio: Number(soloDatos.precio) || 0
      };

      const res = await axios.put(`${API}/suministros/${id}`, datosLimpios);

      if (res.status === 200) {
        setSuministros(prev => prev.map(item =>
          (item._id === id) ? res.data : item
        ));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al actualizar suministro:", error.response?.data || error.message);
      return false;
    }
  };
  const ajustarStockSuministro = async (id, cantidad, motivo) => {
    try {
      const res = await axios.put(`${API}/suministros/${id}/stock`, { cantidad: Number(cantidad), motivo: motivo || '' });
      if (res.status === 200) {
        setSuministros(prev => prev.map(item => (item._id === id) ? res.data : item));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al ajustar stock:", error.response?.data || error.message);
      alert(error.response?.data?.error || 'No se pudo ajustar el stock');
      return false;
    }
  };
  const obtenerMovimientosStock = async (id) => {
    try {
      const res = await axios.get(`${API}/suministros/${id}/movimientos`);
      return res.data;
    } catch (error) {
      console.error("❌ Error al obtener historial de stock:", error.response?.data || error.message);
      return [];
    }
  };
  const crearPuesto = async (nombre, costoHora) => {
    try {
      const response = await fetch(`${API}/puestos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headerEntorno() },
        body: JSON.stringify({
          nombre: String(nombre).trim(),
          costoHora: parseFloat(costoHora),
          categoria: 'Técnico' // Valor por defecto para cumplir con el modelo
        })
      });

      const resultado = await response.json();

      if (response.ok) {
        setPuestosDB([...puestosDB, resultado]);
        // Limpiar inputs
        document.getElementById('nuevo-puesto-nombre').value = '';
        document.getElementById('nuevo-puesto-costo').value = '';
      } else {
        // 🚩 Esto te dirá en la consola si el error es por "Duplicado" o "Validación"
        console.error("Respuesta de error del servidor:", resultado);
        alert(`Error: ${resultado.mensaje || 'No se pudo crear el puesto'}`);
      }
    } catch (error) {
      console.error("Error de red/conexión:", error);
    }
  };
  const eliminarPuesto = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar este puesto?")) return;
    try {
      const response = await fetch(`${API}/puestos/${id}`, { method: 'DELETE', headers: headerEntorno() });
      if (response.ok) {
        setPuestosDB(puestosDB.filter(p => p._id !== id));
      }
    } catch (error) {
      console.error("Error al eliminar puesto:", error);
    }
  };

  // Paso 9 del rediseño (ver design_handoff_panel_control/README.md §4): variantes de disposición
  // compartidas — la app no tiene usuarios ni roles, así que quedan globales para quien abra la pantalla.
  const guardarDisposicionGlobal = async (datos) => {
    try {
      const res = await axios.post(`${API}/disposiciones`, datos);
      return { exito: true, disposicion: res.data };
    } catch (error) {
      console.error('Error al guardar la disposición:', error);
      return { exito: false };
    }
  };

  const eliminarDisposicionGlobal = async (id) => {
    try {
      await axios.delete(`${API}/disposiciones/${id}`);
      return true;
    } catch (error) {
      console.error('Error al eliminar la disposición:', error);
      return false;
    }
  };

  const crearPlantilla = async (datos) => {
    try {
      const res = await axios.post(`${API}/plantillas`, datos);
      setPlantillas(prev => [...prev, res.data]);
      return { exito: true, plantilla: res.data };
    } catch (error) {
      console.error('Error al crear plantilla:', error);
      return { exito: false };
    }
  };

  const actualizarPlantilla = async (id, datos) => {
    try {
      const res = await axios.put(`${API}/plantillas/${id}`, datos);
      setPlantillas(prev => prev.map(p => p._id === id ? res.data : p));
      return { exito: true };
    } catch (error) {
      console.error('Error al actualizar plantilla:', error);
      return { exito: false };
    }
  };

  const eliminarPlantilla = async (id) => {
    try {
      await axios.delete(`${API}/plantillas/${id}`);
      setPlantillas(prev => prev.filter(p => p._id !== id));
    } catch (error) {
      console.error('Error al eliminar plantilla:', error);
    }
  };

  const enviarASupervisor = (ot) => {
    if (!ot) return;
    const telefono = ot.whatsappDestino;

    // 🚩 AJUSTE 1: Limpieza total de la URL
    // Eliminamos espacios y aseguramos HTTPS. 
    // Si estás en producción, asegúrate de que tu URL NO sea una IP (ej: 192.168...)
    let urlBase = window.location.origin.trim();

    // Si es localhost, WhatsApp rara vez lo pondrá azul, 
    // pero para producción esto es vital:
    const linkReporte = `${urlBase}/reporte?id=${ot._id}`;

    // 🚩 AJUSTE 2: Formato de "Ancla"
    // Ponemos el link entre dos saltos de línea y sin caracteres pegados
    const encabezado = `*RESUMEN DE SUMINISTROS - OT #${ot.numeroOT || 'S/N'}*`;
    const cliente = `📍 *Cliente:* ${ot.solicitante || 'Particular'}`;

    // El link debe ir solo en su línea, sin texto pegado, para que WhatsApp lo convierta en enlace clickeable
    const mensajeFinal = `${encabezado}\n${cliente}\n\n*Acceso al reporte:*\n${linkReporte}\n\n_Por favor confirmar recepción._`;

    const urlFinal = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeFinal)}`;
    window.open(urlFinal, '_blank');
  };

  const enviarPortalCliente = (solicitud) => {
    if (!solicitud) return;
    const telefono = (solicitud.numero || '').replace(/\D/g, '');
    if (!telefono) {
      alert('Esta solicitud no tiene un número de contacto registrado.');
      return;
    }

    const urlBase = window.location.origin.trim();
    const codigo = solicitud.numeroSolicitud || solicitud._id;
    // tab=estado + q= precarga la búsqueda en el Portal del Cliente para que no tenga que tipear el código
    const linkPortal = `${urlBase}/portal?tab=estado&q=${encodeURIComponent(codigo)}`;

    const mensaje = `Hola ${solicitud.solicitante || ''}, puede seguir el estado de su solicitud *${codigo}* desde nuestro portal:\n\n${linkPortal}`;

    const urlFinal = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlFinal, '_blank');
  };

  const actualizarProgresoTarea = async (otId, tareaId, evidencia) => {
    // 1. Buscamos la OT en el estado global
    const otPrev = oTs.find(o => o._id === otId);
    if (!otPrev) return;

    // 2. Actualizamos solo la tarea específica dentro del array
    const tareasNuevas = otPrev.tareas.map(t =>
      (t._id === tareaId || t.id === tareaId)
        ? { ...t, ...evidencia, fechaRegistro: new Date().toISOString() }
        : t
    );

    const otActualizada = { ...otPrev, tareas: tareasNuevas };

    // 3. Usamos tu función existente para persistir en DB
    await actualizarOtGlobal(otId, otActualizada);
  };

  // Contadores reales del nav (nada de placeholders) — ver §1 del handoff.
  const solicitudesSinOT = solicitudes.filter(s => !ots.find(o => String(o.solicitudId) === String(s._id))).length;
  const otsProgramables = ots.filter(o => o.estado === 'Planificada' || o.estado === 'Aprobada' || o.estado === 'Programada').length;
  const horaSync = ultimaSync ? ultimaSync.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—';

  const navOperacion = [
    { to: '/', label: 'Ingreso', count: solicitudesSinOT },
    { to: '/dashboard', label: 'Panel de control', count: ots.length },
    { to: '/gantt', label: 'Programación', count: otsProgramables },
    { to: '/tablero-supervisores', label: 'Tablero de supervisores', count: null },
  ];
  const navAdmin = [
    { to: '/recursos', label: 'Recursos' },
    { to: '/clientes', label: 'Clientes' },
    { to: '/tokens', label: 'Bodega de tokens' },
    { to: '/importexport', label: 'Importar / exportar' },
  ];
  // Fuera del nav por decisión del cliente (siguen existiendo y accesibles por URL directa):
  // Compras (/compras), Finanzas (/finanzas), Contabilidad (/contabilidad), Portal cliente (/portal).

  return (
    <Router>
      <div style={styles.raiz}>
        <NavPortalGuard>
          {!navOculta && (
            <>
              <nav style={{ ...styles.nav, width: navW }}>
                <div style={styles.navMarca}>
                  <div style={styles.navMarcaTitulo}>Taller ERP</div>
                </div>
                <div style={styles.navGrupo}>
                  <div style={styles.navGrupoLabel}>Operación</div>
                  {navOperacion.map(item => (
                    <NavLink key={item.to} to={item.to}
                      style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActivo : {}) })}>
                      <span style={styles.navItemLabel}>{item.label}</span>
                      {item.count !== null && <span style={styles.navItemCount}>{item.count}</span>}
                    </NavLink>
                  ))}
                </div>
                <div style={styles.navGrupo}>
                  <div style={styles.navGrupoLabel}>Administración</div>
                  {navAdmin.map(item => (
                    <NavLink key={item.to} to={item.to}
                      style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActivo : {}) })}>
                      <span style={styles.navItemLabel}>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
                <div style={styles.navPie}>Sincronizado {horaSync}</div>
              </nav>
              <div
                onPointerDown={dragNav}
                title="Arrastra para ajustar el ancho de la navegación"
                style={styles.navSeparador}
              />
            </>
          )}
          <div
            onClick={() => setNavOculta(v => !v)}
            title={navOculta ? 'Mostrar navegación' : 'Ocultar navegación'}
            style={styles.navTira}
          >
            {navOculta ? '›' : '‹'}
          </div>
        </NavPortalGuard>

        <main style={styles.main}>
          <BannerDemo entorno={entornoActivo} onVolver={volverAProduccion} />
          <Routes>
            <Route path="/reporte" element={<ReporteTerreno ots={ots} actualizarOtGlobal={actualizarOtGlobal} />} />
            <Route path="/" element={<IngresoScreen solicitudes={solicitudes} liberarSolicitudManual={liberarSolicitudManual} crearSolicitudGlobal={crearSolicitudGlobal} actualizarSolicitudGlobal={actualizarSolicitudGlobal} setSolicitudes={setSolicitudes} cargarDatos={cargarDatos} API={API} ots={ots} enviarPortalCliente={enviarPortalCliente} cargando={cargando} errorCarga={errorCarga} />} />
            <Route path="/dashboard" element={<DashboardScreen solicitudes={solicitudes} ots={ots} eliminarOT={eliminarOT} actualizarEstadoSolicitud={actualizarEstadoSolicitud} enviarASupervisor={enviarASupervisor} recursos={recursos} API={API} cargando={cargando} errorCarga={errorCarga} cargarDatos={cargarDatos} guardarDisposicionGlobal={guardarDisposicionGlobal} eliminarDisposicionGlobal={eliminarDisposicionGlobal} />} />
            <Route path="/tratamiento" element={<TratamientoScreen recurso={recursos} puestosDB={puestosDB} enviarASupervisor={enviarASupervisor} componentes={componentes} actualizarOtGlobal={actualizarOtGlobal} editarOtGlobal={editarOtGlobal} cargarDatos={cargarDatos} API={API} recursos={recursos} suministros={suministros} otSeleccionada={otSeleccionada} setOtSeleccionada={setOtSeleccionada} plantillas={plantillas} />} />
            <Route path="/gantt" element={<GanttScreen ots={ots} recursos={recursos} calendarios={calendarios} obtenerHorasParaDia={obtenerHorasParaDia} actualizarOtGlobal={actualizarOtGlobal} cargarDatos={cargarDatos} />} />
            <Route path="/recursos" element={
              <RecursosScreen
                // Props existentes
                recursos={recursos}
                calendarios={calendarios}
                ots={ots}
                crearRecurso={crearRecurso}
                eliminarRecurso={eliminarRecurso}
                actualizarRecurso={actualizarRecurso}
                componentes={componentes}
                suministros={suministros}
                crearEquipo={crearEquipo}
                eliminarEquipo={eliminarEquipo}
                crearSuministro={crearSuministro}
                eliminarSuministro={eliminarSuministro}
                actualizarSuministro={actualizarSuministro}
                ajustarStockSuministro={ajustarStockSuministro}
                obtenerMovimientosStock={obtenerMovimientosStock}
                obtenerHorasParaDia={obtenerHorasParaDia}
                puestosDB={puestosDB}
                crearPuesto={crearPuesto}
                eliminarPuesto={eliminarPuesto}
                actualizarEquipo={actualizarEquipo}
                guardarCalendarioGlobal={guardarCalendarioGlobal}
                asignarCalendario={asignarCalendarioGlobal}
                guardarCambioManualGlobal={guardarCambioManualGlobal}
                eliminarCalendarioMaestro={eliminarCalendarioMaestro}
                plantillas={plantillas}
                crearPlantilla={crearPlantilla}
                actualizarPlantilla={actualizarPlantilla}
                eliminarPlantilla={eliminarPlantilla}
              />
            } />
            <Route path="/compras" element={<ComprasScreen ots={ots} suministros={suministros} />} />
            <Route path="/finanzas" element={<FinanzasScreen recursos={recursos} API={API} />} />
            <Route path="/contabilidad" element={<ContabilidadScreen API={API} />} />
            <Route path="/importexport" element={<ImportExportScreen API={API} cargarDatos={cargarDatos} />} />
            <Route path="/portal" element={<PortalClienteScreen API={API} />} />
            <Route path="/clientes" element={<ClientesScreen API={API} />} />
            <Route path="/tokens" element={<BodegaTokensScreen API={API} />} />
            <Route path="/tablero-supervisores" element={<TableroSupervisoresScreen API={API} recursos={recursos} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

// Tokens del handoff (docs/rediseno/design_handoff_panel_control/README.md §2) — definitivos, sin librerías nuevas.
const fontUi = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const fontMono = 'ui-monospace, Menlo, monospace';

const styles = {
  raiz: {
    display: 'flex', height: '100dvh', maxHeight: '100dvh', width: '100%',
    background: '#eceae5', color: '#1a1a18', fontSize: '13px', fontFamily: fontUi,
    overflow: 'hidden',
  },
  nav: {
    flex: 'none', background: '#1c1d1b', color: '#e8e7e3',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  navMarca: { padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.09)' },
  navMarcaTitulo: { fontSize: '12.5px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  navGrupo: { padding: '12px 0 4px' },
  navGrupoLabel: { fontSize: '9.5px', letterSpacing: '.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,.34)', padding: '0 14px 6px', whiteSpace: 'nowrap' },
  navItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
    padding: '6px 14px', fontSize: '12.5px', color: 'rgba(255,255,255,.72)', textDecoration: 'none',
    borderLeft: '2px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  navItemActivo: { background: 'rgba(255,255,255,.10)', borderLeft: '2px solid oklch(0.62 0.11 250)', color: '#fff' },
  navItemLabel: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  navItemCount: { fontFamily: fontMono, fontSize: '10.5px', color: 'rgba(255,255,255,.36)', flex: 'none' },
  navPie: {
    marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.09)',
    fontSize: '10.5px', color: 'rgba(255,255,255,.38)', fontFamily: fontMono, whiteSpace: 'nowrap', overflow: 'hidden',
  },
  navSeparador: { width: '5px', flex: 'none', cursor: 'col-resize', background: '#1c1d1b', borderRight: '1px solid rgba(0,0,0,.18)' },
  navTira: {
    width: '13px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1c1d1b', color: 'rgba(255,255,255,.45)', fontFamily: fontMono, fontSize: '12px',
    cursor: 'pointer', borderRight: '1px solid rgba(0,0,0,.20)',
  },
  main: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#f6f5f2', overflow: 'hidden' },
};

export default App;