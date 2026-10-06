const Module = require('../models/Module');
const ModuleChunk = require('../models/ModuleChunk');
const { embedText, cosineSimilarity } = require('./embeddings');
const { getKnowledgeChunks } = require('./chatbotKnowledge');

// Below this, a chunk is treated as unrelated to the query rather than
// forced into a prompt — keeps callers from citing irrelevant lessons on
// questions/cases the modules don't actually cover.
const RELEVANCE_THRESHOLD = 0.65;
const TOP_K = 4;

// RAG retrieval over the Learning Modules' precomputed chunk embeddings

// includeKnowledgeFiles: also search backend/knowledge/ (the Our Community page
// and the portal guide). The chatbot passes this; DSS guidance only uses the modules
const retrieveRelevantChunks = async (queryText, { includeKnowledgeFiles = false } = {}) => {
    try {
        const queryEmbedding = await embedText(queryText, 'RETRIEVAL_QUERY');
        const chunks = await ModuleChunk.findAll();

        const moduleIds = [...new Set(chunks.map(c => c.moduleId))];
        const modules = moduleIds.length > 0 ? await Module.findAll({ where: { id: moduleIds } }) : [];
        const moduleTitleById = Object.fromEntries(modules.map(m => [m.id, m.title]));

        const candidates = chunks.map(chunk => ({
            moduleId: chunk.moduleId,
            moduleTitle: moduleTitleById[chunk.moduleId] || 'Untitled Module',
            lessonTitle: chunk.lessonTitle,
            content: chunk.content,
            score: cosineSimilarity(queryEmbedding, chunk.embedding)
        }));

        if (includeKnowledgeFiles) {
            const knowledgeChunks = await getKnowledgeChunks().catch(error => {
                console.error('Chatbot knowledge files unavailable, continuing without them:', error.message);
                return [];
            });
            for (const chunk of knowledgeChunks) {
                candidates.push({
                    moduleId: null,
                    moduleTitle: chunk.sourceTitle,
                    lessonTitle: chunk.lessonTitle,
                    content: chunk.content,
                    score: cosineSimilarity(queryEmbedding, chunk.embedding)
                });
            }
        }

        return candidates
            .filter(c => c.score >= RELEVANCE_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, TOP_K);
    } catch (error) {
        console.error('RAG retrieval failed, continuing without module context:', error);
        return [];
    }
};

module.exports = { retrieveRelevantChunks };
