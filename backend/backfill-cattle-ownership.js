// One-time fix for the pre-per-user-isolation era: a couple of Cattle/BreedingAssessment
// rows were created before userId association existed and have userId = NULL. Assigns
// them to the Admin account (default owner of unattributed legacy data) and drops the
// old global unique index on Cattle.tagId in favor of the new per-user composite index
// (backend/models/Cattle.js). Safe to re-run any time; it's idempotent.
const { connectDB, sequelize } = require('./config/db');
const User = require('./models/User');
const Cattle = require('./models/Cattle');
const BreedingAssessment = require('./models/BreedingAssessment');

const run = async () => {
    await connectDB();

    const admin = await User.findOne({ where: { role: 'Admin' }, order: [['id', 'ASC']] });
    if (!admin) {
        console.log('No Admin account found — skipping ownership backfill for orphaned rows.');
    } else {
        const [cattleUpdated] = await Cattle.update({ userId: admin.id }, { where: { userId: null } });
        const [assessmentsUpdated] = await BreedingAssessment.update({ userId: admin.id }, { where: { userId: null } });
        console.log(`Assigned ${cattleUpdated} orphaned Cattle row(s) and ${assessmentsUpdated} orphaned BreedingAssessment row(s) to Admin (id ${admin.id}).`);
    }

    const [indexes] = await sequelize.query('SHOW INDEX FROM Cattles');
    const hasOldIndex = indexes.some(i => i.Key_name === 'cattle_tagid_unique');
    if (hasOldIndex) {
        await sequelize.query('ALTER TABLE Cattles DROP INDEX cattle_tagid_unique');
        console.log('Dropped old global unique index cattle_tagid_unique.');
    } else {
        console.log('Old global unique index already absent — nothing to drop.');
    }

    console.log('Backfill complete.');
    process.exit(0);
};

run().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
