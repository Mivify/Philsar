const Module = require('../models/Module');
const fs = require('fs');
const path = require('path');

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

// Create module
const createModule = async (req, res) => {
    try {
        const { title, description, content, imageUrl } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }
        const moduleItem = await Module.create({ title, description, content, imageUrl });
        res.status(201).json({ message: 'Module created successfully', module: moduleItem });
    } catch (error) {
        res.status(500).json({ message: 'Error creating module', error: error.message });
    }
};

// Update module
const updateModule = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, content, imageUrl } = req.body;

        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        if (title) moduleItem.title = title;
        if (description !== undefined) moduleItem.description = description;
        if (content) moduleItem.content = content;
        if (imageUrl !== undefined) moduleItem.imageUrl = imageUrl;

        await moduleItem.save();
        res.status(200).json({ message: 'Module updated successfully', module: moduleItem });
    } catch (error) {
        res.status(500).json({ message: 'Error updating module', error: error.message });
    }
};

// Delete module
const deleteModule = async (req, res) => {
    try {
        const { id } = req.params;
        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        await moduleItem.destroy();
        res.status(200).json({ message: 'Module deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting module', error: error.message });
    }
};

// Upload Cover Image (Base64 handler)
const uploadImage = async (req, res) => {
    try {
        const { base64Data, fileName } = req.body;

        if (!base64Data || !fileName) {
            return res.status(400).json({ message: 'Missing image data or file name' });
        }

        // Clean base64 header
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ message: 'Invalid base64 image data' });
        }

        const buffer = Buffer.from(matches[2], 'base64');
        
        // Ensure uploads directory exists
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique file name
        const ext = path.extname(fileName) || '.png';
        const baseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueFileName = `${baseName}-${Date.now()}${ext}`;
        const filePath = path.join(uploadDir, uniqueFileName);

        // Write buffer to file
        fs.writeFileSync(filePath, buffer);

        // Return public url
        const publicUrl = `http://localhost:5000/uploads/${uniqueFileName}`;
        res.status(200).json({ url: publicUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Error uploading image file', error: error.message });
    }
};

module.exports = { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage };
