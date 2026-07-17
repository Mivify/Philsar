// Minimal static file server for the production build, used when deploying the
// frontend as its own service (e.g. Railway) rather than a static host like
// Vercel/Netlify. express is already a dependency, so no extra package is needed.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — the app handles routing client-side via pushState
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Frontend static server running on port ${PORT}`);
});
