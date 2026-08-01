const Module = require('../models/Module');
const ModuleChunk = require('../models/ModuleChunk');
const { embedText, cosineSimilarity } = require('./embeddings');

// Below this, a chunk is treated as unrelated to the query rather than
// forced into a prompt — keeps callers from citing irrelevant lessons on
// questions/cases the modules don't actually cover.
const RELEVANCE_THRESHOLD = 0.65;
const TOP_K = 4;

// RAG retrieval over the Learning Modules' precomputed chunk embeddings
// (generated in moduleController on module create/update). Brute-force
// cosine similarity in Node is fine at this dataset size — no vector DB
// needed. Falls back to no retrieved context (not an error) if anything
// here fails, so a hiccup in retrieval never blocks the caller (chatbot
// reply, DSS guidance, etc).
const retrieveRelevantChunks = async (queryText) => {
    try {
        const queryEmbedding = await embedText(queryText, 'RETRIEVAL_QUERY');
        const chunks = await ModuleChunk.findAll();
        if (chunks.length === 0) return [];

        const moduleIds = [...new Set(chunks.map(c => c.moduleId))];
        const modules = await Module.findAll({ where: { id: moduleIds } });
        const moduleTitleById = Object.fromEntries(modules.map(m => [m.id, m.title]));

        return chunks
            .map(chunk => ({
                moduleId: chunk.moduleId,
                moduleTitle: moduleTitleById[chunk.moduleId] || 'Untitled Module',
                lessonTitle: chunk.lessonTitle,
                content: chunk.content,
                score: cosineSimilarity(queryEmbedding, chunk.embedding)
            }))
            .filter(c => c.score >= RELEVANCE_THRESHOLD)
            .sort((a, b) => b.score - a.score)
            .slice(0, TOP_K);
    } catch (error) {
        console.error('RAG retrieval failed, continuing without module context:', error);
        return [];
    }
};

module.exports = { retrieveRelevantChunks };
