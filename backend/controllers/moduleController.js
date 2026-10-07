const Module = require('../models/Module');
const ModuleChunk = require('../models/ModuleChunk');
const User = require('../models/User');
const { chunkModuleContent, embedText } = require('../utils/embeddings');
const { logActivity } = require('../utils/activityLog');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// this is for the gemini chat RAG feature
const reindexModuleChunks = async (moduleId, content) => {
    await ModuleChunk.destroy({ where: { moduleId } });
    const chunks = chunkModuleContent(content);
    for (const chunk of chunks) {
        const embedding = await embedText(chunk.content, 'RETRIEVAL_DOCUMENT');
        await ModuleChunk.create({ moduleId, lessonTitle: chunk.lessonTitle, content: chunk.content, embedding });
    }
};

const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (useCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

// Get all modules
const getModules = async (req, res) => {
    try {
        const modules = await Module.findAll();
        res.status(200).json(modules);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving modules', error: error.message });
    }
};

// Get single module
const getModuleById = async (req, res) => {
    try {
        const { id } = req.params;
        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });
        res.status(200).json(moduleItem);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving module', error: error.message });
    }
};

// Create module
const createModule = async (req, res) => {
    try {
        const { title, description, content, imageUrl, topic } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }

        const moduleItem = await Module.create({ title, description, content, imageUrl, topic: topic || null });
        try {
            await reindexModuleChunks(moduleItem.id, content);
        } catch (embedError) {
            console.error('Embedding generation failed for new module:', embedError);
        }

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'module_created', category: 'admin', details: `"${title}" created`, req
        });

        res.status(201).json({ message: 'Module created successfully', module: moduleItem });
    } catch (error) {
        res.status(500).json({ message: 'Error creating module', error: error.message });
    }
};

// Update module
const updateModule = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, content, imageUrl, topic } = req.body;

        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        const contentChanged = !!content && content !== moduleItem.content;

        if (title) moduleItem.title = title;
        if (description !== undefined) moduleItem.description = description;
        if (content) moduleItem.content = content;
        if (imageUrl !== undefined) moduleItem.imageUrl = imageUrl;
        if (topic !== undefined) moduleItem.topic = topic || null;

        await moduleItem.save();

        if (contentChanged) {
            try {
                await reindexModuleChunks(moduleItem.id, moduleItem.content);
            } catch (embedError) {
                console.error('Embedding regeneration failed for updated module:', embedError);
            }
        }

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'module_updated', category: 'admin', details: `"${moduleItem.title}" updated`, req
        });

        res.status(200).json({ message: 'Module updated successfully', module: moduleItem });
    } catch (error) {
        res.status(500).json({ message: 'Error updating module', error: error.message });
    }
};

// Delete module
const deleteModule = async (req, res) => {
    try {
        const { id } = req.params;
        const moduleItem = await Module.findByPk(id);
        if (!moduleItem) return res.status(404).json({ message: 'Module not found' });

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'module_deleted', category: 'admin', details: `"${moduleItem.title}" deleted`, req
        });

        await ModuleChunk.destroy({ where: { moduleId: id } });
        await moduleItem.destroy();
        res.status(200).json({ message: 'Module deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting module', error: error.message });
    }
};


const uploadImage = async (req, res) => {
    try {
        const { base64Data, fileName } = req.body;

        if (!base64Data || !fileName) {
            return res.status(400).json({ message: 'Missing image data or file name' });
        }

        // Clean base64 header
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ message: 'Invalid base64 image data' });
        }

        if (useCloudinary) {
            const result = await cloudinary.uploader.upload(base64Data, {
                folder: 'philsar',
                resource_type: 'image',
            });
            return res.status(200).json({ url: result.secure_url });
        }

        const buffer = Buffer.from(matches[2], 'base64');

        // Ensure uploads directory exists
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique file name
        const ext = path.extname(fileName) || '.png';
        const baseName = path.basename(fileName, ext).replace(/[^a-zA-Z0-9]/g, '_');
        const uniqueFileName = `${baseName}-${Date.now()}${ext}`;
        const filePath = path.join(uploadDir, uniqueFileName);

        // Write buffer to file
        fs.writeFileSync(filePath, buffer);

        // Return public url
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
        const publicUrl = `${backendUrl}/uploads/${uniqueFileName}`;
        res.status(200).json({ url: publicUrl });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Error uploading image file', error: error.message });
    }
};


