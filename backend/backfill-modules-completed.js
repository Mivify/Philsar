// One-time fix for accounts whose modulesCompleted value predates the server-side
// LessonProgress tracking (backend/models/LessonProgress.js) — recomputes each user's
// modulesCompleted from real lesson-completion records instead of the old, unreliable
// client-maintained counter. Safe to re-run any time; it's idempotent.
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Module = require('./models/Module');
const LessonProgress = require('./models/LessonProgress');

const countLessons = (content) => (content ? content.split(/\n##\s+/).length : 0);

const run = async () => {
    await connectDB();

    const [users, modules, rows] = await Promise.all([
        User.findAll(),
        Module.findAll({ attributes: ['id', 'content'] }),
        LessonProgress.findAll({ attributes: ['userId', 'moduleId'] })
    ]);

    const countByUserModule = {};
    for (const row of rows) {
        const key = `${row.userId}:${row.moduleId}`;
        countByUserModule[key] = (countByUserModule[key] || 0) + 1;
    }

    for (const user of users) {
        let completed = 0;
        for (const mod of modules) {
            const total = countLessons(mod.content);
            const key = `${user.id}:${mod.id}`;
            if (total > 0 && (countByUserModule[key] || 0) >= total) completed++;
        }

        if (user.modulesCompleted !== completed) {
            console.log(`${user.name} (id ${user.id}): modulesCompleted ${user.modulesCompleted} -> ${completed}`);
            user.modulesCompleted = completed;
            await user.save();
        }
    }

    console.log('Backfill complete.');
    process.exit(0);
};

run().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
