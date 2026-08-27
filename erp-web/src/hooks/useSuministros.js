// Extraído de App.jsx (dominio "suministros"). Ver plan de robustecimiento, punto 5.
import { useState } from 'react';
import axios from 'axios';
import { notificar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function useSuministros() {
  const [suministros, setSuministros] = useState([]);

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

      const res = await axios.post(`${API}/suministros`, datosLimpios);

      if (res.status === 201 || res.status === 200) {
        setSuministros(prev => [...prev, res.data]);
        return true;
      }
    } catch (error) {
      const mensajeServidor = error.response?.data?.error || error.message;
      console.error("❌ Error al crear suministro:", mensajeServidor);
      notificar.error(`No se pudo crear: ${mensajeServidor}`);
      return false;
    }
  };

  const eliminarSuministro = async (id) => {
    try {
      const res = await axios.delete(`${API}/suministros/${id}`);
      if (res.status === 200) {
        setSuministros(prev => prev.filter(s => s._id !== id));
        return true;
      }
    } catch (error) {
      console.error("❌ Error al eliminar suministro:", error);
      notificar.error("No se pudo eliminar el registro");
    }
  };

  const actualizarSuministro = async (id, datosActualizados) => {
    try {
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
      notificar.error(error.response?.data?.error || 'No se pudo ajustar el stock');
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

  return {
    suministros, setSuministros,
    crearSuministro, eliminarSuministro, actualizarSuministro,
    ajustarStockSuministro, obtenerMovimientosStock,
  };
}
