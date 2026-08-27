/**
 * Cloudflare Pages Function — MVSEP API proxy
 * ─────────────────────────────────────────────────────────────
 *
 *   POST /api/mvsep/create   → upstream: https://mvsep.com/api/separation/create
 *   GET  /api/mvsep/get?…    → upstream: https://mvsep.com/api/separation/get
 *   GET  /api/mvsep/audio?url=…  → streams MVSEP file with CORS headers
 *   GET  /api/mvsep/test     → health/debug (no upstream call)
 *
 * Required Cloudflare Pages env var:
 *   MVSEP_API_KEY=…   (get one at https://mvsep.com/)
 *
 * For /create we use the proven RE-PARSE approach: parse the
 * browser's multipart form, re-build a new FormData with the
 * api_token added, forward to MVSEP. This is what worked in the
 * first deployment. A later "stream-through" optimization
 * turned out to be unreliable on Cloudflare Workers.
 *
 * Body limits: 100 MB paid / 10 MB free Cloudflare Pages plan.
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

export const onRequestPost = async ({ request, env, params }) => {
  const sub = (params.path || [])[0];
  if (sub === 'create') return handleCreate(request, env);
  if (sub === 'test')   return handleTest(env);
  return json({ success: false, data: { message: `Unknown POST /${sub || ''}` } }, 404);
};

export const onRequestGet = async ({ request, env, params }) => {
  const sub = (params.path || [])[0];
  if (sub === 'get')   return handleGet(request);
  if (sub === 'audio') return handleAudio(request);
  if (sub === 'test')  return handleTest(env);
  return json({ success: false, data: { message: `Unknown GET /${sub || ''}` } }, 404);
};

// ── POST /api/mvsep/create ───────────────────────────────────
async function handleCreate(request, env) {
  const key = env.MVSEP_API_KEY;
  if (!key) {
    return json({
      success: false,
      data: {
        message:
          'MVSEP_API_KEY env var is not set. In Cloudflare Pages: ' +
          'Settings → Environment variables → add MVSEP_API_KEY, then redeploy.',
      },
    }, 500);
  }

  // Pre-flight body size check
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > 100 * 1024 * 1024) {
    return json({
      success: false,
      data: { message: `Upload too large (${(contentLength / 1048576).toFixed(1)} MB). Max 100 MB on paid, 10 MB on free Cloudflare Pages.` },
    }, 413);
  }

  // Parse the multipart body
  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({
      success: false,
      data: { message: `Could not parse multipart form: ${e?.message || e}. File may exceed the Cloudflare Pages body limit.` },
    }, 400);
  }

  const file = form.get('audiofile');
  if (!file) {
    const fields = Array.from(form.keys());
    return json({
      success: false,
      data: { message: `audiofile field missing. Got fields: [${fields.join(', ')}]` },
    }, 400);
  }
  if (typeof file === 'string') {
    return json({
      success: false,
      data: { message: 'audiofile was sent as text, not a file. Browser should be appending a File object.' },
    }, 400);
  }

  console.log('[create] file:', file.name, file.type || '(no type)', `${(file.size / 1024).toFixed(1)} KB`);

  // Re-build FormData with api_token injected
  const fd = new FormData();
  fd.append('api_token',     key);
  fd.append('sep_type',      String(form.get('sep_type')      || '20'));
  fd.append('output_format', String(form.get('output_format') || '1'));
  fd.append('is_demo',       String(form.get('is_demo')       || 'false'));
  for (const opt of ['add_opt1', 'add_opt2', 'add_opt3', 'add_opt4', 'add_opt5']) {
    const v = form.get(opt);
    if (v != null) fd.append(opt, String(v));
  }
  fd.append('audiofile', file, file.name || 'audio');

  // Forward to MVSEP
  let upstream;
  try {
    upstream = await fetch(`${MVSEP_BASE}/create`, { method: 'POST', body: fd });
  } catch (e) {
    return json({
      success: false,
      data: { message: `Could not reach MVSEP: ${e?.message || e}` },
    }, 502);
  }

  const text = await upstream.text();
  console.log('[create] MVSEP response:', upstream.status, text.slice(0, 300));

  // Pass through MVSEP's response as-is. If it's a 4xx, MVSEP's body
  // usually has { success: false, data: { message: "..." } }.
  return new Response(text, {
    status: upstream.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── GET /api/mvsep/get?hash=… ────────────────────────────────
async function handleGet(request) {
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

// ── GET /api/mvsep/audio?url=…&name=… ───────────────────────
async function handleAudio(request) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    const name   = url.searchParams.get('name');
    if (!target) return json({ success: false, data: { message: 'url missing' } }, 400);
    if (!/^https?:\/\//i.test(target)) return json({ success: false, data: { message: 'url must be http(s)' } }, 400);

    const upstream = await fetch(target, { redirect: 'follow' });
    if (!upstream.ok) {
      return json({ success: false, data: { message: `upstream ${upstream.status}` } }, upstream.status);
    }
    const body = await upstream.arrayBuffer();
    const headers = new Headers(CORS);
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    headers.set('Content-Type', ct);
    headers.set('Content-Length', String(body.byteLength));
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    if (name) headers.set('Content-Disposition', `attachment; filename="${String(name).replace(/"/g, '')}"`);
    return new Response(body, { status: 200, headers });
  } catch (e) {
    return json({ success: false, data: { message: e.message } }, 500);
  }
}

// ── GET|POST /api/mvsep/test ─────────────────────────────────
async function handleTest(env) {
  return json({
    success: true,
    data: {
      message: 'MVSEP proxy reachable',
      hasApiKey: !!env.MVSEP_API_KEY,
      keyLength: env.MVSEP_API_KEY?.length || 0,
      keyPrefix: env.MVSEP_API_KEY?.slice(0, 4) + '…',
      timestamp: new Date().toISOString(),
    },
  });
}
