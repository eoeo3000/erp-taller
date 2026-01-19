// src/App.jsx
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import axios from 'axios';
import IngresoScreen from './screens/IngresoScreen';
import TratamientoScreen from './screens/TratamientoScreen';
import GanttScreen from './screens/GanttScreen';
import DashboardScreen from './screens/DashboardScreen';
import RecursosScreen from './screens/RecursosScreen'
import React, { useState, useEffect } from 'react';

const API = 'http://localhost:5000/api';

function App() {
  const [recursos, setRecursos] = useState([]);
  const [ots, setOts] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [calendarios, setCalendarios] = useState([]);
  // 1. FUNCIÓN DE CARGA COMPLETA (Se usa al iniciar y al hacer cambios manuales)

  const cargarDatos = async () => {
    try {
      // CAMBIO 1: Usar GET y apuntar a la ruta /data
      // Eliminamos el 'formData' que causaba el ReferenceError
      const respuesta = await axios.get(`${API}/data`);

      // CAMBIO 2: Axios ya devuelve el JSON en la propiedad 'data'
      const resultado = respuesta.data;


      // Guardamos los datos en el estado
      setOts(resultado.ots || []);
      setSolicitudes(resultado.solicitudes || []);
      setRecursos(resultado.recursos || []);
      setCalendarios(resultado.calendarios || []);

      console.log("📊 Sincronización exitosa:",
        (resultado.ots || []).length, "OTs y",
        (resultado.solicitudes || []).length, "Solicitudes"
      );

    } catch (error) {
      console.error("❌ Error cargando datos:", error);
    }
  };

  const actualizarRecurso = async (id, datosActualizados) => {
    try {
      const datosParaEnviar = {
        ...datosActualizados,
        puesto: datosActualizados.especialidad
      };

      const res = await axios.put(`${API}/recursos/${id}`, datosParaEnviar);

      if (res.status === 200) {
        // 1. Actualiza los recursos (esto incluye los nuevos ajustes de horas)
        setRecursos(prev => prev.map(r => r._id === id ? res.data : r));

        // 2. Sincronización de textos (tu código actual)
        setOts(prevOts => {
          const otsActualizadas = prevOts.map(ot => ({
            ...ot,
            tareas: ot.tareas?.map(t =>
              String(t.operarioId) === String(id)
                ? { ...t, operarioNombre: res.data.nombre, puesto: res.data.puesto }
                : t
            )
          }));
          return otsActualizadas; // O la función que uses para calcular tiempos
        });

        return { success: true };
      }
    } catch (error) {
      console.error("Error al actualizar recurso:", error);
      return { success: false };
    }
  };

  // ✅ FUNCIÓN CORREGIDA Y LIMPIA
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
  // App.jsx
  const crearRecurso = async (nuevoRecurso) => {
    try {
      // 1. Mapeamos los nombres para que coincidan con el modelo del Backend
      const datosParaEnviar = {
        ...nuevoRecurso,
        puesto: nuevoRecurso.especialidad, // Enviamos 'especialidad' como 'puesto'
        // La fechaInicioCiclo se envía tal cual, pero el backend debe tenerla en su esquema
      };

      // 2. Limpieza de calendarioId (tu lógica actual)
      if (!datosParaEnviar.calendarioId || datosParaEnviar.calendarioId.trim() === "") {
        delete datosParaEnviar.calendarioId;
      }

      // 3. Enviamos los datos mapeados
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

  // 2. EFECTO PARA ACTUALIZACIÓN AUTOMÁTICA (Separado)
  // 2. EFECTO PARA ACTUALIZACIÓN AUTOMÁTICA (Sincronización con MongoDB Atlas)
  useEffect(() => {
    cargarDatos(); // Carga inicial al abrir la app

    // Dentro del useEffect de App.jsx
    const interval = setInterval(async () => {
      try {
        const respuesta = await fetch(`${API}/data`);
        const resultado = await respuesta.json();

        const nuevasOts = resultado.ots || [];
        const nuevasSolicitudes = resultado.solicitudes || [];
        const nuevosRecursos = resultado.recursos || [];
        const nuevosCalendarios = resultado.calendarios || [];

        // Sincronizar OTs
        setOts(prev => JSON.stringify(prev) !== JSON.stringify(nuevasOts) ? nuevasOts : prev);

        // Sincronizar Solicitudes
        setSolicitudes(prev => JSON.stringify(prev) !== JSON.stringify(nuevasSolicitudes) ? nuevasSolicitudes : prev);

        // ✅ CORRECCIÓN: Sincronizar Recursos (Vital para la Gantt)
        setRecursos(prev => JSON.stringify(prev) !== JSON.stringify(nuevosRecursos) ? nuevosRecursos : prev);

        // ✅ CORRECCIÓN: Sincronizar Calendarios (Vital para el Modal Maestro)
        setCalendarios(prev => JSON.stringify(prev) !== JSON.stringify(nuevosCalendarios) ? nuevosCalendarios : prev);

      } catch (error) {
        console.error("❌ Error en refresco automático:", error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // --- FUNCIONES CENTRALES (CRUD) ---
  // App.jsx - Línea 166
  const eliminarOT = async (id) => {
    // 1. Si el ID es nulo o no existe, cortamos la ejecución de inmediato
    if (!id || id === 'null' || id === 'undefined') {
      console.error("❌ Error: Se intentó eliminar un registro sin ID válido.");
      return;
    }

    if (window.confirm("¿Estás seguro de eliminar esta Orden de Trabajo?")) {
      try {
        await axios.delete(`${API}/ots/${id}`);
        await cargarDatos(); // Refrescamos la lista de Atlas
        alert("✅ Eliminado correctamente");
      } catch (error) {
        console.error("Error al eliminar:", error);
        alert("No se pudo eliminar el registro en el servidor.");
      }
    }
  };

  const estiloDinamico = ({ isActive }) => ({
    ...styles.link,
    color: isActive ? '#3498db' : 'white',
    borderBottom: isActive ? '2px solid #3498db' : 'none',
    paddingBottom: '5px'
  });

  // App.jsx
  // App.jsx

  const guardarCalendarioGlobal = async (datos, id) => {
    // URL apuntando explícitamente al BACKEND (Puerto 5000)
    const API_URL = "http://localhost:5000/api/calendarios";

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
  // App.jsx
  const actualizarOtGlobal = async (id, dataCompleta) => {
    try {
      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataCompleta)
      });
      if (respuesta.ok) {
        await cargarDatos(); // Refresca todo el sistema
        return true;  // <--- ESTO activa el alert("Planificación guardada...")
      }
      return false;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  // En App.js
  const editarOtGlobal = async (id, otActualizada) => {
    try {
      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
    if (!window.confirm("¿Estás seguro de eliminar este recurso?")) return;

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

  // En App.js
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

  // En App.js
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
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <Router>
      <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <nav style={styles.nav}>
          <div style={styles.logo}>ERP SISTEMA</div>
          <NavLink style={estiloDinamico} to="/">📥 SOLICITUDES</NavLink>
          <NavLink style={estiloDinamico} to="/dashboard">📊 CONTROL MACRO</NavLink>
          <NavLink style={estiloDinamico} to="/gantt">📅 PLANO (GANTT)</NavLink>
          <NavLink style={estiloDinamico} to="/recursos">🛠️ RECURSOS</NavLink>
        </nav>

        <main style={{ flex: 1, width: '100%', backgroundColor: '#f0f2f5' }}>
          <Routes>
            <Route path="/" element={<IngresoScreen solicitudes={solicitudes} crearSolicitudGlobal={crearSolicitudGlobal} setSolicitudes={setSolicitudes} cargarDatos={cargarDatos} API={API} />} />
            <Route path="/dashboard" element={<DashboardScreen solicitudes={solicitudes} ots={ots} eliminarOT={eliminarOT} />} />
            <Route path="/tratamiento" element={<TratamientoScreen actualizarOtGlobal={actualizarOtGlobal} editarOtGlobal={editarOtGlobal} cargarDatos={cargarDatos} API={API} recursos={recursos} />} />
            <Route path="/gantt" element={<GanttScreen ots={ots} recursos={recursos} calendarios={calendarios} obtenerHorasParaDia={obtenerHorasParaDia} />} />
            <Route path="/recursos" element={<RecursosScreen eliminarCalendarioMaestro={eliminarCalendarioMaestro} guardarCambioManualGlobal={guardarCambioManualGlobal} asignarCalendario={asignarCalendarioGlobal} guardarCalendarioGlobal={guardarCalendarioGlobal} crearRecurso={crearRecurso} recursos={recursos} calendarios={calendarios} setRecursos={setRecursos} actualizarAjusteRecurso={actualizarAjusteRecurso} actualizarRecurso={actualizarRecurso} obtenerHorasParaDia={obtenerHorasParaDia} eliminarRecurso={eliminarRecurso} ot={ots} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

const styles = {
  nav: {
    background: '#1a2a3a',
    padding: '15px 30px',
    display: 'flex',
    gap: '40px',
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
  },
  logo: { color: '#3498db', fontWeight: 'bold', fontSize: '20px', marginRight: '20px' },
  link: {
    color: 'white',
    textDecoration: 'none',
    fontWeight: 'bold',
    fontSize: '13px',
    letterSpacing: '1px',
    transition: 'all 0.3s ease'
  }
};

export default App;