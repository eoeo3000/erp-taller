// src/App.jsx
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { obtenerHorasParaDia as obtenerHorasParaDiaPura } from './utils/calendario';

function NavPortalGuard({ children }) {
  const loc = useLocation();
  if (loc.pathname.startsWith('/portal')) return null;
  return children;
}

// Franja ámbar persistente del modo demostración (§9.2 del README de rediseño): visible en
// todas las pantallas internas mientras el entorno activo sea 'demo', nunca en el portal
// cliente (esa pantalla la ve un cliente externo, no el staff que alterna de entorno).
function BannerDemo({ entorno, onVolver }) {
  const loc = useLocation();
  if (loc.pathname.startsWith('/portal')) return null;
  if (entorno !== 'demo') return null;
  return (
    <div style={stylesBannerDemo.franja}>
      <span>Entorno de demostración — estos datos son ficticios, no son del taller.</span>
      <span onClick={onVolver} style={stylesBannerDemo.accion}>Volver a producción</span>
    </div>
  );
}

const stylesBannerDemo = {
  franja: {
    flex: 'none', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
    background: 'oklch(0.55 0.11 65)', color: '#ffffff', fontSize: 11, fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  accion: { textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 },
};
import axios from 'axios';
import IngresoScreen from './screens/IngresoScreen';
import TratamientoScreen from './screens/TratamientoScreen';
import GanttScreen from './screens/GanttScreen';
import DashboardScreen from './screens/DashboardScreen';
import RecursosScreen from './screens/RecursosScreen'
import React, { useState, useEffect } from 'react';
import ReporteTerreno from './screens/ReporteTerreno';
import FinanzasScreen from './screens/FinanzasScreen';
import ComprasScreen from './screens/ComprasScreen';
import ContabilidadScreen from './screens/ContabilidadScreen';
import ImportExportScreen from './screens/ImportExportScreen';
import PortalClienteScreen from './screens/PortalClienteScreen';
import ClientesScreen from './screens/ClientesScreen';
import BodegaTokensScreen from './screens/BodegaTokensScreen';
import TableroSupervisoresScreen from './screens/TableroSupervisoresScreen';
import useIsMobile from './hooks/useIsMobile';
import { obtenerEntorno, fijarEntorno } from './utils/entorno';
import { notificar, confirmar } from './utils/notificar';
import NotificacionesHost from './components/NotificacionesHost';
import usePuestos from './hooks/usePuestos';
import usePlantillas from './hooks/usePlantillas';
import useComponentes from './hooks/useComponentes';
import useSuministros from './hooks/useSuministros';
import useRecursos from './hooks/useRecursos';
import useOts from './hooks/useOts';
import useSolicitudes from './hooks/useSolicitudes';
import useCalendarios from './hooks/useCalendarios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
function App() {
  const isMobile = useIsMobile();
  const [navW, setNavW] = useState(186);
  const [navOculta, setNavOculta] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [entornoActivo] = useState(obtenerEntorno());
  const volverAProduccion = () => { fijarEntorno('produccion'); window.location.reload(); };
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  // Estado y CRUD de cada dominio viven en su propio hook (ver plan de robustecimiento,
  // punto 5) — App.jsx queda como composición: orquesta el sync compartido de /api/data
  // (cargarDatos, el polling de abajo) y los pocos flujos que cruzan dos dominios a la vez
  // (eliminarRecurso, eliminarCalendarioMaestro, asignarCalendarioGlobal, más abajo).
  // `cargarDatos` se pasa como función lazy a los hooks que la necesitan para no depender
  // del orden de declaración entre ellos y la propia `cargarDatos`.
  const { recursos, setRecursos, crearRecurso, actualizarRecurso, guardarCambioManualGlobal } = useRecursos();
  // `actualizarProgresoTarea` no se destructura: no se usa en ningún lado (ya estaba sin
  // usar antes de esta extracción, confirmado por grep y por el lint de no-unused-vars).
  const { ots, setOts, otSeleccionada, setOtSeleccionada, eliminarOT, actualizarOtGlobal, editarOtGlobal } = useOts(() => cargarDatos());
  const { solicitudes, setSolicitudes, crearSolicitudGlobal, actualizarSolicitudGlobal, eliminarSolicitud, liberarSolicitudManual, actualizarEstadoSolicitud, aprobarYCrearOT } = useSolicitudes(() => cargarDatos());
  const { calendarios, setCalendarios, guardarCalendarioGlobal } = useCalendarios(() => cargarDatos());
  const { componentes, setComponentes, crearEquipo, eliminarEquipo, actualizarEquipo } = useComponentes();
  const { suministros, setSuministros, crearSuministro, eliminarSuministro, actualizarSuministro, ajustarStockSuministro, obtenerMovimientosStock } = useSuministros();
  const { puestosDB, setPuestosDB, crearPuesto, eliminarPuesto } = usePuestos();
  const { plantillas, setPlantillas, crearPlantilla, actualizarPlantilla, eliminarPlantilla } = usePlantillas();

  const cargarDatos = async () => {
    try {
      const respuesta = await axios.get(`${API}/data`);
      const d = respuesta.data;

      // Data consolidada existente
      setOts(d.ots || []);
      setSolicitudes(d.solicitudes || []);
      setCalendarios(d.calendarios || []);

      // Pantalla de Recursos
      setRecursos(d.recursos || []); // Personal
      setComponentes(d.equipos || []); // Activos
      setSuministros(d.suministros || []); // Antes logistica

      // 🚩 NUEVO: Cargamos los puestos/especialidades configurados
      if (d.puestos) setPuestosDB(d.puestos);
      if (d.plantillas) setPlantillas(d.plantillas);

      setUltimaSync(new Date());
      setErrorCarga(null);
    } catch (error) {
      console.error("❌ Error en la carga inicial:", error);
      setErrorCarga('No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos(); // Carga inicial inmediata

    const interval = setInterval(async () => {
      // Con la pestaña en segundo plano nadie está mirando estos datos — nos saltamos
      // el poll para no seguir golpeando /api/data sin necesidad.
      if (document.visibilityState !== 'visible') return;
      try {
        // Usamos axios para mantener la consistencia
        const { data } = await axios.get(`${API}/data`);

        // Sincronización inteligente: solo actualiza si hay cambios reales.
        // IMPORTANTE: comparamos contra 'prev' dentro del propio setState funcional,
        // no contra las variables de estado del closure — así este efecto no necesita
        // depender de ots/solicitudes/etc. Antes SÍ dependía de ellas (ver historial),
        // y como cargarDatos() las reescribe con una referencia nueva en cada llamada,
        // el efecto se desmontaba y volvía a montar solo, disparando /api/data cada
        // pocos segundos en vez de cada 30 (ver docs/bugs-conocidos.md).
        const syncState = (next, setter) => {
          setter(prev => (JSON.stringify(prev) !== JSON.stringify(next) ? (next || []) : prev));
        };

        syncState(data.ots, setOts);
        syncState(data.solicitudes, setSolicitudes);
        syncState(data.recursos, setRecursos);
        syncState(data.calendarios, setCalendarios);
        syncState(data.equipos, setComponentes);
        syncState(data.suministros, setSuministros);

      } catch (error) {
        console.error("❌ Error en refresco automático:", error);
      }
    }, 30000); // 30 segundos es un buen equilibrio

    return () => clearInterval(interval);
  }, []); // Se monta una sola vez — el intervalo interno no necesita reiniciarse por cambios de estado

  // Shell nuevo (ver docs/rediseno/design_handoff_panel_control/README.md, paso 1):
  // nav lateral colapsable con ancho arrastrable, en vez del top bar. En móvil arranca colapsada.
  useEffect(() => { if (isMobile) setNavOculta(true); }, [isMobile]);

  const dragNav = (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = navW;
    const mover = (ev) => setNavW(Math.min(320, Math.max(132, Math.round(w0 + (ev.clientX - x0)))));
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  };

  // Lógica pura (calendario rotativo/semanal, ajustes manuales, bloques horarios) vive en
  // utils/calendario.js — testeada ahí. Este wrapper solo liga `calendarios` desde el estado
  // del componente para no tener que tocar la firma de 2 argumentos que ya usan GanttScreen y
  // RecursosScreen.
  const obtenerHorasParaDia = (recurso, diaCalendario) => obtenerHorasParaDiaPura(recurso, diaCalendario, calendarios);

  // --- Flujos que cruzan dos dominios a la vez: se quedan en App.jsx como orquestación
  // entre los hooks de cada uno, en vez de forzar que un hook manipule el estado de otro. ---
  const eliminarRecurso = async (id) => {
    try {
      const respuesta = await axios.delete(`${API}/recursos/${id}`);

      if (respuesta.status === 200 || respuesta.status === 204) {
        // 1. Quitamos a la persona de la lista de operarios
        setRecursos(prev => prev.filter(r => String(r._id) !== String(id)));

        // 2. LA CLAVE PARA LA GANTT: Limpiamos su nombre de todas las tareas
        setOts(prevOts => prevOts.map(ot => ({
          ...ot,
          tareas: ot.tareas?.map(t =>
            String(t.operarioId) === String(id)
              ? { ...t, operarioId: null, operarioNombre: "Sin asignar", puesto: "" }
              : t
          )
        })));

      }
    } catch (error) {
      console.error("❌ Error al eliminar:", error);
      notificar.error("No se pudo eliminar el recurso");
    }
  };

  const eliminarCalendarioMaestro = async (id) => {
    if (!(await confirmar("¿Estás seguro de eliminar este turno? Los operarios asignados quedarán 'Sin Turno'."))) return;

    try {
      // Asegúrate de que la URL sea la de calendarios, no recursos
      const respuesta = await axios.delete(`${API}/calendarios/${id}`);

      if (respuesta.status === 200) {
        // 1. Quitar de la lista de calendarios maestros
        setCalendarios(prev => prev.filter(c => String(c._id) !== String(id)));

        // 2. Actualizar localmente los recursos para que no apunten al ID borrado
        setRecursos(prev => prev.map(r =>
          String(r.calendarioId) === String(id)
            ? { ...r, calendarioId: null }
            : r
        ));
      }
    } catch (error) {
      console.error("❌ Error al eliminar calendario:", error);
      notificar.error("No se pudo eliminar el calendario");
    }
  };

  const asignarCalendarioGlobal = async (recursoId, calendarioId) => {
    try {
      const valorParaEnviar = calendarioId || null;

      // FORZAMOS el objeto vacío aquí
      const bodyPeticion = {
        calendarioId: valorParaEnviar,
        ajustes: {}
      };

      await axios.put(`${API}/recursos/${recursoId}`, bodyPeticion);

      // Actualizamos el estado local
      setRecursos(prev => prev.map(r =>
        r._id === recursoId
          ? { ...r, calendarioId: valorParaEnviar, ajustes: {} }
          : r
      ));

      // IMPORTANTE: Si cargarDatos() vuelve a traer los recursos de la BD,
      // asegúrate de que el backend realmente haya guardado el {}
      await cargarDatos();

    } catch (error) {
      console.error("❌ Error:", error);
    }
  };

  // Paso 9 del rediseño (ver design_handoff_panel_control/README.md §4): variantes de disposición
  // compartidas — la app no tiene usuarios ni roles, así que quedan globales para quien abra la pantalla.
  const guardarDisposicionGlobal = async (datos) => {
    try {
      const res = await axios.post(`${API}/disposiciones`, datos);
      return { exito: true, disposicion: res.data };
    } catch (error) {
      console.error('Error al guardar la disposición:', error);
      return { exito: false };
    }
  };

  const eliminarDisposicionGlobal = async (id) => {
    try {
      await axios.delete(`${API}/disposiciones/${id}`);
      return true;
    } catch (error) {
      console.error('Error al eliminar la disposición:', error);
      return false;
    }
  };

  const enviarPortalCliente = (solicitud) => {
    if (!solicitud) return;
    const telefono = (solicitud.numero || '').replace(/\D/g, '');
    if (!telefono) {
      notificar.advertencia('Esta solicitud no tiene un número de contacto registrado.');
      return;
    }

    const urlBase = window.location.origin.trim();
    const codigo = solicitud.numeroSolicitud || solicitud._id;
    // tab=estado + q= precarga la búsqueda en el Portal del Cliente para que no tenga que tipear el código
    const linkPortal = `${urlBase}/portal?tab=estado&q=${encodeURIComponent(codigo)}`;

    const mensaje = `Hola ${solicitud.solicitante || ''}, puede seguir el estado de su solicitud *${codigo}* desde nuestro portal:\n\n${linkPortal}`;

    const urlFinal = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlFinal, '_blank');
  };

  // Contadores reales del nav (nada de placeholders) — ver §1 del handoff.
  const solicitudesSinOT = solicitudes.filter(s => !ots.find(o => String(o.solicitudId) === String(s._id))).length;
  const otsProgramables = ots.filter(o => o.estado === 'Planificada' || o.estado === 'Programada').length;
  const horaSync = ultimaSync ? ultimaSync.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—';

  const navOperacion = [
    { to: '/', label: 'Ingreso', count: solicitudesSinOT },
    { to: '/dashboard', label: 'Panel de control', count: ots.length },
    { to: '/gantt', label: 'Programación', count: otsProgramables },
    { to: '/tablero-supervisores', label: 'Tablero de supervisores', count: null },
  ];
  const navAdmin = [
    { to: '/recursos', label: 'Recursos' },
    { to: '/clientes', label: 'Clientes' },
    { to: '/tokens', label: 'Bodega de tokens' },
    { to: '/importexport', label: 'Importar / exportar' },
  ];
  // Fuera del nav por decisión del cliente (siguen existiendo y accesibles por URL directa):
  // Compras (/compras), Finanzas (/finanzas), Contabilidad (/contabilidad), Portal cliente (/portal).

  return (
    <Router>
      <div style={styles.raiz}>
        <NotificacionesHost />
        <NavPortalGuard>
          {!navOculta && (
            <>
              <nav style={{ ...styles.nav, width: navW }}>
                <div style={styles.navMarca}>
                  <div style={styles.navMarcaTitulo}>Taller ERP</div>
                </div>
                <div style={styles.navGrupo}>
                  <div style={styles.navGrupoLabel}>Operación</div>
                  {navOperacion.map(item => (
                    <NavLink key={item.to} to={item.to}
                      style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActivo : {}) })}>
                      <span style={styles.navItemLabel}>{item.label}</span>
                      {item.count !== null && <span style={styles.navItemCount}>{item.count}</span>}
                    </NavLink>
                  ))}
                </div>
                <div style={styles.navGrupo}>
                  <div style={styles.navGrupoLabel}>Administración</div>
                  {navAdmin.map(item => (
                    <NavLink key={item.to} to={item.to}
                      style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActivo : {}) })}>
                      <span style={styles.navItemLabel}>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
                <div style={styles.navPie}>Sincronizado {horaSync}</div>
              </nav>
              <div
                onPointerDown={dragNav}
                title="Arrastra para ajustar el ancho de la navegación"
                style={styles.navSeparador}
              />
            </>
          )}
          <div
            onClick={() => setNavOculta(v => !v)}
            title={navOculta ? 'Mostrar navegación' : 'Ocultar navegación'}
            style={styles.navTira}
          >
            {navOculta ? '›' : '‹'}
          </div>
        </NavPortalGuard>

        <main style={styles.main}>
          <BannerDemo entorno={entornoActivo} onVolver={volverAProduccion} />
          <Routes>
            <Route path="/reporte" element={<ReporteTerreno ots={ots} actualizarOtGlobal={actualizarOtGlobal} />} />
            <Route path="/" element={<IngresoScreen solicitudes={solicitudes} liberarSolicitudManual={liberarSolicitudManual} crearSolicitudGlobal={crearSolicitudGlobal} actualizarSolicitudGlobal={actualizarSolicitudGlobal} setSolicitudes={setSolicitudes} cargarDatos={cargarDatos} API={API} ots={ots} enviarPortalCliente={enviarPortalCliente} cargando={cargando} errorCarga={errorCarga} guardarDisposicionGlobal={guardarDisposicionGlobal} eliminarDisposicionGlobal={eliminarDisposicionGlobal} />} />
            <Route path="/dashboard" element={<DashboardScreen solicitudes={solicitudes} ots={ots} eliminarOT={eliminarOT} eliminarSolicitud={eliminarSolicitud} actualizarEstadoSolicitud={actualizarEstadoSolicitud} aprobarYCrearOT={aprobarYCrearOT} recursos={recursos} API={API} cargando={cargando} errorCarga={errorCarga} cargarDatos={cargarDatos} guardarDisposicionGlobal={guardarDisposicionGlobal} eliminarDisposicionGlobal={eliminarDisposicionGlobal} />} />
            <Route path="/tratamiento" element={<TratamientoScreen recurso={recursos} puestosDB={puestosDB} componentes={componentes} actualizarOtGlobal={actualizarOtGlobal} editarOtGlobal={editarOtGlobal} cargarDatos={cargarDatos} API={API} recursos={recursos} suministros={suministros} otSeleccionada={otSeleccionada} setOtSeleccionada={setOtSeleccionada} plantillas={plantillas} />} />
            <Route path="/gantt" element={<GanttScreen ots={ots} recursos={recursos} calendarios={calendarios} obtenerHorasParaDia={obtenerHorasParaDia} actualizarOtGlobal={actualizarOtGlobal} cargarDatos={cargarDatos} />} />
            <Route path="/recursos" element={
              <RecursosScreen
                // Props existentes
                recursos={recursos}
                calendarios={calendarios}
                ots={ots}
                crearRecurso={crearRecurso}
                eliminarRecurso={eliminarRecurso}
                actualizarRecurso={actualizarRecurso}
                componentes={componentes}
                suministros={suministros}
                crearEquipo={crearEquipo}
                eliminarEquipo={eliminarEquipo}
                crearSuministro={crearSuministro}
                eliminarSuministro={eliminarSuministro}
                actualizarSuministro={actualizarSuministro}
                ajustarStockSuministro={ajustarStockSuministro}
                obtenerMovimientosStock={obtenerMovimientosStock}
                obtenerHorasParaDia={obtenerHorasParaDia}
                puestosDB={puestosDB}
                crearPuesto={crearPuesto}
                eliminarPuesto={eliminarPuesto}
                actualizarEquipo={actualizarEquipo}
                guardarCalendarioGlobal={guardarCalendarioGlobal}
                asignarCalendario={asignarCalendarioGlobal}
                guardarCambioManualGlobal={guardarCambioManualGlobal}
                eliminarCalendarioMaestro={eliminarCalendarioMaestro}
                plantillas={plantillas}
                crearPlantilla={crearPlantilla}
                actualizarPlantilla={actualizarPlantilla}
                eliminarPlantilla={eliminarPlantilla}
              />
            } />
            <Route path="/compras" element={<ComprasScreen ots={ots} suministros={suministros} />} />
            <Route path="/finanzas" element={<FinanzasScreen recursos={recursos} API={API} />} />
            <Route path="/contabilidad" element={<ContabilidadScreen API={API} />} />
            <Route path="/importexport" element={<ImportExportScreen API={API} cargarDatos={cargarDatos} />} />
            <Route path="/portal" element={<PortalClienteScreen API={API} />} />
            <Route path="/clientes" element={<ClientesScreen API={API} />} />
            <Route path="/tokens" element={<BodegaTokensScreen API={API} />} />
            <Route path="/tablero-supervisores" element={<TableroSupervisoresScreen API={API} recursos={recursos} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

// Tokens del handoff (docs/rediseno/design_handoff_panel_control/README.md §2) — definitivos, sin librerías nuevas.
const fontUi = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const fontMono = 'ui-monospace, Menlo, monospace';

const styles = {
  raiz: {
    display: 'flex', height: '100dvh', maxHeight: '100dvh', width: '100%',
    background: '#eceae5', color: '#1a1a18', fontSize: '13px', fontFamily: fontUi,
    overflow: 'hidden',
  },
  nav: {
    flex: 'none', background: '#1c1d1b', color: '#e8e7e3',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  navMarca: { padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,.09)' },
  navMarcaTitulo: { fontSize: '12.5px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  navGrupo: { padding: '12px 0 4px' },
  navGrupoLabel: { fontSize: '9.5px', letterSpacing: '.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,.34)', padding: '0 14px 6px', whiteSpace: 'nowrap' },
  navItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
    padding: '6px 14px', fontSize: '12.5px', color: 'rgba(255,255,255,.72)', textDecoration: 'none',
    borderLeft: '2px solid transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  navItemActivo: { background: 'rgba(255,255,255,.10)', borderLeft: '2px solid oklch(0.62 0.11 250)', color: '#fff' },
  navItemLabel: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
  navItemCount: { fontFamily: fontMono, fontSize: '10.5px', color: 'rgba(255,255,255,.36)', flex: 'none' },
  navPie: {
    marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.09)',
    fontSize: '10.5px', color: 'rgba(255,255,255,.38)', fontFamily: fontMono, whiteSpace: 'nowrap', overflow: 'hidden',
  },
  navSeparador: { width: '5px', flex: 'none', cursor: 'col-resize', background: '#1c1d1b', borderRight: '1px solid rgba(0,0,0,.18)' },
  navTira: {
    width: '13px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1c1d1b', color: 'rgba(255,255,255,.45)', fontFamily: fontMono, fontSize: '12px',
    cursor: 'pointer', borderRight: '1px solid rgba(0,0,0,.20)',
  },
  main: { flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#f6f5f2', overflow: 'hidden' },
};

export default App;
