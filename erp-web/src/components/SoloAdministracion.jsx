// Lo que ve alguien de operación si llega por URL a una pantalla de administración.
//
// El menú ya no le ofrece esas entradas, pero la dirección se puede escribir o venir en un
// link que alguien le pasó. Sin esto la pantalla se montaría, pediría sus datos, recibiría 403
// del backend y mostraría su propio error — distinto en cada una, y ninguno diciendo lo único
// que hay que saber: que no es una falla, es un permiso.
export default function SoloAdministracion() {
    return (
        <div style={{ maxWidth: 520, margin: '48px auto', padding: '20px 22px', background: '#fff', border: '1px solid rgba(0,0,0,.12)', borderRadius: 3 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Esta sección es de administración</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#57564f' }}>
                Tu cuenta es de operación. Si necesitas entrar acá, pídele a alguien de administración
                que te cambie el rol desde «Cuentas de oficina».
            </div>
        </div>
    );
}
