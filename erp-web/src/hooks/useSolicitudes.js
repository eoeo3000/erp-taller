// Extraído de App.jsx (dominio "solicitudes"). Ver plan de robustecimiento, punto 5.
// `cargarDatos` se recibe como dependencia inyectada (no vive acá) porque varias mutaciones
// de este dominio no hacen update optimista local — piden un resync completo de /api/data,
// igual que en el App.jsx original. Se pasa como función lazy (`() => cargarDatos()`) desde
// App.jsx para no importar el orden de declaración entre este hook y cargarDatos.
import { useState } from 'react';
import axios from 'axios';
import { notificar, confirmar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useSolicitudes(cargarDatos) {
  const [solicitudes, setSolicitudes] = useState([]);

  const crearSolicitudGlobal = async (datosForm, archivo) => {
    try {
      const formData = new FormData();

      if (archivo) {
        formData.append('archivo', archivo);
      }

      Object.keys(datosForm).forEach(key => {
        const valor = datosForm[key];
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

      const respuesta = await axios.post(`${API}/solicitudes`, formData);

      if (respuesta.status === 200 || respuesta.status === 201) {
        await cargarDatos();
        return true;
      }
    } catch (error) {
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

  const eliminarSolicitud = async (id) => {
    if (!id) return;
    if (await confirmar("¿Eliminar esta solicitud? Si un supervisor ya la tomó para el informe inicial, esa asignación también se elimina.")) {
      try {
        await axios.delete(`${API}/solicitudes/${id}`);
        await cargarDatos();
        notificar.exito("Solicitud eliminada.");
      } catch (error) {
        console.error("❌ ERROR AL ELIMINAR SOLICITUD:", error.response?.data || error.message);
        notificar.error(error.response?.data?.error || "No se pudo completar la operación.");
      }
    }
  };

  const liberarSolicitudManual = async (solicitudId) => {
    try {
      await axios.put(`${API}/solicitudes/${solicitudId}`, { estado: 'Pendiente' });
      await cargarDatos();
      notificar.exito("Estado reseteado a Pendiente");
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

  // Aprobar crea la OT de inmediato (no solo marca la Solicitud) — reutiliza
  // PATCH /ots/:id/asignacion (otController.asignarSupervisor), que ya sabe crear la OT si
  // todavía no existe cuando recibe el _id de la Solicitud, aunque no venga con supervisor
  // (queda "sin asignar", asignable después desde Antecedentes o desde el resumen del
  // Informe Inicial). Así la OT aparece de inmediato en "Solicitudes sin informe inicial" de
  // la PWA, sin depender de que alguien entre a Tratamiento y guarde algo primero.
  const aprobarYCrearOT = async (solicitud) => {
    try {
      await axios.put(`${API}/solicitudes/${solicitud._id}`, { estado: 'Aprobada' });
      await axios.patch(`${API}/ots/${solicitud._id}/asignacion`, {});
      await cargarDatos();
    } catch (error) {
      console.error("Error al aprobar y crear la OT:", error);
      notificar.error('No se pudo aprobar la solicitud: ' + (error.response?.data?.error || error.message));
    }
  };

  return {
    solicitudes, setSolicitudes,
    crearSolicitudGlobal, actualizarSolicitudGlobal, eliminarSolicitud,
    liberarSolicitudManual, actualizarEstadoSolicitud, aprobarYCrearOT,
  };
}
