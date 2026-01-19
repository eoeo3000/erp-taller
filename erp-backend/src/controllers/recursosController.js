const Recurso = require('../models/Recurso');
const Ot = require('../models/OT');
// 1. Obtener todos los recursos
exports.getRecursos = async (req, res) => {
    try {
        const recursos = await Recurso.find();
        res.json(recursos || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Crear un recurso nuevo (Ya no usa Date.now(), Mongo crea el _id)
exports.crearRecurso = async (req, res) => {
    try {
        const nuevo = new Recurso({
            ...req.body,
            ausencias: []
        });
        await nuevo.save();
        res.status(201).json(nuevo);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// 3. Registrar ausencia (Actualizado para MongoDB)
exports.registrarAusenciaRecurso = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, motivo } = req.body;

        const recurso = await Recurso.findById(id);
        if (!recurso) return res.status(404).send("Recurso no encontrado");

        recurso.ausencias.push({ fecha, motivo });
        await recurso.save();

        res.json({ success: true, recurso });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 4. Actualizar Recurso y Ajustes de Capacidad (EL MÁS IMPORTANTE)
// src/controllers/recursosController.js

exports.updateRecurso = async (req, res) => {
    try {
        const { id } = req.params;
        const { calendarioId, ajustes, nombre, puesto, fechaInicioCiclo } = req.body;

        // 1. Buscamos y actualizamos el recurso
        // Usamos findByIdAndUpdate para obtener los datos nuevos directamente
        const recurso = await Recurso.findByIdAndUpdate(
            id,
            {
                nombre,
                puesto,
                fechaInicioCiclo,
                calendarioId: (calendarioId === "" || calendarioId === "null") ? null : calendarioId
            },
            { new: true } // Esto nos devuelve el documento ya actualizado
        );

        if (!recurso) return res.status(404).json({ error: "Recurso no encontrado" });

        // 2. Manejo de ajustes (REEMPLAZO TOTAL)
        if (ajustes) {
            // Si ajustes es un objeto vacío {}, limpiamos todo
            if (Object.keys(ajustes).length === 0) {
                recurso.ajustes = new Map(); // O {} según tu Schema
            } else {
                // Si trae datos, los actualizamos/añadimos
                Object.keys(ajustes).forEach(fecha => {
                    recurso.ajustes.set(fecha, ajustes[fecha]);
                });
            }
            await recurso.save();
        }

        // 3. SINCRONIZACIÓN CON GANTT: Si cambió el nombre o puesto, actualizamos las OTs
        await Ot.updateMany(
            { "tareas.operarioId": id },
            {
                $set: {
                    "tareas.$[elem].operarioNombre": recurso.nombre,
                    "tareas.$[elem].puesto": recurso.puesto
                }
            },
            { arrayFilters: [{ "elem.operarioId": id }] }
        );

        res.json(recurso);
    } catch (error) {
        console.error("❌ Error en updateRecurso:", error);
        res.status(500).json({ error: error.message });
    }
};

// 5. Personal (Si decides crear un modelo aparte para Personal, 
// puedes seguir la misma lógica que Recursos)
exports.getPersonal = async (req, res) => {
    // Aquí podrías usar otro modelo si lo separas
    res.json([]);
};

// En controllers/recursosController.js

exports.eliminarRecurso = async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await Recurso.findByIdAndDelete(id);

        if (!resultado) return res.status(404).json({ mensaje: "No encontrado" });

        // Limpieza en OTs para que desaparezcan de la Gantt
        await Ot.updateMany(
            { "tareas.operarioId": id },
            {
                $set: {
                    "tareas.$[elem].operarioNombre": "Sin asignar",
                    "tareas.$[elem].operarioId": null,
                    "tareas.$[elem].puesto": ""
                }
            },
            { arrayFilters: [{ "elem.operarioId": id }] }
        );

        res.status(200).json({ mensaje: "Eliminado correctamente" });
    } catch (error) {
        res.status(500).json({ mensaje: "Error interno" });
    }
};