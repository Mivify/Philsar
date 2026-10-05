const BreedingAssessment = require('../models/BreedingAssessment');
const User = require('../models/User');
const Cattle = require('../models/Cattle');
const { GoogleGenAI } = require('@google/genai');
const { retrieveRelevantChunks } = require('../utils/ragRetrieval');
const { logActivity } = require('../utils/activityLog');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Falls back to the previous hardcoded guidance if the Gemini call fails for any reason
// (rate limit, network, bad key)
const generateBreedingGuidance = async (data, fallback) => {
    try {
        const calvingText = data.isFirstBreeding
            ? 'no previous calving (first breeding)'
            : `${data.daysSinceCalving} days since last calving`;
        const caseQuery = `Breeding readiness assessment: age ${data.age} years, body condition score ${data.bcs}, ${calvingText}, estrus indicators: ${data.estrusIndicators}, reproductive history: ${data.history}, current health status: ${data.healthStatus}. Determined ${data.isReady ? 'ready for breeding' : 'not ready for breeding'} — recommended action: ${data.recommendation}.`;
        const relevantChunks = await retrieveRelevantChunks(caseQuery);
        const referenceContext = relevantChunks.length > 0
            ? `\n\nReference material from PHILSAR's Learning Modules (ground your guidance in this when it's relevant to this case; otherwise rely on your own veterinary/animal husbandry knowledge — don't force a connection that isn't there):\n${relevantChunks.map(c => `--- From "${c.moduleTitle}" (${c.lessonTitle}) ---\n${c.content}`).join('\n\n')}`
            : '';


        const checklistSummary = `
System Checklist Results (already evaluated by this system's rules — do not contradict these; only explain the verdict using criteria marked NOT MET, even if a MET value might seem non-ideal by general standards):
- Age within 2-8 years: ${data.checklist.ageOk ? 'MET' : 'NOT MET'}
- Body Condition Score within 5-7: ${data.checklist.bcsOk ? 'MET' : 'NOT MET'}
- Health status clear of untreated/ongoing conditions: ${data.checklist.healthOk ? 'MET' : 'NOT MET'}
- Voluntary waiting period (>=45 days since calving): ${data.checklist.vwpOk === null ? 'NOT APPLICABLE — this is a maiden heifer with no previous calving; do not mention a waiting period' : (data.checklist.vwpOk ? 'MET' : 'NOT MET')}
- Estrus/heat signs observed: ${data.checklist.estrusOk ? 'MET' : 'NOT MET'}
- No unresolved repeat-breeder history: ${data.checklist.historyOk ? 'MET' : 'NOT MET'}`;

        const prompt = `You are a livestock reproduction advisor for the PHILSAR Cattle Reproductive Portal. Based on the following breeding assessment, write a short, practical guidance paragraph (2-4 sentences, no headers or bullet points) for the farmer.

Cattle ID: ${data.cattleId}
Age: ${data.age} years
Body Condition Score (BCS): ${data.bcs} (scale 1-9)
Days Since Last Calving: ${data.isFirstBreeding ? 'Not applicable — first breeding, no previous calving' : data.daysSinceCalving}
Estrus Indicators Observed: ${data.estrusIndicators}
Reproductive History: ${data.history}
Current Health Status: ${data.healthStatus}
Breeding Eligibility: ${data.isReady ? 'Ready for breeding' : 'Not ready for breeding'}
Recommended Action: ${data.recommendation}
${checklistSummary}${referenceContext}

Write actionable guidance specific to this cattle's data above.`;


        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt
        });


        const sources = Object.values(
            Object.fromEntries(relevantChunks.map(c => [c.moduleId, { moduleId: c.moduleId, moduleTitle: c.moduleTitle }]))
        );

        return { text: response.text?.trim() || fallback, sources };
    } catch (error) {
        console.error('Gemini guidance generation error:', error);
        return { text: fallback, sources: [] };
    }
};

