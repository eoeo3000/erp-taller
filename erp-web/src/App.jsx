// src/App.jsx
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import IngresoScreen from './screens/IngresoScreen';
import TratamientoScreen from './screens/TratamientoScreen';
import GanttScreen from './screens/GanttScreen';

function App() {
  return (
    <Router>
      <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Navbar simplificada: Solo las paradas principales del flujo */}
        <nav style={{ background: '#1a2a3a', padding: '15px 30px', display: 'flex', gap: '40px', alignItems: 'center' }}>
          <div style={{ color: '#3498db', fontWeight: 'bold', fontSize: '20px', marginRight: '20px' }}>ERP SISTEMA</div>
          <Link style={styles.link} to="/">SOLICITUDES</Link>
          <Link style={styles.link} to="/gantt">PLANO COMPLETO (GANTT)</Link>
        </nav>

        <main style={{ flex: 1, width: '100%', backgroundColor: '#f0f2f5' }}>
          <Routes>
            <Route path="/" element={<IngresoScreen />} />
            {/* Esta ruta existe, pero no tiene botón en el menú */}
            <Route path="/tratamiento" element={<TratamientoScreen />} />
            <Route path="/gantt" element={<GanttScreen />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

const styles = {
  link: { color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }
};

export default App;