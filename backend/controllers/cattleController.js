const Cattle = require('../models/Cattle');
const BreedingAssessment = require('../models/BreedingAssessment');

const getCattleList = async (req, res) => {
    try {
        const userId = req.user.id;

        const [cattle, assessments] = await Promise.all([
            Cattle.findAll({ where: { userId }, order: [['createdAt', 'ASC']] }),
            BreedingAssessment.findAll({
                where: { userId },
                attributes: ['cattleId', 'isReady', 'createdAt'],
                order: [['createdAt', 'ASC']]
            })
        ]);

        const latestReadyByTag = new Map();
        const lastAssessedByTag = new Map();
        for (const a of assessments) {
            latestReadyByTag.set(a.cattleId, a.isReady);
            lastAssessedByTag.set(a.cattleId, a.createdAt);
        }

        res.status(200).json(cattle.map(c => ({
            id: c.id,
            tagId: c.tagId,
            breed: c.breed,
            notes: c.notes,
            isReady: latestReadyByTag.has(c.tagId) ? latestReadyByTag.get(c.tagId) : null,
            lastAssessedAt: lastAssessedByTag.get(c.tagId) || null
        })));
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving cattle', error: error.message });
    }
};

const createCattle = async (req, res) => {
    try {
        const userId = req.user.id;
        const { tagId, breed, notes } = req.body;
        const trimmedTagId = tagId ? String(tagId).trim() : '';
        if (!trimmedTagId) {
            return res.status(400).json({ message: 'Cattle ID is required' });
        }

        const existing = await Cattle.findOne({ where: { userId, tagId: trimmedTagId } });
        if (existing) {
            return res.status(400).json({ message: 'A cattle with this ID already exists' });
        }

        const cattle = await Cattle.create({
            tagId: trimmedTagId,
            breed: breed || null,
            notes: notes || null,
            userId
        });

        res.status(201).json({ message: 'Cattle added successfully', cattle });
    } catch (error) {
        res.status(500).json({ message: 'Error adding cattle', error: error.message });
    }
};

const updateCattle = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { tagId, breed, notes } = req.body;

        const cattle = await Cattle.findOne({ where: { id, userId } });
        if (!cattle) {
            return res.status(404).json({ message: 'Cattle not found' });
        }

        const trimmedTagId = tagId !== undefined ? String(tagId).trim() : cattle.tagId;
        if (!trimmedTagId) {
            return res.status(400).json({ message: 'Cattle ID is required' });
        }

        if (trimmedTagId !== cattle.tagId) {
            const existing = await Cattle.findOne({ where: { userId, tagId: trimmedTagId } });
            if (existing) {
                return res.status(400).json({ message: 'A cattle with this ID already exists' });
            }
            // Keep this owner's historical DSS assessments linked to the renamed tag
            await BreedingAssessment.update(
                { cattleId: trimmedTagId },
                { where: { cattleId: cattle.tagId, userId } }
            );
        }

        cattle.tagId = trimmedTagId;
        if (breed !== undefined) cattle.breed = breed || null;
        if (notes !== undefined) cattle.notes = notes || null;
        await cattle.save();

        res.status(200).json({ message: 'Cattle updated successfully', cattle });
    } catch (error) {
        res.status(500).json({ message: 'Error updating cattle', error: error.message });
    }
};

const deleteCattle = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const cattle = await Cattle.findOne({ where: { id, userId } });
        if (!cattle) {
            return res.status(404).json({ message: 'Cattle not found' });
        }

        await cattle.destroy();
        res.status(200).json({ message: 'Cattle removed successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error removing cattle', error: error.message });
    }
};

module.exports = { getCattleList, createCattle, updateCattle, deleteCattle };
