const { GoogleGenAI } = require('@google/genai');
const { retrieveRelevantChunks } = require('../utils/ragRetrieval');
const User = require('../models/User');
const { logActivity } = require('../utils/activityLog');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Truncated so a long question doesn't bloat the log table — enough to see
// what was actually asked without storing the full conversation.
const MAX_LOGGED_MESSAGE_LENGTH = 200;

// User-selectable per chat message (see the model dropdown in the AI
// Assistant view) — but never trust the client's string directly. Whitelisted
// against real, current model IDs so a request can't pass through an
// arbitrary/invalid model name to Google's API. The DSS's guidance generation
// intentionally does NOT use this — it stays fixed to DEFAULT_CHAT_MODEL.
const ALLOWED_CHAT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

const handleChat = async (req, res) => {
    try {
        const { message, user, model } = req.body;
        const selectedModel = ALLOWED_CHAT_MODELS.includes(model) ? model : DEFAULT_CHAT_MODEL;

        if (!message) {
            return res.status(400).json({ message: 'No chat message provided' });
        }

        // Logged as soon as the message is known valid — mirrors the DSS
        // assessment log (every run gets recorded regardless of whether the
        // Gemini call itself succeeds), so admins can see chatbot usage even
        // when a reply later falls back to the generic error message below.
        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        const truncatedMessage = message.length > MAX_LOGGED_MESSAGE_LENGTH
            ? `${message.slice(0, MAX_LOGGED_MESSAGE_LENGTH)}…`
            : message;
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'chatbot_message', category: 'chatbot', details: `Asked (${selectedModel}): "${truncatedMessage}"`, req
        });

        let userContext = '';
        if (user && user.name) {
            userContext = `\nThe user you are talking to is named "${user.name}"${user.role ? `, their role is "${user.role}"` : ''}${user.organization ? `, and they are from the organization "${user.organization}"` : ''}. You should address them by name and be aware of their profile role when answering.`;
        }

        // Add current date/time context so the AI knows today's date
        const currentDate = new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Manila' // Matches local Philippine/user timezone
        });
        const dateTimeContext = `\nThe current date and time is: ${currentDate}.`;

        const relevantChunks = await retrieveRelevantChunks(message);
        const referenceContext = relevantChunks.length > 0
            ? `\n\nReference material from PHILSAR's Learning Modules (ground your answer in this when it's relevant to the question; otherwise answer from your own knowledge — don't force a connection that isn't there):\n${relevantChunks.map(c => `--- From "${c.moduleTitle}" (${c.lessonTitle}) ---\n${c.content}`).join('\n\n')}`
            : '';

        const promptContext = `
You are an expert AI assistant for the Philippine Society of Animal Reproduction (PHILSAR).
You help users understand cattle reproductive systems, breeding technologies natural and artificial, and related educational materials.${userContext}${dateTimeContext}${referenceContext}
Default to responding in English, unless the user writes in or explicitly asks for another language.

Please answer the following user query accurately and educationally:
User Query: ${message}`;

        const response = await ai.models.generateContent({
            model: selectedModel,
            contents: promptContext
        });

        // Deduped by module — citing every matched lesson individually is noisier
        // than useful when several land in the same module.
        const sources = Object.values(
            Object.fromEntries(relevantChunks.map(c => [c.moduleId, { moduleId: c.moduleId, moduleTitle: c.moduleTitle }]))
        );

        res.status(200).json({ response: response.text, sources });
    } catch (error) {
        console.error('Chat error:', error);
        // Return a clean, generic user-friendly message, keeping details in server console logs
        res.status(200).json({ response: "Sorry, I am unable to connect to the AI assistant right now. Please try again later.", sources: [] });
    }
};

module.exports = { handleChat };
