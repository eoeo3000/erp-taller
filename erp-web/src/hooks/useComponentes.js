// Extraído de App.jsx (dominio "componentes" — equipos/herramientas). Ver plan de
// robustecimiento, punto 5. Se sigue poblando desde /api/data vía setComponentes,
// que cargarDatos (App.jsx) llama con d.equipos.
import { useState } from 'react';
import axios from 'axios';
import { confirmar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useComponentes() {
  const [componentes, setComponentes] = useState([]);

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
    if (!(await confirmar("¿Eliminar este equipo?"))) return;
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
        setComponentes(prev => prev.map(e => (e._id === id ? res.data : e)));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al actualizar equipo:", error.response?.data);
      return false;
    }
  };

  return { componentes, setComponentes, crearEquipo, eliminarEquipo, actualizarEquipo };
}
