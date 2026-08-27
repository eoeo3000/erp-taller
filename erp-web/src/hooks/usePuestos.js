// Extraído de App.jsx (dominio "puestos") — primer piloto de sacar el estado global a hooks
// por dominio, ver plan de robustecimiento. `puestosDB` se sigue poblando desde /api/data
// (cargarDatos en App.jsx llama a setPuestosDB con lo que venga en d.puestos): este hook no
// hace su propio fetch de carga para no romper el patrón de sync único documentado en
// CLAUDE.md — solo encapsula el estado y las mutaciones (crear/eliminar) de este dominio.
import { useState } from 'react';
import { headerEntorno, headerApiKey } from '../utils/entorno';
import { notificar, confirmar } from '../utils/notificar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function usePuestos() {
  const [puestosDB, setPuestosDB] = useState([]);

  const crearPuesto = async (nombre, costoHora) => {
    try {
      const response = await fetch(`${API}/puestos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...{ ...headerEntorno(), ...headerApiKey() } },
        body: JSON.stringify({
          nombre: String(nombre).trim(),
          costoHora: parseFloat(costoHora),
          categoria: 'Técnico' // Valor por defecto para cumplir con el modelo
        })
      });

      const resultado = await response.json();

      if (response.ok) {
        setPuestosDB(prev => [...prev, resultado]);
        // Limpiar inputs
        document.getElementById('nuevo-puesto-nombre').value = '';
        document.getElementById('nuevo-puesto-costo').value = '';
      } else {
        console.error("Respuesta de error del servidor:", resultado);
        notificar.error(`Error: ${resultado.mensaje || 'No se pudo crear el puesto'}`);
      }
    } catch (error) {
      console.error("Error de red/conexión:", error);
    }
  };

  const eliminarPuesto = async (id) => {
    if (!(await confirmar("¿Seguro que deseas eliminar este puesto?"))) return;
    try {
      const response = await fetch(`${API}/puestos/${id}`, { method: 'DELETE', headers: { ...headerEntorno(), ...headerApiKey() } });
      if (response.ok) {
        setPuestosDB(prev => prev.filter(p => p._id !== id));
      }
    } catch (error) {
      console.error("Error al eliminar puesto:", error);
    }
  };

  return { puestosDB, setPuestosDB, crearPuesto, eliminarPuesto };
}
