const LessonProgress = require('../models/LessonProgress');
const Module = require('../models/Module');
const User = require('../models/User');

// Mirrors the frontend's parseLessons() split logic exactly: 1 (intro) + one per "## " heading.
const countLessons = (content) => (content ? content.split(/\n##\s+/).length : 0);

const serializeUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization,
    status: user.status,
    modulesCompleted: user.modulesCompleted,
    seminarsAttended: user.seminarsAttended,
    dssAssessmentsRun: user.dssAssessmentsRun
});

// Recomputes modulesCompleted from scratch against real LessonProgress + Module data,
// rather than trusting an incrementally-maintained counter. Self-correcting on every call —
// there is no code path left that can leave this value out of sync with reality.
const computeModulesCompleted = async (userId) => {
    const [modules, rows] = await Promise.all([
        Module.findAll({ attributes: ['id', 'content'] }),
        LessonProgress.findAll({ where: { userId }, attributes: ['moduleId'] })
    ]);

    const countByModule = {};
    for (const row of rows) {
        countByModule[row.moduleId] = (countByModule[row.moduleId] || 0) + 1;
    }

    let completed = 0;
    for (const mod of modules) {
        const total = countLessons(mod.content);
        if (total > 0 && (countByModule[mod.id] || 0) >= total) completed++;
    }
    return completed;
};

// Returns completion state shaped as { [moduleId]: [lessonIndex, ...] }, matching the
// frontend's completedLessonsMap state shape exactly.
const getProgress = async (req, res) => {
    try {
        const { userId } = req.params;
        const rows = await LessonProgress.findAll({ where: { userId } });

        const map = {};
        for (const row of rows) {
            if (!map[row.moduleId]) map[row.moduleId] = [];
            map[row.moduleId].push(row.lessonIndex);
        }

        res.status(200).json(map);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving progress', error: error.message });
    }
};

const markLessonComplete = async (req, res) => {
    try {
        const { userId, moduleId, lessonIndex } = req.body;
        if (!userId || !moduleId || lessonIndex === undefined) {
            return res.status(400).json({ message: 'Missing userId, moduleId, or lessonIndex' });
        }

        const moduleItem = await Module.findByPk(moduleId);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const totalLessons = countLessons(moduleItem.content);
        const countBefore = await LessonProgress.count({ where: { userId, moduleId } });
        const wasComplete = totalLessons > 0 && countBefore >= totalLessons;

        await LessonProgress.findOrCreate({ where: { userId, moduleId, lessonIndex } });

        const countAfter = await LessonProgress.count({ where: { userId, moduleId } });
        const isNowComplete = totalLessons > 0 && countAfter >= totalLessons;

        user.modulesCompleted = await computeModulesCompleted(userId);
        await user.save();

        const completedRows = await LessonProgress.findAll({ where: { userId, moduleId } });
        res.status(200).json({
            completedLessons: completedRows.map(r => r.lessonIndex),
            justCompletedModule: !wasComplete && isNowComplete,
            user: serializeUser(user)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error marking lesson complete', error: error.message });
    }
};

const unmarkLessonComplete = async (req, res) => {
    try {
        const { userId, moduleId, lessonIndex } = req.body;
        if (!userId || !moduleId || lessonIndex === undefined) {
            return res.status(400).json({ message: 'Missing userId, moduleId, or lessonIndex' });
        }

        const moduleItem = await Module.findByPk(moduleId);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        await LessonProgress.destroy({ where: { userId, moduleId, lessonIndex } });

        user.modulesCompleted = await computeModulesCompleted(userId);
        await user.save();

        const completedRows = await LessonProgress.findAll({ where: { userId, moduleId } });
        res.status(200).json({
            completedLessons: completedRows.map(r => r.lessonIndex),
            user: serializeUser(user)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error unmarking lesson', error: error.message });
    }
};

module.exports = { getProgress, markLessonComplete, unmarkLessonComplete };
