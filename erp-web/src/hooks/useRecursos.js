// Extraído de App.jsx (dominio "recursos" — personal). Ver plan de robustecimiento, punto 5.
// `eliminarRecurso` NO vive acá: además de tocar `recursos`, limpia referencias en `ots`
// (dominio ajeno), así que se queda en App.jsx como orquestación entre useRecursos y useOts.
// `actualizarAjusteRecurso` no se migró: estaba sin usar en ningún lado (confirmado por grep
// y por el lint de no-unused-vars) — se descarta en vez de arrastrar código muerto.
import { useState } from 'react';
import axios from 'axios';
import { headerEntorno, headerApiKey } from '../utils/entorno';
import { notificar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useRecursos() {
  const [recursos, setRecursos] = useState([]);

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
      notificar.error("Error al crear recurso");
      return false;
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
        setRecursos(prev => prev.map(r => r._id === id ? res.data : r));
        return { success: true };
      }
    } catch (error) {
      console.error("Error al actualizar recurso:", error);
      return { success: false };
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
        headers: { 'Content-Type': 'application/json', ...{ ...headerEntorno(), ...headerApiKey() } },
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

  return { recursos, setRecursos, crearRecurso, actualizarRecurso, guardarCambioManualGlobal };
}
