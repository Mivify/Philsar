const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const KnowledgeEmbedding = require('../models/KnowledgeEmbedding');
const { chunkModuleContent, embedText } = require('./embeddings');

// What the chatbot knows besides the Learning Modules, one file per source in
// backend/knowledge/:
// - philsar-about.md mirrors the Our Community page (KISSPA_VALUES,
//   STRATEGIC_OBJECTIVES and the about view in App.tsx), for questions about
//   PHILSAR itself
// - portal-guide.md explains the portal's pages, buttons and steps, so the
//   chatbot can guide users around the system
// Update these files when those pages change.
// `label` names a source in the chatbot's prompt (the title when there's none).
// Users can't see the portal guide, and when the bot was shown it as "Portal
// Guide" it cited it ("based on our Portal Guide"). The title is still what
// gets embedded, so the saved embeddings stay valid.
const KNOWLEDGE_SOURCES = [
    { file: 'philsar-about.md', title: 'Our Community (About PHILSAR)' },
    { file: 'portal-guide.md', title: 'Portal Guide', label: 'How the portal works' }
];

const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

let loading = null;

// Each file is split on "## " like a module's lessons. Embeddings are saved in
// the database, so Gemini is only called for sections that are new or were
// edited since the last start. The result is kept in memory; a failed attempt
// is retried on the next question.
const getKnowledgeChunks = () => {
    if (!loading) {
        loading = (async () => {
            const sections = KNOWLEDGE_SOURCES.flatMap(({ file, title, label }) =>
                chunkModuleContent(fs.readFileSync(path.join(__dirname, '../knowledge', file), 'utf8')).map(chunk => {
                    // The section title is embedded too ("Getting a seminar
                    // certificate"), which helps short questions find the right part
                    const documentText = `${title}: ${chunk.lessonTitle}\n${chunk.content}`;
                    return { ...chunk, file, sourceTitle: label || title, documentText, contentHash: hashOf(documentText) };
                })
            );
            const hashes = sections.map(s => s.contentHash);

            const saved = await KnowledgeEmbedding.findAll({ where: { contentHash: hashes } });
            const embeddingByHash = new Map(saved.map(row => [row.contentHash, row.embedding]));

            let newlyEmbedded = 0;
            for (const section of sections) {
                if (embeddingByHash.has(section.contentHash)) continue;
                const embedding = await embedText(section.documentText, 'RETRIEVAL_DOCUMENT');
                await KnowledgeEmbedding.upsert({ contentHash: section.contentHash, source: section.file, sectionTitle: section.lessonTitle, embedding });
                embeddingByHash.set(section.contentHash, embedding);
                newlyEmbedded++;
            }

            // Sections that were edited or removed
            await KnowledgeEmbedding.destroy({ where: { contentHash: { [Op.notIn]: hashes } } });

            if (newlyEmbedded > 0) console.log(`Embedded ${newlyEmbedded} new or edited chatbot knowledge sections.`);

            return sections.map(({ sourceTitle, lessonTitle, content, contentHash }) => ({
                sourceTitle, lessonTitle, content, embedding: embeddingByHash.get(contentHash)
            }));
        })().catch(error => {
            loading = null;
            throw error;
        });
    }
    return loading;
};

module.exports = { getKnowledgeChunks };
