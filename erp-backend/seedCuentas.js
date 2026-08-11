require('dotenv').config();
const mongoose = require('mongoose');
const CuentaContable = require('./src/models/CuentaContable');

const PLAN = [
    // ── NIVEL 1 ──
    { codigo: '1',   nombre: 'ACTIVO',          tipo: 'Activo',     naturaleza: 'Deudora',    nivel: 1 },
    { codigo: '2',   nombre: 'PASIVO',           tipo: 'Pasivo',     naturaleza: 'Acreedora',  nivel: 1 },
    { codigo: '3',   nombre: 'PATRIMONIO',       tipo: 'Patrimonio', naturaleza: 'Acreedora',  nivel: 1 },
    { codigo: '4',   nombre: 'INGRESOS',         tipo: 'Ingreso',    naturaleza: 'Acreedora',  nivel: 1 },
    { codigo: '5',   nombre: 'COSTOS Y GASTOS',  tipo: 'Gasto',      naturaleza: 'Deudora',    nivel: 1 },

    // ── NIVEL 2 ──
    { codigo: '1.1', nombre: 'Activo Circulante',           tipo: 'Activo',     naturaleza: 'Deudora',    nivel: 2, _padre: '1' },
    { codigo: '1.2', nombre: 'Activo Fijo',                 tipo: 'Activo',     naturaleza: 'Deudora',    nivel: 2, _padre: '1' },
    { codigo: '2.1', nombre: 'Pasivo Circulante',           tipo: 'Pasivo',     naturaleza: 'Acreedora',  nivel: 2, _padre: '2' },
    { codigo: '2.2', nombre: 'Pasivo No Circulante',        tipo: 'Pasivo',     naturaleza: 'Acreedora',  nivel: 2, _padre: '2' },
    { codigo: '4.1', nombre: 'Ingresos Operacionales',      tipo: 'Ingreso',    naturaleza: 'Acreedora',  nivel: 2, _padre: '4' },
    { codigo: '4.2', nombre: 'Ingresos No Operacionales',   tipo: 'Ingreso',    naturaleza: 'Acreedora',  nivel: 2, _padre: '4' },
    { codigo: '5.1', nombre: 'Costo de Servicios',          tipo: 'Gasto',      naturaleza: 'Deudora',    nivel: 2, _padre: '5' },
    { codigo: '5.2', nombre: 'Gastos de Administración',    tipo: 'Gasto',      naturaleza: 'Deudora',    nivel: 2, _padre: '5' },
    { codigo: '5.3', nombre: 'Gastos Financieros',          tipo: 'Gasto',      naturaleza: 'Deudora',    nivel: 2, _padre: '5' },

    // ── NIVEL 3 — ACTIVO CIRCULANTE ──
    { codigo: '1.1.1', nombre: 'Caja',                         tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.2', nombre: 'Banco',                        tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.3', nombre: 'Cuentas por Cobrar Clientes',  tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.4', nombre: 'Documentos por Cobrar',        tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.5', nombre: 'Inventario de Materiales',     tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.6', nombre: 'Trabajos en Curso (WIP)',       tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },
    { codigo: '1.1.7', nombre: 'IVA Crédito Fiscal',           tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.1' },

    // ── NIVEL 3 — ACTIVO FIJO ──
    { codigo: '1.2.1', nombre: 'Maquinaria y Equipos',         tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.2' },
    { codigo: '1.2.2', nombre: 'Herramientas',                 tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.2' },
    { codigo: '1.2.3', nombre: 'Vehículos',                    tipo: 'Activo', naturaleza: 'Deudora',    nivel: 3, _padre: '1.2' },
    { codigo: '1.2.4', nombre: 'Depreciación Acumulada',       tipo: 'Activo', naturaleza: 'Acreedora',  nivel: 3, _padre: '1.2' },

    // ── NIVEL 3 — PASIVO CIRCULANTE ──
    { codigo: '2.1.1', nombre: 'Cuentas por Pagar Proveedores', tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 3, _padre: '2.1' },
    { codigo: '2.1.2', nombre: 'Remuneraciones por Pagar',      tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 3, _padre: '2.1' },
    { codigo: '2.1.3', nombre: 'IVA Débito Fiscal',             tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 3, _padre: '2.1' },
    { codigo: '2.1.4', nombre: 'Retenciones por Pagar',         tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 3, _padre: '2.1' },

    // ── NIVEL 3 — PASIVO NO CIRCULANTE ──
    { codigo: '2.2.1', nombre: 'Préstamos Bancarios Largo Plazo', tipo: 'Pasivo', naturaleza: 'Acreedora', nivel: 3, _padre: '2.2' },

    // ── NIVEL 3 — PATRIMONIO ──
    { codigo: '3.1', nombre: 'Capital',               tipo: 'Patrimonio', naturaleza: 'Acreedora', nivel: 2, _padre: '3' },
    { codigo: '3.2', nombre: 'Utilidades Acumuladas', tipo: 'Patrimonio', naturaleza: 'Acreedora', nivel: 2, _padre: '3' },
    { codigo: '3.3', nombre: 'Resultado del Ejercicio', tipo: 'Patrimonio', naturaleza: 'Acreedora', nivel: 2, _padre: '3' },

    // ── NIVEL 3 — INGRESOS ──
    { codigo: '4.1.1', nombre: 'Ingresos por Servicios (OTs)',      tipo: 'Ingreso', naturaleza: 'Acreedora', nivel: 3, _padre: '4.1' },
    { codigo: '4.1.2', nombre: 'Otros Ingresos Operacionales',      tipo: 'Ingreso', naturaleza: 'Acreedora', nivel: 3, _padre: '4.1' },
    { codigo: '4.2.1', nombre: 'Intereses Ganados',                  tipo: 'Ingreso', naturaleza: 'Acreedora', nivel: 3, _padre: '4.2' },

    // ── NIVEL 3 — COSTOS ──
    { codigo: '5.1.1', nombre: 'Costo de Materiales Directos',       tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.1' },
    { codigo: '5.1.2', nombre: 'Costo de Mano de Obra Directa',      tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.1' },
    { codigo: '5.1.3', nombre: 'Costo de Transporte y Logística',    tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.1' },

    // ── NIVEL 3 — GASTOS ADMINISTRACIÓN ──
    { codigo: '5.2.1', nombre: 'Remuneraciones Administración',  tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.2', nombre: 'Honorarios',                     tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.3', nombre: 'Arriendos',                      tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.4', nombre: 'Servicios Básicos',              tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.5', nombre: 'Comunicaciones y Telefonía',     tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.6', nombre: 'Útiles de Oficina',              tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.7', nombre: 'Mantención y Reparaciones',      tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.8', nombre: 'Seguros',                        tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },
    { codigo: '5.2.9', nombre: 'Otros Gastos Administración',    tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.2' },

    // ── NIVEL 3 — GASTOS FINANCIEROS ──
    { codigo: '5.3.1', nombre: 'Intereses Bancarios',   tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.3' },
    { codigo: '5.3.2', nombre: 'Comisiones Bancarias',  tipo: 'Gasto', naturaleza: 'Deudora', nivel: 3, _padre: '5.3' },
];

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado a MongoDB');

    const mapaId = {};

    // Insertar en orden: primero nivel 1, luego 2, luego 3
    for (const nivel of [1, 2, 3]) {
        const cuentasNivel = PLAN.filter(c => c.nivel === nivel);
        for (const c of cuentasNivel) {
            const { _padre, ...datos } = c;
            const padreId = _padre ? mapaId[_padre] || null : null;

            const guardada = await CuentaContable.findOneAndUpdate(
                { codigo: datos.codigo },
                { ...datos, padreId },
                { upsert: true, new: true }
            );
            mapaId[datos.codigo] = guardada._id;
            console.log(`  ✅ ${datos.codigo} — ${datos.nombre}`);
        }
    }

    console.log(`\n✅ Plan de cuentas cargado: ${PLAN.length} cuentas`);
    await mongoose.disconnect();
}

seed().catch(err => { console.error('❌', err.message); process.exit(1); });
