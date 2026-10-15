const Setting = require('../models/Setting');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLog');

const DEFAULT_SETTINGS = {
    certTitleText: 'Certificate of Attendance',
    certBodyText: 'for successfully attending the virtual seminar',
    certClosingText: 'PHILSAR Cattle Reproductive Portal',
    certPrimaryColor: '#5A0016',
    certAccentColor: '#FFD25F',
    certBackgroundImage: '',
    certSignatoryName: 'Danilda Hufana-Duran, Ph.D., L.Agr.',
    certSignatoryTitle: 'President',
    certSignatureImage: '',
    certAttendanceThresholdMinutes: '30'
};

// Defaults from before the maroon-and-gold certificate. A saved value that is still one of
// these was never customized, so it follows the current default instead (the old statement
// also wouldn't read right after "This certificate is presented to").
const RETIRED_DEFAULTS = {
    certBodyText: ['has successfully attended the virtual seminar'],
    certPrimaryColor: ['#8B5E3C', '#305CDE'],
    certAccentColor: ['#D4A574', '#7B93E0']
};

const toSettingsMap = (rows) => {
    const settingsMap = { ...DEFAULT_SETTINGS };
    rows.forEach(s => {
        const retired = RETIRED_DEFAULTS[s.key];
        if (retired && retired.some(v => v.toLowerCase() === String(s.value).trim().toLowerCase())) return;
        settingsMap[s.key] = s.value;
    });
    return settingsMap;
};

const getSettings = async (req, res) => {
    try {
        const settings = await Setting.findAll();
        const settingsMap = toSettingsMap(settings);

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

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'settings_updated', category: 'admin',
            details: `Changed: ${Object.keys(updates).join(', ')}`, req
        });

        const settings = await Setting.findAll();
        const settingsMap = toSettingsMap(settings);

        res.status(200).json({ message: 'Settings updated successfully', settings: settingsMap });
    } catch (error) {
        res.status(500).json({ message: 'Error updating settings', error: error.message });
    }
};

module.exports = { getSettings, updateSettings };
