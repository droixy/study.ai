/**
 * StudyAI - Backend Server
 * Proxies requests to OpenAI, Perplexity, Anthropic, and Wolfram Alpha APIs
 */
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const multer  = require('multer');
const path    = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ─── Helpers ─────────────────────────────────────────── */
function apiError(res, err) {
  const status  = err.response?.status  || 500;
  const message = err.response?.data?.error?.message
               || err.response?.data?.detail
               || err.message
               || 'Unknown error';
  console.error('[API Error]', status, message);
  res.status(status).json({ error: message });
}

/* ─── OpenAI (ChatGPT + Turbo Flashcards) ─────────────── */
app.post('/api/openai', async (req, res) => {
  const { apiKey, ...body } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key required.' });
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    res.json(response.data);
  } catch (err) { apiError(res, err); }
});

/* ─── Perplexity AI (Research) ────────────────────────── */
app.post('/api/perplexity', async (req, res) => {
  const { apiKey, ...body } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Perplexity API key required.' });
  try {
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    res.json(response.data);
  } catch (err) { apiError(res, err); }
});

/* ─── Anthropic (Claude Writing) ─────────────────────── */
app.post('/api/anthropic', async (req, res) => {
  const { apiKey, ...body } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Anthropic API key required.' });
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      body,
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    res.json(response.data);
  } catch (err) { apiError(res, err); }
});

/* ─── Wolfram Alpha (Math & Science) ─────────────────── */
app.get('/api/wolfram', async (req, res) => {
  const { apiKey, query } = req.query;
  if (!apiKey) return res.status(400).json({ error: 'Wolfram Alpha App ID required.' });
  if (!query)  return res.status(400).json({ error: 'Query parameter required.' });
  try {
    const response = await axios.get(
      'https://api.wolframalpha.com/v2/query',
      {
        params: {
          input:  query,
          appid:  apiKey,
          format: 'plaintext,image',
          output: 'JSON',
          podstate: 'Step-by-step solution'
        },
        timeout: 30000
      }
    );
    const qr   = response.data.queryresult;
    const pods = (qr.pods || []).map(pod => ({
      title: pod.title,
      subpods: (pod.subpods || []).map(sp => ({
        plaintext: sp.plaintext || '',
        img:       sp.img ? { src: sp.img.src, alt: sp.img.alt } : null
      }))
    })).filter(p => p.subpods.some(s => s.plaintext || s.img));
    res.json({ success: qr.success, pods, inputString: qr.inputstring });
  } catch (err) { apiError(res, err); }
});

/* ─── Wolfram Short Answer (fallback) ────────────────── */
app.get('/api/wolfram/short', async (req, res) => {
  const { apiKey, query } = req.query;
  if (!apiKey) return res.status(400).json({ error: 'Wolfram Alpha App ID required.' });
  try {
    const response = await axios.get(
      'https://api.wolframalpha.com/v1/result',
      { params: { i: query, appid: apiKey }, timeout: 15000, responseType: 'text' }
    );
    res.json({ result: response.data });
  } catch (err) { apiError(res, err); }
});

/* ─── PDF Parsing ─────────────────────────────────────── */
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF file provided.' });
  try {
    // Use dynamic import to avoid issues with pdf-parse
    const pdfParse = require('pdf-parse');
    const data     = await pdfParse(req.file.buffer);
    res.json({
      text:     data.text,
      pages:    data.numpages,
      info:     data.info,
      filename: req.file.originalname
    });
  } catch (err) {
    console.error('PDF parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
});

/* ─── Health Check ────────────────────────────────────── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

/* ─── Catch-all → index.html ─────────────────────────── */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ─── Start ───────────────────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎓 StudyAI is running!`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → Open in your browser and add your API keys in Settings\n`);
});
