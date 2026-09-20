const BreedingAssessment = require('../models/BreedingAssessment');
const User = require('../models/User');
const Cattle = require('../models/Cattle');
const { GoogleGenAI } = require('@google/genai');
const { retrieveRelevantChunks } = require('../utils/ragRetrieval');
const { logActivity } = require('../utils/activityLog');
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
        // "Borderline", even though this system's own rule treats 5-7 as acceptable.
        // That produced guidance that contradicted the checklist shown right next to
        // it (checklist ✅ on BCS, guidance text citing BCS as a reason to postpone).
        // Telling the model exactly which criteria this system already decided met/
        // didn't meet keeps its explanation aligned with what the farmer sees.
        const checklistSummary = `
System Checklist Results (already evaluated by this system's rules — do not contradict these; only explain the verdict using criteria marked NOT MET, even if a MET value might seem non-ideal by general standards):
- Age within 2-8 years: ${data.checklist.ageOk ? 'MET' : 'NOT MET'}
- Body Condition Score within 5-7: ${data.checklist.bcsOk ? 'MET' : 'NOT MET'}
- Health status clear of untreated/ongoing conditions: ${data.checklist.healthOk ? 'MET' : 'NOT MET'}
- Voluntary waiting period (>=45 days since calving): ${data.checklist.vwpOk ? 'MET' : 'NOT MET'}
- Estrus/heat signs observed: ${data.checklist.estrusOk ? 'MET' : 'NOT MET'}
- No unresolved repeat-breeder history: ${data.checklist.historyOk ? 'MET' : 'NOT MET'}`;

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

        // gemini-3.1-flash-lite: same reasoning as the chatbot's fixed model —
        // Flash-Lite tier free-tier quota (500 requests/day) is 25x the regular
        // Flash tier's (20/day), and it was verified reliable across repeated
        // real test calls with this exact guidance-style prompt.
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
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
        // recovery as a reason to postpone breeding. Untreated/ongoing conditions
        // are excluded because postpartum uterine disease (metritis/endometritis)
        // is well documented to cut first-service conception rates and delay
        // return to cyclicity — Giuliodori et al. (2013, J. Dairy Sci. 96:3621-3631)
        // found lower first-AI conception in cows with clinical metritis, and
        // Várhidi et al. (2024, Vet. Sci. 11:66) reviews uterine disease as one of
        // the leading causes of reproductive-related culling.
        const isHealthClear = healthStatus === 'Healthy — no issues' || healthStatus === 'Minor health issue — treated';

        // Age 2-8: cows 4-10 yrs old had the highest conception rate (86.5%) vs.
        // 60.4% for cows >10 yrs old in Samkange et al. (2019, Trop. Anim. Health
        // Prod. 51(7):1829-1837); 2 as the lower bound matches the ~22-25-month
        // optimal age at first calving found in Kusaka et al. (2023, J. Reprod.
        // Dev. 69(5):291-297). 8 is used (not 10) to stay inside the
        // highest-performing band rather than right at its edge.
        const ageOk = ageNum >= 2 && ageNum <= 8;

        // BCS 5-7 — all figures here are on the same 1-9 scale this form uses
        // (not the 1-5 Canadian/UK scale some sources use, which would need
        // very different numbers). Brandão et al. (2021, J. Anim. Sci. 99(Suppl
        // 3):48) found cows at BCS >=5.0 had substantially higher pregnancy
        // (82.7% vs 67.9%) and calving rates than BCS <5.0 — so 4 ("Borderline"
        // in this form's own scale) is excluded, not treated as adequate. 7 is
        // the ceiling because BCS 8-9 (overconditioned) is linked to dystocia
        // from pelvic fat accumulation (Vedovatto & Ferreira, 2025, LSU
        // AgCenter Pub. 3951-C).
        const bcsOk = bcsNum >= 5 && bcsNum <= 7;

        // >=45 days: Inchaisri et al. (2011, J. Dairy Sci. 94(8):3811-3823)
        // found an economically optimal voluntary waiting period of roughly
        // 6-8 weeks (42-56 days) for most cows; 45 days sits at the low end of
        // the 45-60-day range SDSU Extension (Villamediana, 2023) recommends.
        const vwpOk = daysNum >= 45;

        // "History of Infertility" maps to the veterinary concept of a "repeat
        // breeder": a clinically normal, regularly-cycling cow that has failed
        // to conceive after repeated services (Pérez-Marín & Quintela, 2023,
        // Animals 13(13):2187). Villar et al. (2025, Animals 15:266) found a
        // ~21% prevalence in dairy herds and identified reproductive
        // pathologies (endometritis, dystocia) as leading risk factors — the
        // standard recommendation is a veterinary reproductive exam
        // (ultrasonography, progesterone assay) BEFORE another service, since
        // an undiagnosed physical cause makes any further AI or natural
        // service attempt likely to fail again regardless of timing. So this
        // doesn't try to decide between AI and natural mating for these cows —
        // it withholds a "Ready" verdict entirely and defers to a vet, same as
        // an unresolved health condition does.
        const historyOk = history !== 'History of Infertility';

        const isReady = ageOk && bcsOk && isHealthClear && vwpOk && hasEstrusSign && historyOk;

        // AI is recommended only for Standing Heat or Clear Discharge — the two
        // signs treated as precise ovulation-timing anchors:
        // - Standing Heat is the classic anchor for the AM-PM rule (inseminate
        //   ~12h after onset) — but Gaude et al. (2021, Livestock Science
        //   245:104449) found it's seen in only ~22% of actual estrus events,
        //   so it can't be the only trigger.
        // - Clear Discharge is grouped with it as a secondary confirming sign.
        // Swollen Vulva and Mounting Others are left out of the AI trigger and
        // fall back to Natural Mating instead, which tolerates looser timing —
        // deliberately kept narrower than research alone would strictly
        // require (Widyastuti et al., 2025, Vet. World 18:1357-1364, found
        // vulvar swelling tracks the same hormonal window as discharge), since
        // this is the more conservative, established two-sign rule.
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
                cattleId, age: ageNum, bcs: bcsNum, daysSinceCalving: daysNum, estrusIndicators, history, healthStatus, isReady, recommendation,
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
