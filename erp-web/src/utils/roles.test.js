// Qué pantalla ve cada rol. La protección real es el 403 del backend; esto fija que la pantalla
// no le ofrezca a nadie lo que no puede usar, y —sobre todo— que operación siga viendo lo que
// necesita para armar una OT con sus precios, que es lo que decidió el dueño del producto.
import { test, expect } from 'vitest';
import { esAdministracion, puedeVer, RUTAS_DE_ADMINISTRACION, ROLES_DE_OFICINA } from './roles.js';

const admin = { rol: 'administrador' };
const operacion = { rol: 'operacion' };

test('administración ve todo', () => {
    for (const r of [...RUTAS_DE_ADMINISTRACION, '/', '/tratamiento']) expect(puedeVer(admin, r), r).toBe(true);
});

test('operación no ve la plata, lo masivo ni los accesos', () => {
    for (const r of ['/tokens', '/importexport', '/finanzas', '/contabilidad']) expect(puedeVer(operacion, r), r).toBe(false);
});

test('operación SÍ ve todo lo que necesita para armar una OT con sus precios', () => {
    // Si alguna de estas entrara por error a RUTAS_DE_ADMINISTRACION, la operación quedaría sin
    // poder hacer su trabajo — y como el backend tampoco la cierra, el síntoma sería solo un
    // menú más corto y nadie entendería por qué.
    for (const r of ['/', '/dashboard', '/tratamiento', '/gantt', '/tablero-supervisores', '/recursos', '/clientes', '/compras', '/reporte']) {
        expect(puedeVer(operacion, r), r).toBe(true);
    }
});

test('sin usuario (login apagado) se ve todo, igual que antes de existir los roles', () => {
    expect(esAdministracion(null)).toBe(true);
    expect(puedeVer(undefined, '/finanzas')).toBe(true);
});

test('un rol de terreno o desconocido NO vale como administración', () => {
    for (const rol of ['supervisor', 'ejecutor', 'superadmin', '']) expect(esAdministracion({ rol }), rol).toBe(false);
});

test('los roles que ofrece el selector son exactamente los de oficina del backend', () => {
    // Si el SPA ofreciera un rol que el backend no acepta, la invitación fallaría con 400.
    expect(ROLES_DE_OFICINA.map((r) => r.id).sort()).toEqual(['administrador', 'operacion']);
});
