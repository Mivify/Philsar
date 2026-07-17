const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// The genai package has a different API:
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const handleChat = async (req, res) => {
    try {
        const { message, user } = req.body;

        if (!message) {
            return res.status(400).json({ message: 'No chat message provided' });
        }

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

        const promptContext = `
You are an expert AI assistant for the Philippine Society of Animal Reproduction (PHILSAR).
You help users understand cattle reproductive systems, breeding technologies natural and artificial, and related educational materials.${userContext}${dateTimeContext}
Default to responding in English, unless the user writes in or explicitly asks for another language.

Please answer the following user query accurately and educationally:
User Query: ${message}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptContext
        });

        res.status(200).json({ response: response.text });
    } catch (error) {
        console.error('Chat error:', error);
        // Return a clean, generic user-friendly message, keeping details in server console logs
        res.status(200).json({ response: "Sorry, I am unable to connect to the AI assistant right now. Please try again later." });
    }
};

module.exports = { handleChat };
