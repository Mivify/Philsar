const BreedingAssessment = require('../models/BreedingAssessment');
const User = require('../models/User');

const createAssessment = async (req, res) => {
    try {
        const { cattleId, age, bcs, daysSinceCalving, estrusIndicators, history, healthStatus, userId } = req.body;

        if (!cattleId || !age || !bcs || !estrusIndicators || !history || !healthStatus) {
            return res.status(400).json({ message: 'Missing required evaluation fields' });
        }

        const ageNum = parseInt(age);
        const bcsNum = parseInt(bcs);
        const daysNum = daysSinceCalving ? parseInt(daysSinceCalving) : 60;

        // DSS Evaluation Logic
        const isReady = ageNum >= 2 && ageNum <= 8 &&
                        bcsNum >= 4 && bcsNum <= 7 &&
                        !healthStatus.toLowerCase().includes('ongoing') &&
                        daysNum >= 45 &&
                        estrusIndicators !== 'None Observed';

        const useAI = isReady && (estrusIndicators === 'Standing Heat' || estrusIndicators === 'Clear Discharge');

        const recommendation = isReady
            ? (useAI ? 'Artificial Insemination (AI)' : 'Natural Mating')
            : 'Postpone Breeding';

        const guidance = isReady
            ? (useAI
                ? 'Proceed with AI within 6–12 hours of confirmed standing heat. Thaw semen at 35–37°C for 30–45 seconds. Use clean equipment and proper rectal-cervical technique. Record insemination date for pregnancy checking in 60–90 days.'
                : 'Introduce a proven bull at a ratio of 1:20–30. Monitor closely and keep breeding records. Observe for return to heat in 21 days to confirm breeding success.')
            : 'Improve body condition through improved nutrition if BCS is below 5. Treat any health conditions with veterinary guidance. Re-evaluate in 2–4 weeks.';

        // Save assessment to database
        const assessment = await BreedingAssessment.create({
            cattleId,
            age: ageNum,
            bcs: bcsNum,
            daysSinceCalving: daysNum,
            estrusIndicators,
            history,
            healthStatus,
            isReady,
            recommendation,
            guidance,
            userId: userId || null
        });

        // Increment user's DSS assessments counter
        if (userId) {
            const user = await User.findByPk(userId);
            if (user) {
                user.dssAssessmentsRun += 1;
                await user.save();
            }
        }

        res.status(201).json({
            message: 'Assessment completed and saved successfully',
            assessment
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during assessment', error: error.message });
    }
};

const getAssessments = async (req, res) => {
    try {
        const { userId } = req.query;
        const where = userId ? { userId } : {};
        const assessments = await BreedingAssessment.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 10
        });
        res.status(200).json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving assessments', error: error.message });
    }
};

module.exports = { createAssessment, getAssessments };
