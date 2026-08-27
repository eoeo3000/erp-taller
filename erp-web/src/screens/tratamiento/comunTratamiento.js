// Tokens de estilo + helpers compartidos entre TratamientoScreen y sus pestañas ya
// extraídas a archivo propio (TabAntecedentes, TabDocumentosPdf). Ver plan de
// robustecimiento, punto 6 — extracción mínima para no duplicar `t`/`styles`/`fmtFecha`
// entre archivos ni crear un import circular (TratamientoScreen ⇄ pestañas).
export const t = {
    fondoMain: '#f6f5f2',
    superficie: '#ffffff',
    textoPrincipal: '#1a1a18',
    textoSecundario1: '#3a3a35',
    textoSecundario2: '#4a4a44',
    textoSecundario3: '#57564f',
    textoAtenuado1: '#6b6a63',
    textoAtenuado2: '#75746e',
    textoAtenuado3: '#8a8981',
    textoDeshabilitado: '#a3a29a',
    encabezadoTabla: '#e4e2dc',
    barraContexto: '#e9e7e2',
    barraFiltrosPie: '#f0efeb',
    hairlineFila: 'rgba(0,0,0,.06)',
    hairlineBloque: 'rgba(0,0,0,.10)',
    bordeZona: 'rgba(0,0,0,.12)',
    bordeInput: 'rgba(0,0,0,.18)',
    acento: 'oklch(0.48 0.10 250)',
    acentoHover: 'oklch(0.40 0.10 250)',
    verde: 'oklch(0.48 0.10 155)',
    ambar: 'oklch(0.55 0.11 65)',
    rojo: 'oklch(0.52 0.13 25)',
    fontUi: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, Menlo, monospace',
};

export const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const CLP = n => '$ ' + Math.round(n || 0).toLocaleString('es-CL');

