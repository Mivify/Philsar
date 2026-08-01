const BreedingAssessment = require('../models/BreedingAssessment');
const User = require('../models/User');
const Cattle = require('../models/Cattle');
const { GoogleGenAI } = require('@google/genai');
const { retrieveRelevantChunks } = require('../utils/ragRetrieval');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Falls back to the previous hardcoded guidance if the Gemini call fails for any reason
// (rate limit, network, bad key) — the DSS feature must never hard-fail because of this.
// RAG-grounds the guidance in the Learning Modules the same way the chatbot does — a case
// summary is embedded and matched against module content, but the model still falls back
// to its own veterinary/animal husbandry knowledge when nothing relevant comes back, so
// guidance isn't limited to only what happens to be written in the modules.
const generateBreedingGuidance = async (data, fallback) => {
    try {
        const caseQuery = `Breeding readiness assessment: age ${data.age} years, body condition score ${data.bcs}, ${data.daysSinceCalving} days since last calving, estrus indicators: ${data.estrusIndicators}, reproductive history: ${data.history}, current health status: ${data.healthStatus}. Determined ${data.isReady ? 'ready for breeding' : 'not ready for breeding'} — recommended action: ${data.recommendation}.`;
        const relevantChunks = await retrieveRelevantChunks(caseQuery);
        const referenceContext = relevantChunks.length > 0
            ? `\n\nReference material from PHILSAR's Learning Modules (ground your guidance in this when it's relevant to this case; otherwise rely on your own veterinary/animal husbandry knowledge — don't force a connection that isn't there):\n${relevantChunks.map(c => `--- From "${c.moduleTitle}" (${c.lessonTitle}) ---\n${c.content}`).join('\n\n')}`
            : '';

        // Without this, the model forms its own opinion from the raw numbers alone —
        // e.g. flagging a BCS of 4 as a concern because the UI itself labels it
        // "Borderline", even though this system's own rule treats 4-7 as acceptable.
        // That produced guidance that contradicted the checklist shown right next to
        // it (checklist ✅ on BCS, guidance text citing BCS as a reason to postpone).
        // Telling the model exactly which criteria this system already decided met/
        // didn't meet keeps its explanation aligned with what the farmer sees.
        const checklistSummary = `
System Checklist Results (already evaluated by this system's rules — do not contradict these; only explain the verdict using criteria marked NOT MET, even if a MET value might seem non-ideal by general standards):
- Age within 2-8 years: ${data.checklist.ageOk ? 'MET' : 'NOT MET'}
- Body Condition Score within 4-7: ${data.checklist.bcsOk ? 'MET' : 'NOT MET'}
- Health status clear of untreated/ongoing conditions: ${data.checklist.healthOk ? 'MET' : 'NOT MET'}
- Voluntary waiting period (>=45 days since calving): ${data.checklist.vwpOk ? 'MET' : 'NOT MET'}
- Estrus/heat signs observed: ${data.checklist.estrusOk ? 'MET' : 'NOT MET'}`;

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
${checklistSummary}${referenceContext}

Write actionable guidance specific to this cattle's data above.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        // Deduped by module — citing every matched lesson individually is noisier
        // than useful when several land in the same module.
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

        const ageNum = parseInt(age);
        const bcsNum = parseInt(bcs);
        const daysNum = daysSinceCalving ? parseInt(daysSinceCalving) : 60;

        // DSS Evaluation Logic
        const indicatorList = estrusIndicators.split(',').map(s => s.trim()).filter(Boolean);
        const hasEstrusSign = indicatorList.length > 0 && !indicatorList.includes('None Observed');

        // Only these two of the 4 dropdown options count as clear — the previous
        // `!includes('ongoing')` check let "Recovering from illness" silently pass,
        // contradicting the AI guidance text which correctly treated active
        // recovery as a reason to postpone breeding.
        const isHealthClear = healthStatus === 'Healthy — no issues' || healthStatus === 'Minor health issue — treated';

        const ageOk = ageNum >= 2 && ageNum <= 8;
        const bcsOk = bcsNum >= 4 && bcsNum <= 7;
        const vwpOk = daysNum >= 45;

        const isReady = ageOk && bcsOk && isHealthClear && vwpOk && hasEstrusSign;

        const useAI = isReady && (indicatorList.includes('Standing Heat') || indicatorList.includes('Clear Discharge'));

        const recommendation = isReady
            ? (useAI ? 'Artificial Insemination (AI)' : 'Natural Mating')
            : 'Postpone Breeding';

        const fallbackGuidance = isReady
            ? (useAI
                ? 'Proceed with AI within 6–12 hours of confirmed standing heat. Thaw semen at 35–37°C for 30–45 seconds. Use clean equipment and proper rectal-cervical technique. Record insemination date for pregnancy checking in 60–90 days.'
                : 'Introduce a proven bull at a ratio of 1:20–30. Monitor closely and keep breeding records. Observe for return to heat in 21 days to confirm breeding success.')
            : 'Improve body condition through improved nutrition if BCS is below 5. Treat any health conditions with veterinary guidance. Re-evaluate in 2–4 weeks.';

        const { text: guidance, sources } = await generateBreedingGuidance(
            {
                cattleId, age: ageNum, bcs: bcsNum, daysSinceCalving: daysNum, estrusIndicators, history, healthStatus, isReady, recommendation,
                checklist: { ageOk, bcsOk, healthOk: isHealthClear, vwpOk, estrusOk: hasEstrusSign }
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
