// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import axios from 'axios';
import IngresoScreen from './screens/IngresoScreen';
import TratamientoScreen from './screens/TratamientoScreen';
import GanttScreen from './screens/GanttScreen';
import DashboardScreen from './screens/DashboardScreen';
import RecursosScreen from './screens/RecursosScreen'
import React, { useState, useEffect } from 'react';

function App() {
  const [recursos, setRecursos] = useState([])

  useEffect(() => {
    // Pedimos los recursos al servidor al cargar la aplicación
    axios.get('http://localhost:5000/api/recursos')
      .then(res => {
        setRecursos(res.data);
      })
      .catch(err => console.error("Error cargando recursos:", err));
  }, []);

  // --- FUNCIONES CENTRALES (CRUD) ---
  // Como pediste en tus instrucciones, centralizamos aquí acciones importantes
  const eliminarOT = async (id, callback) => {
    if (window.confirm("¿Estás seguro de eliminar esta Orden de Trabajo?")) {
      try {
        // Correcto: Llamamos al servidor vía axios
        await axios.delete(`http://localhost:5000/api/ots/${id}`);
        if (callback) callback();
      } catch (error) {
        console.error("Error al eliminar:", error);
      }
    }
  };

  // Función para definir el estilo dinámico
  const estiloDinamico = ({ isActive }) => ({
    ...styles.link,
    color: isActive ? '#3498db' : 'white', // Azul si está activo, blanco si no
    borderBottom: isActive ? '2px solid #3498db' : 'none',
    paddingBottom: '5px'
  });



  return (
    <Router>
      <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* Navbar: Añadimos el acceso al Dashboard Macro */}
        <nav style={{
          background: '#1a2a3a',
          padding: '15px 30px',
          display: 'flex',
          gap: '40px',
          alignItems: 'center',
          // ESTO HACE LA MAGIA:
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)' // Sombra para que se note el relieve al bajar
        }}>
          <div style={{ color: '#3498db', fontWeight: 'bold', fontSize: '20px', marginRight: '20px' }}>ERP SISTEMA</div>
          <NavLink style={estiloDinamico} to="/">📥 SOLICITUDES</NavLink>
          <NavLink style={estiloDinamico} to="/dashboard">📊 CONTROL MACRO</NavLink>
          <NavLink style={estiloDinamico} to="/gantt">📅 PLANO (GANTT)</NavLink>
          <NavLink style={estiloDinamico} to="/recursos">🛠️ RECURSOS</NavLink>
        </nav>

        <main style={{ flex: 1, width: '100%', backgroundColor: '#f0f2f5' }}>
          <Routes>
            {/* Dashboard como página de aterrizaje o secundaria */}
            <Route path="/dashboard" element={<DashboardScreen eliminarOT={eliminarOT} />} />

            <Route path="/" element={<IngresoScreen />} />

            {/* Tratamiento no tiene botón porque se llega desde "Solicitudes" */}
            <Route path="/tratamiento" element={<TratamientoScreen />} />

            <Route path="/gantt" element={<GanttScreen />} />
            <Route path="/recursos" element={<RecursosScreen />} />

          </Routes>
        </main>
      </div>
    </Router>
  );
}

const styles = {
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