export const styles = {
    raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: t.fondoMain, color: t.textoPrincipal, fontFamily: t.fontUi, fontSize: '13px' },
    header: { flex: 'none', display: 'flex', alignItems: 'baseline', gap: 14, padding: '9px 16px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    h1: { margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap' },
    empresa: { fontSize: 12.5, fontWeight: 600, color: t.textoSecundario1, whiteSpace: 'nowrap' },
    subtitulo: { fontSize: 11.5, color: t.textoAtenuado2, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    btnVolver: { marginLeft: 'auto', flex: 'none', height: 24, padding: '0 10px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11.5, color: '#262622', cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },

    pipeline: { flex: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 16px', padding: '6px 16px', background: t.barraContexto, borderBottom: `1px solid ${t.hairlineBloque}` },
    pipelineItem: { display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' },

    tabsFila: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '0 16px', background: t.barraFiltrosPie, borderBottom: `1px solid ${t.hairlineBloque}` },
    tabs: { display: 'flex', flexWrap: 'wrap', gap: 1 },
    tab: { height: 31, padding: '0 12px', background: 'transparent', border: 0, borderBottom: '2px solid transparent', fontSize: 11.5, fontWeight: 400, color: t.textoAtenuado1, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },
    tabActivo: { height: 31, padding: '0 12px', background: t.superficie, border: 0, borderBottom: `2px solid ${t.textoPrincipal}`, fontSize: 11.5, fontWeight: 700, color: t.textoPrincipal, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: t.fontUi },

    cuerpo: { flex: 1, minHeight: 0, display: 'flex' },
    contenido: { flex: 1, minWidth: 0, overflow: 'auto', background: t.superficie },

    tablaHeader: (grid) => ({
        position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center',
        height: 26, padding: '0 16px', background: t.encabezadoTabla, borderBottom: `1px solid ${t.bordeZona}`,
        fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.textoAtenuado1, fontWeight: 700,
    }),
    tablaFila: (grid) => ({ display: 'grid', gridTemplateColumns: grid, gap: 8, alignItems: 'center', padding: '4px 16px', borderBottom: `1px solid ${t.hairlineFila}` }),
    inputCelda: { height: 24, minWidth: 0, padding: '0 6px', fontFamily: 'inherit', fontSize: 11.5, color: t.textoPrincipal, borderRadius: 2, width: '100%', boxSizing: 'border-box' },
    celdaSubtotal: { fontFamily: t.fontMono, fontSize: 11.5, textAlign: 'right', color: t.textoPrincipal },
    xFila: { fontFamily: t.fontMono, fontSize: 12, color: '#c9c7c0', cursor: 'pointer', textAlign: 'center' },
    celdaResponsable: { display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 6px', border: '1px solid transparent', borderRadius: 2, minWidth: 0 },
    selectInvisible: { width: 16, flex: 'none', border: 'none', background: 'transparent', fontSize: 11, color: t.acento, cursor: 'pointer' },

    btnAgregar: { height: 24, padding: '0 10px', background: t.superficie, border: '1px dashed rgba(0,0,0,.28)', fontSize: 11.5, color: t.textoSecundario3, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    continuarWrap: { display: 'flex', justifyContent: 'flex-end', padding: '10px 16px' },
    btnOC: { height: 20, padding: '0 8px', background: t.superficie, border: `1px solid ${t.rojo}`, color: t.rojo, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

    campoLabel: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    etiqueta: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado2 },
    inputPlano: { height: 27, minWidth: 0, padding: '0 8px', border: `1px solid ${t.bordeInput}`, background: t.superficie, fontFamily: 'inherit', fontSize: 12, color: t.textoPrincipal, outline: 'none', borderRadius: 2, width: '100%', boxSizing: 'border-box' },
    avisoOk: { background: '#eafaf1', border: '1px solid rgba(0,0,0,.08)', borderRadius: 2, padding: '8px 10px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: t.verde },
    xFoto: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `1px solid ${t.bordeZona}`, fontSize: 11, lineHeight: '16px', textAlign: 'center', cursor: 'pointer', color: t.rojo },
    agregarFoto: { width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(0,0,0,.28)', borderRadius: 2, cursor: 'pointer', color: t.textoAtenuado3, fontSize: 11 },
    tituloSub: { fontSize: 9.5, letterSpacing: '.11em', textTransform: 'uppercase', color: t.textoAtenuado3, marginBottom: 7, padding: '11px 16px 0' },

    filaCosto: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '7px 0', borderBottom: `1px solid ${t.hairlineBloque}` },
    thGantt: { textAlign: 'left', padding: '4px 8px', background: t.encabezadoTabla, fontWeight: 700, color: t.textoAtenuado1, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' },
    tdGantt: { padding: '4px 8px', borderBottom: `1px solid ${t.hairlineFila}`, color: t.textoSecundario1 },

    tarjetaReporte: { background: t.superficie, border: `1px solid ${t.bordeZona}`, borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
    badgeAnulado: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(180,35,24,.85)', color: '#fff', fontWeight: 700, fontSize: 11, padding: '4px 10px', borderRadius: 2, letterSpacing: '.06em' },
    btnFilaTarjeta: { flex: 1, padding: 8, background: 'none', border: 'none', color: t.acento, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: t.fontUi },

    chip: { height: 24, padding: '0 11px', background: t.superficie, border: `1px solid ${t.bordeInput}`, fontSize: 11.5, color: t.textoSecundario1, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    chipActivo: { height: 24, padding: '0 11px', background: t.textoPrincipal, border: `1px solid ${t.textoPrincipal}`, fontSize: 11.5, color: '#fff', fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },

    asideTira: { width: 13, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.encabezadoTabla, color: t.textoAtenuado3, fontFamily: t.fontMono, fontSize: 12, cursor: 'pointer', borderLeft: `1px solid ${t.hairlineBloque}` },
    asideSeparador: { width: 5, flex: 'none', cursor: 'col-resize', background: t.encabezadoTabla, borderLeft: `1px solid ${t.hairlineBloque}`, borderRight: `1px solid ${t.hairlineBloque}` },
    aside: { flex: 'none', display: 'flex', flexDirection: 'column', background: t.fondoMain, minHeight: 0, overflow: 'hidden' },
    asideBloque: { flex: 'none', padding: '0 0 11px', background: t.superficie, borderBottom: `1px solid ${t.bordeZona}` },
    asideScroll: { flex: 1, minHeight: 0, overflow: 'auto' },
    fichaFila: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 16px', fontSize: 11.5 },
    fichaLabel: { color: t.textoAtenuado2, flex: 'none' },
    fichaValor: { fontFamily: t.fontMono, color: '#262622' },
    granTotalFila: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '7px 16px 0', paddingTop: 7, borderTop: '1px solid rgba(0,0,0,.16)' },
    accionesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
    btnAccion: { height: 28, padding: '0 8px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 11.5, fontWeight: 600, color: '#262622', cursor: 'pointer', borderRadius: 2, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: t.fontUi },
    btnPrimarioAside: { width: '100%', height: 30, marginTop: 6, background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    notaAside: { fontSize: 10.5, color: t.textoAtenuado3, marginTop: 6, lineHeight: 1.5 },

    btnPrimario: { height: 30, padding: '0 14px', background: t.acento, border: `1px solid ${t.acento}`, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 2, fontFamily: t.fontUi },
    btnSecundario: { height: 27, padding: '0 12px', background: t.superficie, border: `1px solid ${t.bordeZona}`, fontSize: 12, color: '#262622', cursor: 'pointer', borderRadius: 2, whiteSpace: 'nowrap', fontFamily: t.fontUi },

    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    modal: { background: t.superficie, borderRadius: 2, width: 450, boxShadow: '0 8px 24px rgba(0,0,0,.14)' },
    modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${t.hairlineBloque}` },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: `1px solid ${t.hairlineBloque}` },
    xModal: { fontFamily: t.fontMono, fontSize: 14, color: t.textoAtenuado3, cursor: 'pointer' },
    tagEmail: { display: 'inline-flex', alignItems: 'center', background: t.barraFiltrosPie, color: t.textoSecundario1, padding: '3px 8px', borderRadius: 2, margin: 3, fontSize: 11.5 },
};