const backfillEmbeddings = async (req, res) => {
    try {
        const modules = await Module.findAll();
        let indexed = 0;
        for (const moduleItem of modules) {
            const existingCount = await ModuleChunk.count({ where: { moduleId: moduleItem.id } });
            if (existingCount > 0) continue;
            await reindexModuleChunks(moduleItem.id, moduleItem.content);
            indexed++;
        }
        res.status(200).json({ message: `Backfilled embeddings for ${indexed} module(s).`, totalModules: modules.length, indexed });
    } catch (error) {
        res.status(500).json({ message: 'Error backfilling embeddings', error: error.message });
    }
};

// "Import from PDF" in the module editor: Gemini turns the PDF into module
// content (Markdown, one ## heading per lesson) that the admin reviews in the
// editor before saving. Each picture comes back as a [[figure:...]] line giving
// its page and box, which the browser cuts out of the PDF and uploads (see
// frontend/src/pdfFigures.ts). The PDF itself isn't stored. Uses the DSS model,
// so imports don't use up the chatbot's quota.
const PDF_IMPORT_MODEL = 'gemini-3.1-flash-lite';
const PDF_IMPORT_PROMPT = `Convert this PDF into the content of a learning module for the PHILSAR Cattle Reproductive Portal, written in Markdown.

- Keep the document's own wording. Don't summarize, shorten, reword, translate or add anything; only rejoin lines and words that the PDF layout broke apart. A title or heading that wraps onto two lines is still one line.
- The first line is "# " followed by the document's title. Don't use a single # anywhere else.
- Put any opening text that comes before the first main section right after the title.
- Start each main section or chapter with "## " and its heading; each one becomes a lesson. Use "### " for sub-headings inside a section.
- Use "- " for bullet lists, "1. " for numbered lists, **bold** where the PDF emphasizes words, and "> " for notes or quotes.
- Tables can't be displayed, so write each table row as a bullet ("- Column: value, column: value").
- For each photo, chart, diagram or other picture that carries information, put a line of its own where it belongs in the text, exactly in this form:
  [[figure:PAGE:YMIN,XMIN,YMAX,XMAX:CAPTION]]
  PAGE is the number of the page it's on (the first page is 1). YMIN,XMIN,YMAX,XMAX is the box around the whole picture on that page, as whole numbers from 0 to 1000, where 0,0 is the page's top-left corner and 1000,1000 its bottom-right corner. For a chart or diagram, the box includes its axes, labels, legend and title. The box never includes the caption or the text around the picture. CAPTION is the picture's caption copied word for word, or nothing if it has none; don't repeat the caption elsewhere. Leave out logos, icons and decorations. Tables and scanned pages are text, not pictures: never mark them; write them out as text (a scanned page can still contain pictures to mark).
- Leave out page numbers, running headers and footers, and the table of contents.
- Reply with the Markdown only, with no code fences and nothing before or after it.`;

const importPdf = async (req, res) => {
    // express.raw() hands over the uploaded file as a Buffer
    const pdf = req.body;
    if (!Buffer.isBuffer(pdf) || !pdf.subarray(0, 1024).includes('%PDF-')) {
        return res.status(400).json({ message: "That file isn't a PDF." });
    }
    const fileName = String(req.query.name || 'PDF').slice(0, 200);

    try {
        const response = await ai.models.generateContent({
            model: PDF_IMPORT_MODEL,
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: 'application/pdf', data: pdf.toString('base64') } },
                    { text: PDF_IMPORT_PROMPT }
                ]
            }]
        });

        // Unwrap a ```markdown fence in case the model adds one anyway
        const content = (response.text || '').trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/i, '$1').trim();
        if (!content) {
            return res.status(422).json({ message: 'No text could be read from this PDF.' });
        }
        // Gemini stopped at its output limit: the PDF was only partly converted
        const truncated = response.candidates?.[0]?.finishReason === 'MAX_TOKENS';
        const lessons = (content.match(/^## /gm) || []).length;

        const actor = await User.findByPk(req.user.id, { attributes: ['name', 'role'] });
        logActivity({
            userId: req.user.id, userName: actor?.name, userRole: actor?.role,
            action: 'module_pdf_imported', category: 'admin', details: `Converted "${fileName}" into module content (${lessons} lessons)`, req
        });

        res.status(200).json({ content, lessons, truncated });
    } catch (error) {
        console.error('PDF import error:', error);
        if (error.status === 429) {
            return res.status(503).json({ message: 'Gemini is busy right now. Please try again in a minute.' });
        }
        res.status(500).json({ message: 'Could not convert this PDF. Please try again.' });
    }
};

module.exports = { getModules, getModuleById, createModule, updateModule, deleteModule, uploadImage, backfillEmbeddings, importPdf };
