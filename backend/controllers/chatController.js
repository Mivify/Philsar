const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

// The genai package has a different API:
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const handleChat = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ message: 'No chat message provided' });
        }

        const promptContext = `
You are an expert AI assistant for the Philippine Society of Animal Reproduction (PHILSAR). 
You help users understand cattle reproductive systems, breeding technologies natural and artificial, and related educational materials.
Please answer the following user query accurately and educationally.
User Query: ${message}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptContext
        });

        res.status(200).json({ response: response.text });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ message: 'Failed to communicate with AI Chatbot', error: error.message });
    }
};

module.exports = { handleChat };
