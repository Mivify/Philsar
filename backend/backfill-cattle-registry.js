// One-time fix for accounts that ran DSS assessments before the Cattle registry
// (backend/models/Cattle.js) existed — registers a Cattle row for every distinct
// cattleId already present in BreedingAssessment history so "Total Cattle" stays
// accurate instead of dropping to 0. Safe to re-run any time; it's idempotent.
const { connectDB } = require('./config/db');
const BreedingAssessment = require('./models/BreedingAssessment');
const Cattle = require('./models/Cattle');

const run = async () => {
    await connectDB();

    const [assessments, existingCattle] = await Promise.all([
        BreedingAssessment.findAll({ attributes: ['cattleId', 'userId', 'createdAt'], order: [['createdAt', 'ASC']] }),
        Cattle.findAll({ attributes: ['tagId'] })
    ]);

    const knownTags = new Set(existingCattle.map(c => c.tagId));
    const firstSeenByTag = new Map();
    for (const a of assessments) {
        if (!firstSeenByTag.has(a.cattleId)) {
            firstSeenByTag.set(a.cattleId, a);
        }
    }

    let created = 0;
    for (const [tagId, firstAssessment] of firstSeenByTag) {
        if (knownTags.has(tagId)) continue;
        await Cattle.create({ tagId, userId: firstAssessment.userId || null });
        console.log(`Registered cattle: ${tagId}`);
        created++;
    }

    console.log(`Backfill complete. ${created} cattle registered.`);
    process.exit(0);
};

run().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
