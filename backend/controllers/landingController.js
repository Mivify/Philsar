const LandingImage = require('../models/LandingImage');

const getLandingImages = async (req, res) => {
    try {
        const images = await LandingImage.findAll({ order: [['position', 'ASC'], ['createdAt', 'ASC']] });
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

        // New uploads go to the end of the rotation rather than defaulting to 0,
        // which would otherwise jump them ahead of any already-reordered photos.
        const maxPosition = await LandingImage.max('position');
        const position = (Number.isFinite(maxPosition) ? maxPosition : 0) + 1;

        const image = await LandingImage.create({ imageUrl, position });
        res.status(201).json({ message: 'Landing image added successfully', image });
    } catch (error) {
        res.status(500).json({ message: 'Error adding landing image', error: error.message });
    }
};

// Persists the admin's drag-reordered sequence in one shot: body is the full list
// of landing image IDs in the desired display order. Position is just each id's
// index in that array, so no gaps or uniqueness bookkeeping is needed.
const reorderLandingImages = async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return res.status(400).json({ message: 'orderedIds must be a non-empty array' });
        }

        await Promise.all(
            orderedIds.map((id, index) => LandingImage.update({ position: index }, { where: { id } }))
        );

        const images = await LandingImage.findAll({ order: [['position', 'ASC'], ['createdAt', 'ASC']] });
        res.status(200).json({ message: 'Order updated successfully', images });
    } catch (error) {
        res.status(500).json({ message: 'Error reordering landing images', error: error.message });
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

module.exports = { getLandingImages, addLandingImage, deleteLandingImage, reorderLandingImages };
