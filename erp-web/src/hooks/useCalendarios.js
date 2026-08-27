// Extraído de App.jsx (dominio "calendarios"). Ver plan de robustecimiento, punto 5.
// `eliminarCalendarioMaestro` y `asignarCalendarioGlobal` NO viven acá: ambas tocan
// `recursos` (dominio ajeno) además de `calendarios`, así que se quedan en App.jsx como
// orquestación entre useCalendarios y useRecursos.
import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useCalendarios(cargarDatos) {
  const [calendarios, setCalendarios] = useState([]);

  const guardarCalendarioGlobal = async (datos, id) => {
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

  return { calendarios, setCalendarios, guardarCalendarioGlobal };
}
