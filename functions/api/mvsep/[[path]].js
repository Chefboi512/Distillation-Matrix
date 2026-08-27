/**
 * Cloudflare Pages Function — MVSEP API proxy
 * ─────────────────────────────────────────────────────────────
 * Mirrors proxy-server.js (dev) but runs in the Cloudflare edge.
 * Same URL shape on both sides, so the React app uses one path:
 *
 *   POST /api/mvsep/create   → upstream: https://mvsep.com/api/separation/create
 *   GET  /api/mvsep/get?…    → upstream: https://mvsep.com/api/separation/get
 *   GET  /api/mvsep/audio?url=…  → streams MVSEP file with CORS headers
 *
 * Required Cloudflare Pages env var:
 *   MVSEP_API_KEY=…   (get one at https://mvsep.com/)
 *
 * Wrangler limits: 100 MB request body on paid plans, 10 MB on free
 * (which is enough for a 3-5 minute song at 320 kbps MP3).
 */

const MVSEP_BASE = 'https://mvsep.com/api/separation';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: CORS });

// POST /api/mvsep/create
export const onRequestPost = async ({ request, env, params }) => {
  const key = env.MVSEP_API_KEY;
  if (!key) return json({ success: false, data: { message: 'MVSEP_API_KEY env var not set' } }, 500);

  const sub = (params.path || [])[0];

  if (sub !== 'create') {
    return json({ success: false, data: { message: `Unknown POST /${sub}` } }, 404);
  }

  try {
    const form = await request.formData();
    const file = form.get('audiofile');
    if (!file || typeof file === 'string') {
      return json({ success: false, data: { message: 'audiofile missing' } }, 400);
    }

    const fd = new FormData();
    fd.append('api_token',     key);
    fd.append('sep_type',      String(form.get('sep_type')      || '20'));
    fd.append('output_format', String(form.get('output_format') || '1'));
    fd.append('is_demo',       String(form.get('is_demo')       || 'false'));
    for (const opt of ['add_opt1', 'add_opt2', 'add_opt3', 'add_opt4', 'add_opt5']) {
      const v = form.get(opt);
      if (v != null) fd.append(opt, String(v));
    }
    // re-attach the file (the original File is fine to stream back out)
    fd.append('audiofile', file, file.name || 'audio');

    const upstream = await fetch(`${MVSEP_BASE}/create`, { method: 'POST', body: fd });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return json({ success: false, data: { message: e.message } }, 500);
  }
};

// GET /api/mvsep/get?hash=…  or  /api/mvsep/audio?url=…&name=…
export const onRequestGet = async ({ request, env, params }) => {
  const sub = (params.path || [])[0];

  if (sub === 'get') {
    try {
      const url = new URL(request.url);
      const hash = url.searchParams.get('hash');
      if (!hash) return json({ success: false, data: { message: 'hash missing' } }, 400);
      const upstream = await fetch(`${MVSEP_BASE}/get?hash=${encodeURIComponent(hash)}`);
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return json({ success: false, data: { message: e.message } }, 500);
    }
  }

  if (sub === 'audio') {
    try {
      const url = new URL(request.url);
      const target = url.searchParams.get('url');
      const name = url.searchParams.get('name');
      if (!target) return json({ success: false, data: { message: 'url missing' } }, 400);
      if (!/^https?:\/\//i.test(target)) return json({ success: false, data: { message: 'url must be http(s)' } }, 400);

      const upstream = await fetch(target, { redirect: 'follow' });
      if (!upstream.ok) {
        return json({ success: false, data: { message: `upstream ${upstream.status}` } }, upstream.status);
      }
      // Buffer the whole body — for stem audio (a few MB) this is fine,
      // and it dodges any ReadableStream-pass-through quirks in Workers.
      const body = await upstream.arrayBuffer();
      const headers = new Headers(CORS);
      const ct = upstream.headers.get('content-type') || 'application/octet-stream';
      headers.set('Content-Type', ct);
      headers.set('Content-Length', String(body.byteLength));
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      if (name) headers.set('Content-Disposition', `attachment; filename="${String(name).replace(/"/g, '')}"`);
      // NB: we don't advertise Accept-Ranges because we don't implement
      // partial responses. Advertising it causes browsers to issue range
      // requests, which would fail.
      return new Response(body, { status: 200, headers });
    } catch (e) {
      return json({ success: false, data: { message: e.message } }, 500);
    }
  }

  return json({ success: false, data: { message: 'Not found' } }, 404);
};