const createAssessment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { cattleId, age, bcs, daysSinceCalving, estrusIndicators, history, healthStatus } = req.body;

        if (!cattleId || !age || !bcs || !estrusIndicators || !history || !healthStatus) {
            return res.status(400).json({ message: 'Missing required evaluation fields' });
        }

        // A maiden heifer has never calved, so "days since last calving" has no
        // meaning for her.
        const isFirstBreeding = history === 'First Breeding';
        if (!isFirstBreeding && (daysSinceCalving === undefined || daysSinceCalving === null || daysSinceCalving === '')) {
            return res.status(400).json({ message: 'Days since last calving is required unless this is a first breeding.' });
        }

        const ageNum = parseFloat(age);
        if (Number.isNaN(ageNum) || ageNum <= 0) {
            return res.status(400).json({ message: 'Please enter a valid age.' });
        }
        const bcsNum = parseInt(bcs);
        const daysNum = isFirstBreeding ? null : parseInt(daysSinceCalving);

        // DSS Evaluation Logic
        const indicatorList = estrusIndicators.split(',').map(s => s.trim()).filter(Boolean);
        const hasEstrusSign = indicatorList.length > 0 && !indicatorList.includes('None Observed');

        // Only these two of the 4 dropdown options count as clear — the previous
        // `!includes('ongoing')`
        const isHealthClear = healthStatus === 'Healthy — no issues' || healthStatus === 'Minor health issue — treated';

        // Age 2-8, applied to every animal including a first breeding
        const ageOk = ageNum >= 2 && ageNum <= 8;

        // BCS 5-7 — all figures here are on the same 1-9
        const bcsOk = bcsNum >= 5 && bcsNum <= 7;


        const vwpOk = isFirstBreeding ? null : daysNum >= 45;

        // "History of Infertility" maps to the veterinary concept of a "repeat
        // breeder": a clinically normal, regularly-cycling cow that has failed
        // to conceive after repeated services
        const historyOk = history !== 'History of Infertility';

        const isReady = ageOk && bcsOk && isHealthClear && vwpOk !== false && hasEstrusSign && historyOk;

        // AI is recommended only for Standing Heat or Clear Discharge — the two
        // signs treated as precise ovulation-timing anchors
        const useAI = isReady && (
            indicatorList.includes('Standing Heat') ||
            indicatorList.includes('Clear Discharge')
        );

        const recommendation = isReady
            ? (useAI ? 'Artificial Insemination (AI)' : 'Natural Mating')
            : 'Postpone Breeding';

        const fallbackGuidance = isReady
            ? (useAI
                ? 'If standing heat was directly observed, inseminate about 12 hours after its onset (the AM-PM rule). If relying on clear discharge without directly observed standing heat, inseminate promptly and monitor closely, as timing is less precise. Thaw semen at 35–37°C for 30–45 seconds. Use clean equipment and proper rectal-cervical technique. Record insemination date for pregnancy checking in 60–90 days.'
                : 'Introduce a proven bull at a ratio of 1:20–30. Monitor closely and keep breeding records. Observe for return to heat in 21 days to confirm breeding success.')
            : (!historyOk
                ? 'This cow has a documented history of infertility (repeat breeding). Schedule a veterinary reproductive exam (e.g. ultrasonography or progesterone testing) to check for an underlying cause before attempting another service, since retiming alone often will not resolve repeat-breeder cases. Address any other flagged issues (body condition, health, waiting period) in the meantime.'
                : 'Improve body condition through improved nutrition if BCS is below 5. Treat any health conditions with veterinary guidance. Re-evaluate in 2–4 weeks.');

        const { text: guidance, sources } = await generateBreedingGuidance(
            {
                cattleId, age: ageNum, isFirstBreeding, bcs: bcsNum, daysSinceCalving: daysNum, estrusIndicators, history, healthStatus, isReady, recommendation,
                checklist: { ageOk, bcsOk, healthOk: isHealthClear, vwpOk, estrusOk: hasEstrusSign, historyOk }
            },
            fallbackGuidance
        );

        // Auto-register this cattle in the herd registry if it isn't already
        await Cattle.findOrCreate({
            where: { tagId: cattleId, userId },
            defaults: { userId }
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
            userId
        });

        // Increment user's DSS assessments counter
        const user = await User.findByPk(userId);
        if (user) {
            user.dssAssessmentsRun += 1;
            await user.save();
        }

        logActivity({
            userId, userName: user?.name, userRole: user?.role,
            action: 'dss_assessment_run', category: 'dss',
            details: `Cattle #${cattleId}: ${isReady ? 'Ready' : 'Not Ready'} — ${recommendation}`, req
        });

        res.status(201).json({
            message: 'Assessment completed and saved successfully',
            assessment,
            sources
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during assessment', error: error.message });
    }
};

const getAssessments = async (req, res) => {
    try {
        const userId = req.user.id;
        const assessments = await BreedingAssessment.findAll({
            where: { userId },
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
        const userId = req.user.id;

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
