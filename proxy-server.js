/**
 * proxy-server.js
 * ─────────────────────────────────────────────────────────────
 * Dev-mode CORS proxy + audio streaming shim for the MVSEP API.
 *
 *   POST /api/mvsep/create   → https://mvsep.com/api/separation/create
 *   GET  /api/mvsep/get?…    → https://mvsep.com/api/separation/get
 *   GET  /api/mvsep/audio?url=…  → streams MVSEP file with CORS headers
 *
 * In production this same surface is served by the Cloudflare Pages
 * Function in `functions/api/mvsep/[[path]].js`. Same URL shape.
 *
 * Required env:
 *   MVSEP_API_KEY=…   (get one at https://mvsep.com/)
 */

import express from 'express';
import multer  from 'multer';

const PORT = 8787;
const MVSEP_BASE = 'https://mvsep.com/api/separation';
const MVSEP_API_KEY = process.env.MVSEP_API_KEY;

if (!MVSEP_API_KEY) {
  console.error('\n  ✗  MVSEP_API_KEY is not set.\n     export MVSEP_API_KEY=your_key_here   (or put it in .env)\n');
  process.exit(1);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// CORS
const cors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Disposition');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};
app.use(cors);

app.get('/health', (_req, res) => res.json({ ok: true, service: 'mvsep-proxy' }));

// ── POST /api/mvsep/create ────────────────────────────────────
app.post('/api/mvsep/create', upload.single('audiofile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, data: { message: 'audiofile missing' } });
    }
    const fd = new FormData();
    fd.append('api_token',     MVSEP_API_KEY);
    fd.append('sep_type',      req.body.sep_type      || '20');
    fd.append('output_format', req.body.output_format || '1');
    fd.append('is_demo',       req.body.is_demo       || 'false');
    if (req.body.add_opt1) fd.append('add_opt1', req.body.add_opt1);
    if (req.body.add_opt2) fd.append('add_opt2', req.body.add_opt2);
    if (req.body.add_opt3) fd.append('add_opt3', req.body.add_opt3);
    fd.append('audiofile', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    const upstream = await fetch(`${MVSEP_BASE}/create`, { method: 'POST', body: fd });
    const text     = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    console.error('[create]', e);
    res.status(500).json({ success: false, data: { message: e.message } });
  }
});

// ── GET /api/mvsep/get?hash=… ─────────────────────────────────
app.get('/api/mvsep/get', async (req, res) => {
  try {
    const hash = req.query.hash;
    if (!hash) return res.status(400).json({ success: false, data: { message: 'hash missing' } });
    const upstream = await fetch(`${MVSEP_BASE}/get?hash=${encodeURIComponent(hash)}`);
    const text     = await upstream.text();
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    console.error('[get]', e);
    res.status(500).json({ success: false, data: { message: e.message } });
  }
});

// ── GET /api/mvsep/audio?url=…&name=… ────────────────────────
// Streams a remote MVSEP file with permissive CORS so the Web Audio
// analyser (createMediaElementSource) can read frequency data.
app.get('/api/mvsep/audio', async (req, res) => {
  try {
    const url = req.query.url;
    const name = req.query.name;
    if (!url) return res.status(400).json({ success: false, data: { message: 'url missing' } });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ success: false, data: { message: 'url must be http(s)' } });

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ success: false, data: { message: `upstream ${upstream.status}` } });
    }

    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Accept-Ranges', 'bytes');
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }
    if (name) {
      res.setHeader('Content-Disposition', `attachment; filename="${String(name).replace(/"/g, '')}"`);
    }
    // stream the body
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    console.error('[audio]', e);
    res.status(500).json({ success: false, data: { message: e.message } });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ⏣  MVSEP proxy listening on http://localhost:${PORT}`);
  console.log(`     POST  /api/mvsep/create`);
  console.log(`     GET   /api/mvsep/get?hash=…`);
  console.log(`     GET   /api/mvsep/audio?url=…&name=…\n`);
});
