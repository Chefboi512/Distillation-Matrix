/**
 * mvsep-proxy.js
 * ─────────────────────────────────────────────────────────────
 * MVSEP's REST API doesn't return CORS headers, so the browser
 * blocks the fetch. This tiny Express server proxies both
 *   POST /mvsep/create   → https://mvsep.com/api/separation/create
 *   GET  /mvsep/get?...  → https://mvsep.com/api/separation/get
 * and injects permissive CORS headers + handles the multipart
 * upload pass-through.
 *
 * Run with:  node proxy-server.js
 *           (or `node proxy-server.js &` to background it)
 */

import express from 'express';
import multer  from 'multer';

const PORT = 8787;
const MVSEP_BASE = 'https://mvsep.com/api/separation';

const app  = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// permissive CORS for everything
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'mvsep-proxy' }));

// ── POST /mvsep/create ────────────────────────────────────
app.post('/mvsep/create', upload.single('audiofile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, data: { message: 'audiofile missing' } });

    // rebuild multipart body for MVSEP
    const fd = new FormData();
    fd.append('api_token',     req.body.api_token || '');
    fd.append('sep_type',      req.body.sep_type  || '20');
    fd.append('output_format', req.body.output_format || '1');
    fd.append('is_demo',       req.body.is_demo   || 'false');
    if (req.body.add_opt1) fd.append('add_opt1', req.body.add_opt1);
    if (req.body.add_opt2) fd.append('add_opt2', req.body.add_opt2);
    if (req.body.add_opt3) fd.append('add_opt3', req.body.add_opt3);
    fd.append('audiofile', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    const upstream = await fetch(`${MVSEP_BASE}/create`, { method: 'POST', body: fd });
    const text     = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    res.status(500).json({ success: false, data: { message: e.message } });
  }
});

// ── GET /mvsep/get?hash=… ─────────────────────────────────
app.get('/mvsep/get', async (req, res) => {
  try {
    const hash = req.query.hash;
    if (!hash) return res.status(400).json({ success: false, data: { message: 'hash missing' } });
    const upstream = await fetch(`${MVSEP_BASE}/get?hash=${encodeURIComponent(hash)}`);
    const text     = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    res.status(500).json({ success: false, data: { message: e.message } });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ⏣  MVSEP proxy listening on http://localhost:${PORT}`);
  console.log(`     POST http://localhost:${PORT}/mvsep/create`);
  console.log(`     GET  http://localhost:${PORT}/mvsep/get?hash=…\n`);
});
