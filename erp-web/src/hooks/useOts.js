// Extraído de App.jsx (dominio "ots"). Ver plan de robustecimiento, punto 5.
// `cargarDatos` inyectado igual que en useSolicitudes — varias mutaciones piden un resync
// completo de /api/data en vez de update optimista local, mismo comportamiento que antes.
import { useState } from 'react';
import axios from 'axios';
import { headerEntorno, headerApiKey } from '../utils/entorno';
import { notificar, confirmar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useOts(cargarDatos) {
  const [ots, setOts] = useState([]);
  const [otSeleccionada, setOtSeleccionada] = useState(null);

  const eliminarOT = async (id) => {
    if (!id || id === 'null') return;

    if (await confirmar("¿Deseas eliminar esta OT? (La solicitud volverá a estar pendiente)")) {
      try {
        // 1. Solo una petición: El backend hace el resto del trabajo sucio
        await axios.delete(`${API}/ots/${id}`);

        // 2. Refrescamos la UI con los nuevos estados
        await cargarDatos();

        notificar.exito("OT eliminada y solicitud liberada automáticamente.");
      } catch (error) {
        console.error("❌ ERROR AL ELIMINAR:", error.response?.data || error.message);
        notificar.error(error.response?.data?.error || "No se pudo completar la operación.");
      }
    }
  };

  const actualizarOtGlobal = async (id, dataCompleta) => {
    try {
      const { _id, ...datosParaEnviar } = dataCompleta;
      if (!datosParaEnviar.solicitudId) datosParaEnviar.solicitudId = id;

      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...{ ...headerEntorno(), ...headerApiKey() } },
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

  const editarOtGlobal = async (id, otActualizada) => {
    try {
      const respuesta = await fetch(`${API}/ots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...{ ...headerEntorno(), ...headerApiKey() } },
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

  const actualizarProgresoTarea = async (otId, tareaId, evidencia) => {
    // 1. Buscamos la OT en el estado global
    const otPrev = ots.find(o => o._id === otId);
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

  return {
    ots, setOts, otSeleccionada, setOtSeleccionada,
    eliminarOT, actualizarOtGlobal, editarOtGlobal, actualizarProgresoTarea,
  };
}
