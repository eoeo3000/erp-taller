// Extraído de App.jsx (dominio "plantillas") — ver plan de robustecimiento, punto 5.
import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function usePlantillas() {
  const [plantillas, setPlantillas] = useState([]);

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

  return { plantillas, setPlantillas, crearPlantilla, actualizarPlantilla, eliminarPlantilla };
}
