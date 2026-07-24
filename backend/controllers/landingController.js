const LandingImage = require('../models/LandingImage');

const getLandingImages = async (req, res) => {
    try {
        const images = await LandingImage.findAll({ order: [['createdAt', 'ASC']] });
        res.status(200).json(images);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving landing images', error: error.message });
    }
};

// The image itself is uploaded separately via the existing modules upload endpoint
// (Cloudinary-backed) — this just records the resulting URL as a carousel entry.
const addLandingImage = async (req, res) => {
    try {
        const { imageUrl } = req.body;
        if (!imageUrl) {
            return res.status(400).json({ message: 'Missing imageUrl' });
        }

        const image = await LandingImage.create({ imageUrl });
        res.status(201).json({ message: 'Landing image added successfully', image });
    } catch (error) {
        res.status(500).json({ message: 'Error adding landing image', error: error.message });
    }
};

const deleteLandingImage = async (req, res) => {
    try {
        const { id } = req.params;
        const image = await LandingImage.findByPk(id);
        if (!image) {
            return res.status(404).json({ message: 'Landing image not found' });
        }

        await image.destroy();
        res.status(200).json({ message: 'Landing image removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error removing landing image', error: error.message });
    }
};

module.exports = { getLandingImages, addLandingImage, deleteLandingImage };
