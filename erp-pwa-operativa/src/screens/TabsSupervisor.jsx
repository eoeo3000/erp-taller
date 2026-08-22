// Pestañas Mi panel / Mi día — visibles solo para rol supervisor (README §1: un ejecutor
// abre directo en Mi día, sin pestañas). En S1 son parte de su propio encabezado (ver
// prototipo); acá se exponen como pieza compartida para poder volver desde Mi día también.
export default function TabsSupervisor({ activa, nav }) {
    const tab = (id, label) => (
        <button
            key={id}
            onClick={() => nav.reemplazar(id)}
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                paddingBottom: 9, fontSize: 15, fontWeight: 600,
                color: activa === id ? 'var(--texto-principal)' : 'var(--texto-atenuado-1)',
                boxShadow: activa === id ? 'inset 0 -2px 0 var(--texto-principal)' : 'none',
            }}
        >
            {label}
        </button>
    );
    return (
        <div style={{ display: 'flex', gap: 22 }}>
            {tab('s1', 'Mi panel')}
            {tab('o2', 'Mi día')}
        </div>
    );
}
