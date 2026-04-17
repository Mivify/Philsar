const Module = require('../models/Module');

// Get all modules
const getModules = async (req, res) => {
    try {
        const modules = await Module.findAll();
        res.status(200).json(modules);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving modules', error: error.message });
    }
};

// Get single module
const getModuleById = async (req, res) => {
    try {
        const { id } = req.params;
        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });
        res.status(200).json(moduleItem);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving module', error: error.message });
    }
};

// Create module (Admin only typically, open for now)
const createModule = async (req, res) => {
    try {
        const { title, description, content, imageUrl } = req.body;
        const moduleItem = await Module.create({ title, description, content, imageUrl });
        res.status(201).json({ message: 'Module created', module: moduleItem });
    } catch (error) {
        res.status(500).json({ message: 'Error creating module', error: error.message });
    }
};

module.exports = { getModules, getModuleById, createModule };
