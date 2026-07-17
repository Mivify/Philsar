const BreedingAssessment = require('../models/BreedingAssessment');
const User = require('../models/User');
const Cattle = require('../models/Cattle');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Falls back to the previous hardcoded guidance if the Gemini call fails for any reason
// (rate limit, network, bad key) — the DSS feature must never hard-fail because of this.
const generateBreedingGuidance = async (data, fallback) => {
    try {
        const prompt = `You are a livestock reproduction advisor for the PHILSAR Cattle Reproductive Portal. Based on the following breeding assessment, write a short, practical guidance paragraph (2-4 sentences, no headers or bullet points) for the farmer.

Cattle ID: ${data.cattleId}
Age: ${data.age} years
Body Condition Score (BCS): ${data.bcs} (scale 1-9)
Days Since Last Calving: ${data.daysSinceCalving}
Estrus Indicators Observed: ${data.estrusIndicators}
Reproductive History: ${data.history}
Current Health Status: ${data.healthStatus}
Breeding Eligibility: ${data.isReady ? 'Ready for breeding' : 'Not ready for breeding'}
Recommended Action: ${data.recommendation}

Write actionable guidance specific to this cattle's data above.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        return response.text?.trim() || fallback;
    } catch (error) {
        console.error('Gemini guidance generation error:', error);
        return fallback;
    }
};

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

        const fallbackGuidance = isReady
            ? (useAI
                ? 'Proceed with AI within 6–12 hours of confirmed standing heat. Thaw semen at 35–37°C for 30–45 seconds. Use clean equipment and proper rectal-cervical technique. Record insemination date for pregnancy checking in 60–90 days.'
                : 'Introduce a proven bull at a ratio of 1:20–30. Monitor closely and keep breeding records. Observe for return to heat in 21 days to confirm breeding success.')
            : 'Improve body condition through improved nutrition if BCS is below 5. Treat any health conditions with veterinary guidance. Re-evaluate in 2–4 weeks.';

        const guidance = await generateBreedingGuidance(
            { cattleId, age: ageNum, bcs: bcsNum, daysSinceCalving: daysNum, estrusIndicators, history, healthStatus, isReady, recommendation },
            fallbackGuidance
        );

        // Auto-register this cattle in the herd registry if it isn't already
        await Cattle.findOrCreate({
            where: { tagId: cattleId, userId: userId || null },
            defaults: { userId: userId || null }
        });

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

// Per-user herd stats for the Dashboard. totalCattle/newThisMonth come from the
// Cattle registry; readyForBreeding is still derived from each cattle's latest DSS
// assessment, since breeding eligibility is what the DSS actually evaluates.
const getHerdStats = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ message: 'Missing userId' });
        }

        const [cattleRows, assessments] = await Promise.all([
            Cattle.findAll({ where: { userId }, attributes: ['tagId', 'createdAt'] }),
            BreedingAssessment.findAll({
                where: { userId },
                attributes: ['cattleId', 'isReady', 'createdAt'],
                order: [['createdAt', 'ASC']]
            })
        ]);

        const latestReadyByCattle = new Map();
        for (const a of assessments) {
            // Overwritten on every pass through ascending order, so the last write wins = latest.
            latestReadyByCattle.set(a.cattleId, a.isReady);
        }

        const registeredTags = new Set(cattleRows.map(c => c.tagId));
        const totalCattle = cattleRows.length;
        const readyForBreeding = [...latestReadyByCattle.entries()]
            .filter(([tagId, isReady]) => registeredTags.has(tagId) && isReady).length;

        const now = new Date();
        const newThisMonth = cattleRows.filter(c => {
            const d = new Date(c.createdAt);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;

        res.status(200).json({ totalCattle, readyForBreeding, newThisMonth });
    } catch (error) {
        res.status(500).json({ message: 'Error computing herd stats', error: error.message });
    }
};

module.exports = { createAssessment, getAssessments, getHerdStats };
