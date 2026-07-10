const Setting = require('../models/Setting');

const DEFAULT_SETTINGS = {
    portalName: 'PHILSAR — Cattle Reproductive Management Portal',
    aiProvider: 'Gemini API (Google)',
    videoProvider: 'Jitsi Meet (Open Source)',
    dssVersion: 'v2.1 — AI-Assisted Rule-Based'
};

const getSettings = async (req, res) => {
    try {
        const settings = await Setting.findAll();
        const settingsMap = { ...DEFAULT_SETTINGS };

        settings.forEach(s => {
            settingsMap[s.key] = s.value;
        });

        res.status(200).json(settingsMap);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving settings', error: error.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const updates = req.body;

        for (const [key, value] of Object.entries(updates)) {
            await Setting.upsert({ key, value: String(value) });
        }

        const settings = await Setting.findAll();
        const settingsMap = { ...DEFAULT_SETTINGS };

        settings.forEach(s => {
            settingsMap[s.key] = s.value;
        });

        res.status(200).json({ message: 'Settings updated successfully', settings: settingsMap });
    } catch (error) {
        res.status(500).json({ message: 'Error updating settings', error: error.message });
    }
};

module.exports = { getSettings, updateSettings };
