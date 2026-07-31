const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Same lesson boundary the frontend uses to build the lesson list
// (parseLessons in App.tsx) — splitting on '## ' headers keeps each RAG
// chunk as a coherent, admin-authored unit instead of an arbitrary window.
const chunkModuleContent = (content) => {
    if (!content) return [];

    const parts = content.split(/\n##\s+/);
    const chunks = [];

    const introPart = parts[0];
    const firstLine = introPart.split('\n')[0];
    const introTitle = firstLine.startsWith('# ') ? firstLine.replace('# ', '').trim() : 'Introduction';
    const introContent = firstLine.startsWith('# ') ? introPart.substring(firstLine.length).trim() : introPart.trim();

    if (introContent) {
        chunks.push({ lessonTitle: introTitle, content: introContent });
    }

    for (let i = 1; i < parts.length; i++) {
        const lines = parts[i].split('\n');
        const lessonTitle = lines[0].trim();
        const lessonContent = lines.slice(1).join('\n').trim();
        if (lessonContent) {
            chunks.push({ lessonTitle, content: lessonContent });
        }
    }

    return chunks;
};

// taskType is Gemini's asymmetric-retrieval hint — 'RETRIEVAL_DOCUMENT' when
// indexing module content, 'RETRIEVAL_QUERY' when embedding a user's question.
// Mismatching these still works but noticeably hurts match quality.
const embedText = async (text, taskType) => {
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text,
        config: { taskType }
    });
    return response.embeddings[0].values;
};

const cosineSimilarity = (a, b) => {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};

module.exports = { chunkModuleContent, embedText, cosineSimilarity };
