/**
 * DistillationMatrix — MVSEP-powered audio stem separator
 * ─────────────────────────────────────────────────────────
 * Drop a .wav or .mp3 → pick a separation model → watch the lab
 * distill the song into individual stems (vocals / drums / bass / etc.)
 *
 * Notes
 *  • MVSEP does NOT send CORS headers, so direct fetch() from the
 *    browser will be blocked. Run the included `proxy-server.js`
 *    alongside this app and set USE_PROXY = true.
 *  • The API key in the source is fine for a personal tool, but
 *    move it server-side if you ever ship this publicly.
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
import {
  Play, Pause, RotateCcw, Download, ChevronDown, FileAudio,
  Loader2, Check, X, AlertCircle, Music, Settings, Upload,
  ListMusic, Sliders, Folder, HardDrive,
} from 'lucide-react';

// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
// The MVSEP API key is held server-side — never in this bundle.
// The proxy (Express in dev, Cloudflare Pages Function in prod)
// lives at /api/mvsep. Same-origin, no CORS, no exposed key.
const PROXY_URL = '/api/mvsep';

// Convert an absolute MVSEP file URL into one that goes through the
// proxy. The proxy streams the file with permissive CORS headers
// so the Web Audio analyser (createMediaElementSource) can read it.
const proxyFile = (absUrl) => {
  if (!absUrl) return absUrl;
  // already relative? leave it alone
  if (absUrl.startsWith('/')) return absUrl;
  return `${PROXY_URL}/audio?url=${encodeURIComponent(absUrl)}`;
};

// ════════════════════════════════════════════════════════════
//  SEPARATION MODELS (curated from the MVSEP catalogue)
// ════════════════════════════════════════════════════════════
const SEPARATION_TYPES = [
  { id: 20,  name: 'Demucs4 HT',            tag: 'POPULAR', desc: 'Vocals · Drums · Bass · Other — fast & clean' },
  { id: 28,  name: 'Ensemble 5-stem',       tag: 'BEST',    desc: 'Top SDR ensemble, 5 stems' },
  { id: 30,  name: 'Ensemble All-In',       tag: 'PRO',     desc: '7 stems incl. piano / guitar / lead-back vox' },
  { id: 40,  name: 'BS Roformer',           tag: 'TOP',     desc: 'Vocals / Instrumental — state of the art' },
  { id: 48,  name: 'MelBand Roformer',      tag: 'TOP',     desc: 'Vocals / Instrumental, alternative model' },
  { id: 123, name: 'BS PolarFormer',        tag: 'NEW',     desc: 'Vocals / Instrumental, polar-mask variant' },
  { id: 25,  name: 'MDX23C',                tag: null,      desc: 'Reliable 2-stem baseline' },
  { id: 46,  name: 'SCNet',                 tag: null,      desc: 'Vocals / Instrumental' },
  { id: 26,  name: 'Ensemble 2-stem',       tag: null,      desc: 'Fast vocals+instr ensemble' },
  { id: 49,  name: 'Karaoke (MVSep)',       tag: null,      desc: 'Lead / Back vocals' },
  { id: 12,  name: 'MDX-B Karaoke',         tag: null,      desc: 'Lead / Back vocals, MDX' },
  { id: 63,  name: 'BS Roformer SW',        tag: 'PRO',     desc: '6-stem: vox / bass / drums / gtr / piano / other' },
  { id: 37,  name: 'DrumSep',               tag: null,      desc: 'Kick / Snare / Cymbals / Toms / HH / Crash' },
  { id: 44,  name: 'MVSep Drums',           tag: null,      desc: 'Drums vs everything else' },
  { id: 41,  name: 'MVSep Bass',            tag: null,      desc: 'Bass vs everything else' },
  { id: 29,  name: 'MVSep Piano',           tag: null,      desc: 'Piano vs everything else' },
  { id: 31,  name: 'MVSep Guitar',          tag: null,      desc: 'Guitar vs everything else' },
  { id: 57,  name: 'Male / Female',         tag: null,      desc: 'Gender-split vocals' },
  { id: 22,  name: 'Reverb Removal',        tag: 'FX',      desc: 'Strip reverb (DeReverb)' },
  { id: 47,  name: 'DeNoise',               tag: 'FX',      desc: 'Clean up background noise' },
  { id: 36,  name: 'BandIt Plus',           tag: 'FX',      desc: 'Speech / Music / Effects' },
];

// ════════════════════════════════════════════════════════════
//  STEM VISUAL CONFIG
// ════════════════════════════════════════════════════════════
const STEM_PALETTE = {
  vocals:        { name: 'VOCALS',     hex: '#ec4899', color: '236, 72, 153',  shadow: 'rgba(236, 72, 153, 0.55)' },
  lead_vocals:   { name: 'LEAD VOX',   hex: '#ec4899', color: '236, 72, 153',  shadow: 'rgba(236, 72, 153, 0.55)' },
  leadvocals:    { name: 'LEAD VOX',   hex: '#ec4899', color: '236, 72, 153',  shadow: 'rgba(236, 72, 153, 0.55)' },
  back_vocals:   { name: 'BACK VOX',   hex: '#f472b6', color: '244, 114, 182', shadow: 'rgba(244, 114, 182, 0.55)' },
  backvocals:    { name: 'BACK VOX',   hex: '#f472b6', color: '244, 114, 182', shadow: 'rgba(244, 114, 182, 0.55)' },
  instrumental:  { name: 'INSTRUMENT', hex: '#a855f7', color: '168, 85, 247',  shadow: 'rgba(168, 85, 247, 0.55)' },
  instrum:       { name: 'INSTRUMENT', hex: '#a855f7', color: '168, 85, 247',  shadow: 'rgba(168, 85, 247, 0.55)' },
  instrumental1: { name: 'INSTRUMENT', hex: '#a855f7', color: '168, 85, 247',  shadow: 'rgba(168, 85, 247, 0.55)' },
  drums:         { name: 'DRUMS',      hex: '#3b82f6', color: '59, 130, 246',  shadow: 'rgba(59, 130, 246, 0.55)' },
  bass:          { name: 'BASS',       hex: '#22c55e', color: '34, 197, 94',   shadow: 'rgba(34, 197, 94, 0.55)' },
  other:         { name: 'OTHER',      hex: '#64748b', color: '100, 116, 139', shadow: 'rgba(100, 116, 139, 0.55)' },
  piano:         { name: 'PIANO',      hex: '#f59e0b', color: '245, 158, 11',  shadow: 'rgba(245, 158, 11, 0.55)' },
  guitar:        { name: 'GUITAR',     hex: '#ef4444', color: '239, 68, 68',   shadow: 'rgba(239, 68, 68, 0.55)' },
  kick:          { name: 'KICK',       hex: '#f97316', color: '249, 115, 22',  shadow: 'rgba(249, 115, 22, 0.55)' },
  snare:         { name: 'SNARE',      hex: '#eab308', color: '234, 179, 8',   shadow: 'rgba(234, 179, 8, 0.55)' },
  cymbals:       { name: 'CYMBALS',    hex: '#06b6d4', color: '6, 182, 212',   shadow: 'rgba(6, 182, 212, 0.55)' },
  toms:          { name: 'TOMS',       hex: '#84cc16', color: '132, 204, 22',  shadow: 'rgba(132, 204, 22, 0.55)' },
  hihat:         { name: 'HI-HAT',     hex: '#14b8a6', color: '20, 184, 166',  shadow: 'rgba(20, 184, 166, 0.55)' },
  hi_hat:        { name: 'HI-HAT',     hex: '#14b8a6', color: '20, 184, 166',  shadow: 'rgba(20, 184, 166, 0.55)' },
  ride:          { name: 'RIDE',       hex: '#0ea5e9', color: '14, 165, 233',  shadow: 'rgba(14, 165, 233, 0.55)' },
  crash:         { name: 'CRASH',      hex: '#f43f5e', color: '244, 63, 94',   shadow: 'rgba(244, 63, 94, 0.55)' },
  speech:        { name: 'SPEECH',     hex: '#fbbf24', color: '251, 191, 36',  shadow: 'rgba(251, 191, 36, 0.55)' },
  music:         { name: 'MUSIC',      hex: '#a78bfa', color: '167, 139, 250', shadow: 'rgba(167, 139, 250, 0.55)' },
  effects:       { name: 'EFFECTS',    hex: '#fb7185', color: '251, 113, 133', shadow: 'rgba(251, 113, 133, 0.55)' },
  male:          { name: 'MALE',       hex: '#60a5fa', color: '96, 165, 250',  shadow: 'rgba(96, 165, 250, 0.55)' },
  female:        { name: 'FEMALE',     hex: '#f9a8d4', color: '249, 168, 212', shadow: 'rgba(249, 168, 212, 0.55)' },
  reverb:        { name: 'REVERB',     hex: '#94a3b8', color: '148, 163, 184', shadow: 'rgba(148, 163, 184, 0.55)' },
  noreverb:      { name: 'DRY',        hex: '#cbd5e1', color: '203, 213, 225', shadow: 'rgba(203, 213, 225, 0.55)' },
};

const FALLBACK_VISUAL = { name: 'STEM', hex: '#a855f7', color: '168, 85, 247', shadow: 'rgba(168, 85, 247, 0.55)' };

function stemVisualFromName(filename = '') {
  const base = filename.toLowerCase().replace(/\.[^.]+$/, '');
  // try longest keys first so 'lead_vocals' matches before 'vocals'
  const keys = Object.keys(STEM_PALETTE).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (base.includes(k)) return { id: k, ...STEM_PALETTE[k] };
  }
  return { id: 'other', ...FALLBACK_VISUAL };
}

// ════════════════════════════════════════════════════════════
//  API HELPERS
// ════════════════════════════════════════════════════════════
// All requests go through the same-origin proxy. The proxy owns the
// MVSEP_API_KEY and injects it on the way out.
async function createSeparation({ file, sepType, outputFormat = 0 }) {
  // output_format: 0 = MP3 320kbps (smaller, friendlier for the 10MB
  // Cloudflare free-tier body limit). Flip to 1 for 16-bit WAV.
  const form = new FormData();
  form.append('audiofile', file);
  form.append('sep_type', String(sepType));
  form.append('output_format', String(outputFormat));
  form.append('is_demo', 'false');

  const res = await fetch(`${PROXY_URL}/create`, { method: 'POST', body: form });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    // Non-JSON body usually means Cloudflare's edge rejected the
    // request before our function could respond (body too large, etc).
    if (res.status === 400) {
      throw new Error(
        `HTTP 400 from server. The most common cause is the file being ` +
        `over the 10 MB Cloudflare Pages free-tier body limit. Check the ` +
        `file size — a 3-min WAV is ~30 MB; a 3-min MP3 at 192 kbps is ~4 MB.`
      );
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120) || '(empty response)'}`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(json?.data?.message || `HTTP ${res.status}`);
  }
  return json.data; // { hash, link }
}

async function pollSeparation(hash) {
  const res = await fetch(`${PROXY_URL}/get?hash=${encodeURIComponent(hash)}`);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Bad response: ${text.slice(0, 120)}`); }
  return json; // { success, status, data }
}

// ════════════════════════════════════════════════════════════
//  FILE VALIDATION (proper MIME for wav / mp3)
// ════════════════════════════════════════════════════════════
const ACCEPTED_MIME = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'];
const ACCEPTED_EXT  = ['.wav', '.mp3'];

function isAudioFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  if (ACCEPTED_EXT.some(ext => name.endsWith(ext))) return true;
  if (ACCEPTED_MIME.includes(file.type)) return true;
  return false;
}

function formatBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

// ════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function DistillationLab() {
  // ── core state ────────────────────────────────────────────
  const [file, setFile]               = useState(null);
  const [localAudioUrl, setLocalUrl]  = useState(null);
  const [stage, setStage]             = useState('idle'); // idle | uploading | queued | processing | distributing | merging | complete | error
  const [jobInfo, setJobInfo]         = useState(null);   // { hash, queueCount, currentOrder, message }
  const [error, setError]             = useState(null);
  const [stems, setStems]             = useState([]);     // [{ name, url, visual }]
  const [sepType, setSepType]         = useState(20);
  const [showSettings, setShowSettings] = useState(false);
  const [pickerOpen, setPickerOpen]   = useState(false);  // local-file browser modal
  const [localFiles, setLocalFiles]   = useState([]);
  const [tooLarge, setTooLarge]       = useState(false);  // file over the upload body limit

  // ── audio playback state ──────────────────────────────────
  const [activePlay, setActivePlay]   = useState(null);   // 'main' | stem.id
  const [volumes, setVolumes]         = useState({});     // stem.id -> 0..1
  const fileInputRef  = useRef(null);
  const dirInputRef   = useRef(null);
  const audioRef      = useRef(null);   // original file preview
  const stemAudioRefs = useRef({});     // stem.id -> HTMLAudioElement

  // ── web audio engine refs ─────────────────────────────────
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const sourceRef      = useRef(null);
  const animationRef   = useRef(null);
  const activePlayRef  = useRef(null);
  const pollTimerRef   = useRef(null);
  useEffect(() => { activePlayRef.current = activePlay; }, [activePlay]);

  // ── cleanup on unmount ────────────────────────────────────
  useEffect(() => () => {
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    stems.forEach(s => s.url && URL.revokeObjectURL(s.url));
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
  }, [localAudioUrl, stems]);

  // ── automatic polling while job is running ────────────────
  useEffect(() => {
    if (!jobInfo?.hash) return;
    if (['complete', 'error', 'idle'].includes(stage)) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    let cancelled = false;
    const tick = async () => {
      try {
        const r = await pollSeparation(jobInfo.hash);
        if (cancelled) return;
        if (r.success === false) {
          throw new Error(r?.data?.message || 'Job not found');
        }
        const status = r.status;
        if (status === 'done') {
          setStage('complete');
          setJobInfo(prev => ({ ...prev, message: r.data?.message || 'Done' }));
          // Normalise files — API returns array of { url, ... } or object map
          const rawFiles = Array.isArray(r.data?.files) ? r.data.files
                          : (r.data?.files && typeof r.data.files === 'object') ? Object.values(r.data.files)
                          : [];
          const built = rawFiles
            .filter(f => f && (f.url || f.link || f.download_url))
            .map(f => {
              const absUrl = f.url || f.link || f.download_url;
              const fname  = f.filename || f.name || absUrl.split('/').pop() || 'stem';
              // Route through the proxy so CORS / Web Audio works
              return { name: fname, url: proxyFile(absUrl), visual: stemVisualFromName(fname) };
            });
          if (built.length === 0) throw new Error('Job finished but no stem files returned');
          setStems(built);
        } else if (status === 'failed') {
          throw new Error(r.data?.message || 'Job failed on MVSEP side');
        } else {
          setStage(status); // waiting | processing | distributing | merging
          setJobInfo(prev => ({
            ...prev,
            queueCount:   r.data?.queue_count,
            currentOrder: r.data?.current_order,
            message:      r.data?.message,
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setStage('error');
        }
      }
    };
    tick(); // immediate first call
    pollTimerRef.current = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(pollTimerRef.current); };
  }, [jobInfo?.hash, stage]);

  // ════════════════════════════════════════════════════════════
  //  HANDLERS
  // ════════════════════════════════════════════════════════════
  const acceptFile = useCallback((f) => {
    if (!f) return;
    if (!isAudioFile(f)) {
      setError('Please upload a .wav or .mp3 file.');
      setTooLarge(false);
      return;
    }
    // Cloudflare Pages free tier caps request bodies at 10 MB; paid at
    // 100 MB. A 3-min WAV is ~30 MB and will get a 400 from the
    // platform before it ever reaches the function. Block the upload
    // outright so the user gets a clear message instead of a
    // confusing generic 400.
    if (f.size > 10 * 1024 * 1024) {
      setTooLarge(true);
      setError(
        `File is ${(f.size / 1048576).toFixed(1)} MB — over the 10 MB upload limit ` +
        `for Cloudflare Pages free tier. Convert to MP3 (192-320 kbps) or trim the ` +
        `track, then try again. Upgrade to a paid plan to raise the limit to 100 MB.`
      );
    } else {
      setTooLarge(false);
      setError(null);
    }
    setStems([]);
    setJobInfo(null);
    setStage('idle');
    setActivePlay(null);
    setFile(f);
    setLocalUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
  }, []);

  const handleFileDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0];
    acceptFile(f);
  };

  const handleDirPick = (e) => {
    const list = Array.from(e.target.files || []);
    const filtered = list
      .filter(isAudioFile)
      .map(f => ({ file: f, size: f.size, url: URL.createObjectURL(f) }));
    setLocalFiles(filtered);
    setPickerOpen(true);
  };

  const startSeparation = async () => {
    if (!file) return;
    if (tooLarge) return; // belt-and-suspenders
    try {
      setError(null);
      setStems([]);
      setStage('uploading');
      const data = await createSeparation({ file, sepType });
      setJobInfo({ hash: data.hash, link: data.link, message: 'Queued' });
      setStage('queued');
    } catch (e) {
      setError(e.message);
      setStage('error');
    }
  };

  const resetLab = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    Object.values(stemAudioRefs.current).forEach(a => { a.pause(); a.currentTime = 0; });
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    stems.forEach(s => s.url && URL.revokeObjectURL(s.url));
    setFile(null); setLocalUrl(null); setStage('idle'); setProgressSafe(0);
    setActivePlay(null); setStems([]); setJobInfo(null); setError(null);
    const c = document.getElementById('distillation-matrix');
    if (c) {
      c.style.setProperty('--vol-main', 0);
      stems.forEach(s => c.style.setProperty(`--vol-${s.visual.id}`, 0));
    }
  };

  // helper to bypass the React state setter for progress simulation
  const setProgressSafe = (v) => { /* no-op placeholder, we just animate via DOM below */ };

  // ════════════════════════════════════════════════════════════
  //  WEB AUDIO ENGINE
  //  The spectrum visualiser is a nice-to-have on top of basic
  //  playback. createMediaElementSource is fragile (one-shot per
  //  element, context state-sensitive, NotSupportedError on CORS
  //  conflicts). We make it best-effort: if it fails, playback
  //  still works, the visualiser just stays flat.
  // ════════════════════════════════════════════════════════════
  const initAudioEngine = (audioEl) => {
    if (!audioEl) return null;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const an  = ctx.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.85;
        audioCtxRef.current = ctx;
        analyserRef.current   = an;
        sourceRef.current     = new Map();
      } catch (e) {
        console.warn('[audio] could not create AudioContext', e);
        return null;
      }
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }

    // Attach a MediaElementSource to drive the visualiser.
    // Skip silently if it fails for any reason — playback still works.
    const sources = sourceRef.current;
    if (sources && !sources.has(audioEl)) {
      try {
        const s = audioCtxRef.current.createMediaElementSource(audioEl);
        s.connect(analyserRef.current);
        analyserRef.current.connect(audioCtxRef.current.destination);
        sources.set(audioEl, s);
      } catch (e) {
        console.warn('[audio] could not wire visualiser (playback will still work):', e?.message);
      }
    }
    return audioCtxRef.current;
  };

  // Wait until the audio element has enough buffered data to play.
  // Resolves immediately if already ready, resolves on timeout, rejects
  // only on explicit error.
  const waitForAudioReady = (audioEl, timeoutMs = 12000) => new Promise((resolve, reject) => {
    if (!audioEl) return reject(new Error('no audio element'));
    if (audioEl.readyState >= 2 /* HAVE_CURRENT_DATA */) return resolve();
    if (audioEl.error) return reject(new Error(audioEl.error.message || 'audio element error'));

    const onReady = () => { cleanup(); resolve(); };
    const onErr   = () => { cleanup(); reject(new Error(audioEl.error?.message || 'audio load failed')); };
    const cleanup = () => {
      audioEl.removeEventListener('canplaythrough', onReady);
      audioEl.removeEventListener('canplay',        onReady);
      audioEl.removeEventListener('error',          onErr);
      clearTimeout(timer);
    };
    audioEl.addEventListener('canplaythrough', onReady, { once: true });
    audioEl.addEventListener('canplay',        onReady, { once: true });
    audioEl.addEventListener('error',          onErr,   { once: true });
    const timer = setTimeout(() => { cleanup(); resolve(); }, timeoutMs);
    // Do NOT call load() here — `src` + `preload="auto"` already starts
    // the fetch. Calling load() resets readyState and races with canplay.
  });

  const updateVisualizer = useCallback(() => {
    if (!analyserRef.current || !activePlayRef.current) return;
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(buf);
    const band = (s, e, m = 1) => {
      let sum = 0; for (let i = s; i < e; i++) sum += buf[i];
      return Math.min(1, Math.max(0, Math.pow(sum / ((e - s) * 255), 1.2) * m));
    };
    const bass   = band(1, 6, 2.0);
    const drums  = band(6, 20, 2.2);
    const vocals = band(20, 70, 2.4);
    const other  = band(70, 250, 2.6);
    const main   = band(1, 250, 1.8);
    const c = document.getElementById('distillation-matrix');
    if (c) {
      c.style.setProperty('--vol-bass', bass);
      c.style.setProperty('--vol-drums', drums);
      c.style.setProperty('--vol-vocals', vocals);
      c.style.setProperty('--vol-other', other);
      c.style.setProperty('--vol-main', main);
    }
    setVolumes({ bass, drums, vocals, other, main });
    animationRef.current = requestAnimationFrame(updateVisualizer);
  }, []);

  const stopVisualizer = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const c = document.getElementById('distillation-matrix');
    if (c) {
      ['bass', 'drums', 'vocals', 'other', 'main'].forEach(k => c.style.setProperty(`--vol-${k}`, 0));
    }
    setVolumes({});
  };

  const togglePlay = async (target) => {
    // target is 'main' (string) or a stem object
    const isStem  = typeof target === 'object';
    // use a stable id we can both write and read — the audio element ref
    const targetKey = isStem ? target.url : 'main';
    const audioEl   = isStem ? stemAudioRefs.current[target.url] : audioRef.current;
    if (!audioEl) return;

    // Already playing this one → pause
    if (activePlay === targetKey) {
      audioEl.pause();
      setActivePlay(null);
      stopVisualizer();
      return;
    }

    // Stop everything else (but NOT the target element)
    const stopList = [];
    if (audioRef.current && audioRef.current !== audioEl) stopList.push(audioRef.current);
    Object.values(stemAudioRefs.current).forEach((el) => {
      if (el && el !== audioEl) stopList.push(el);
    });
    stopList.forEach(el => { el.pause(); el.currentTime = 0; });

    // Wire up the Web Audio graph (idempotent)
    initAudioEngine(audioEl);

    setActivePlay(targetKey);

    try {
      await waitForAudioReady(audioEl);
      audioEl.currentTime = 0;
      await audioEl.play();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(updateVisualizer);
    } catch (err) {
      // Benign interruption errors from rapid clicking / re-renders.
      // Chrome throws these when play() is called and the element is
      // already playing or just paused. Don't surface them to the UI.
      const name = err?.name || '';
      const msg  = (err?.message || '').toLowerCase();
      if (
        name === 'AbortError' ||
        msg.includes('interrupted') ||
        msg.includes('absorbed') ||
        msg.includes('removed from the document') ||
        msg.includes('not allowed')
      ) {
        console.warn('[playback] suppressed benign error:', err.message);
        return;
      }
      setError(`Playback failed: ${err.message || name}`);
      setActivePlay(null);
      stopVisualizer();
    }
  };

  // ════════════════════════════════════════════════════════════
  //  RENDER HELPERS
  // ════════════════════════════════════════════════════════════
  const isWorking   = ['uploading', 'queued', 'processing', 'distributing', 'merging'].includes(stage);
  const stageLabel  = {
    idle:         'AWAITING SOURCE',
    uploading:    'UPLOADING TO MVSEP…',
    queued:       `QUEUED${jobInfo?.currentOrder ? ` · #${jobInfo.currentOrder}` : ''}${jobInfo?.queueCount != null ? ` (${jobInfo.queueCount} ahead)` : ''}`,
    processing:   'SEPARATING STEMS…',
    distributing: 'DISTRIBUTING TO GPUs…',
    merging:      'MERGING RESULTS…',
    complete:     'DISTILLATION COMPLETE',
    error:        'ERROR',
  }[stage];

  // Derive which stems to show in the visualisation tubes.
  // If a job is complete we show the actual returned stems; otherwise
  // we fall back to a generic 4-stem preview based on the selected model.
  const previewStems = useMemo(() => {
    if (stems.length > 0) return stems;
    const meta = SEPARATION_TYPES.find(s => s.id === sepType);
    if (!meta) return [];
    if (meta.id === 49 || meta.id === 12) {
      return [
        { name: 'LEAD', url: null, visual: { id: 'lead_vocals', ...STEM_PALETTE.lead_vocals } },
        { name: 'BACK', url: null, visual: { id: 'back_vocals', ...STEM_PALETTE.back_vocals } },
      ];
    }
    return [
      { name: 'VOCALS', url: null, visual: { id: 'vocals',     ...STEM_PALETTE.vocals } },
      { name: 'DRUMS',  url: null, visual: { id: 'drums',      ...STEM_PALETTE.drums } },
      { name: 'BASS',   url: null, visual: { id: 'bass',       ...STEM_PALETTE.bass } },
      { name: 'OTHER',  url: null, visual: { id: 'other',      ...STEM_PALETTE.other } },
    ];
  }, [stems, sepType]);

  // ════════════════════════════════════════════════════════════
  //  JSX
  // ════════════════════════════════════════════════════════════
  return (
    <div id="distillation-matrix"
         className="min-h-screen w-full flex items-center justify-center p-4 font-sans bg-[#050505] selection:bg-purple-500/30">

      <audio ref={audioRef} src={localAudioUrl}
             onEnded={() => { setActivePlay(null); stopVisualizer(); }} />

      {/* ── hidden per-stem <audio> elements ─────────────────── */}
      <div className="hidden">
        {stems.map(s => (
          <audio
            key={s.url}
            ref={el => { if (el) stemAudioRefs.current[s.url] = el; }}
            src={s.url}
            preload="auto"
            onError={() => setError(`Could not load stem: ${s.name}`)}
            onEnded={() => { if (activePlay === s.url) { setActivePlay(null); stopVisualizer(); } }}
          />
        ))}
      </div>

      {/* SVG ASSETS */}
      <svg className="fixed inset-0 pointer-events-none opacity-0 w-0 h-0">
        <filter id="brushed-metal">
          <feTurbulence type="fractalNoise" baseFrequency="0.8 0.1" numOctaves="3" result="noise" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.08 0" />
        </filter>
        <filter id="fine-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.05 0" />
        </filter>
      </svg>

      {/* ──────────────  DEVICE ENCLOSURE  ────────────── */}
      <div className="w-[460px] max-w-full aspect-[2/3.4] bg-[#1a1a20] rounded-[24px] relative flex flex-col items-center justify-start overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(0,0,0,0.5)] border-b-4 border-black">

        <div className="absolute inset-0 pointer-events-none mix-blend-overlay" style={{ filter: 'url(#brushed-metal)' }}></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#2a2a35_0%,#0f0f14_100%)] pointer-events-none opacity-80"></div>

        {/* ── TOP HEADER ─────────────────────────────────────── */}
        <div className="w-full px-6 pt-5 pb-4 flex justify-between items-center z-20 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-purple-500 to-indigo-900 shadow-[0_0_15px_rgba(139,92,246,0.3),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center border border-purple-400/20">
              <Music className="w-5 h-5 text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" />
            </div>
            <h1 className="text-[15px] tracking-[0.25em] font-semibold text-zinc-300 uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
              Distillation<span className="font-light text-zinc-500">Matrix</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(s => !s)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-purple-500/20 bg-gradient-to-b from-[#222] to-[#111] hover:from-[#333] hover:to-[#1a1a1a] text-purple-400 text-[11px] font-medium uppercase tracking-wider transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_2px_5px_rgba(0,0,0,0.5)] z-30">
              <Sliders className="w-3.5 h-3.5" /> Model
              <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={resetLab}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-full border border-purple-500/20 bg-gradient-to-b from-[#222] to-[#111] hover:from-[#333] hover:to-[#1a1a1a] text-purple-400 text-[11px] font-medium uppercase tracking-wider transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_2px_5px_rgba(0,0,0,0.5)] z-30">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>

        {/* ── MODEL PICKER DRAWER ────────────────────────────── */}
        {showSettings && (
          <div className="w-[92%] bg-[#0a0a10]/95 backdrop-blur rounded-xl border border-purple-500/20 mb-2 p-3 z-30 max-h-48 overflow-y-auto shadow-2xl">
            <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <Settings className="w-3 h-3" /> Separation Model
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {SEPARATION_TYPES.map(s => (
                <button key={s.id} onClick={() => { setSepType(s.id); setShowSettings(false); }}
                        className={`flex items-center justify-between text-left px-3 py-2 rounded-lg border transition-all
                          ${sepType === s.id
                            ? 'bg-purple-500/20 border-purple-400/60 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                            : 'bg-[#111] border-zinc-800 hover:border-purple-500/40 hover:bg-[#16161c]'}`}>
                  <div className="flex flex-col">
                    <span className="text-zinc-200 text-[12px] font-medium">{s.name}</span>
                    <span className="text-zinc-500 text-[10px] font-mono">{s.desc}</span>
                  </div>
                  {s.tag && <span className="text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/30">{s.tag}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── RECESSED SCREEN ────────────────────────────────── */}
        <div className="w-[92%] flex-1 mb-2 bg-[#050508] rounded-xl relative shadow-[inset_0_15px_30px_rgba(0,0,0,1),inset_0_0_10px_rgba(0,0,0,1),0_1px_1px_rgba(255,255,255,0.1)] border-t border-black overflow-hidden flex flex-col items-center">

          {/* Glass glare / reflections */}
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute top-[10%] left-[10%] w-32 h-32 bg-slate-700/20 blur-[30px] mix-blend-screen"></div>
            <div className="absolute top-[30%] right-[10%] w-40 h-20 bg-blue-900/10 blur-[20px] mix-blend-screen"></div>
            <div className="absolute bottom-[20%] left-[30%] w-24 h-40 bg-teal-900/10 blur-[25px] mix-blend-screen"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent"></div>
            <div className="absolute inset-0" style={{ filter: 'url(#fine-grain)' }}></div>
          </div>

          {/* ── STATUS DISPLAY ────────────────────────────────── */}
          <div className="w-full px-4 pt-3 z-20 flex flex-col gap-1 items-center text-center">
            <div className={`text-[10px] font-mono tracking-[0.3em] uppercase font-bold
              ${isWorking ? 'text-purple-300 animate-pulse'
                : stage === 'complete' ? 'text-green-400'
                : stage === 'error'   ? 'text-red-400'
                : 'text-zinc-500'}`}>
              {stageLabel}
            </div>
            {file && (
              <div className="text-[9px] text-zinc-600 font-mono truncate max-w-full flex items-center gap-1.5">
                <FileAudio className="w-3 h-3" /> {file.name} · {formatBytes(file.size)}
              </div>
            )}
            {error && (
              <div className="mt-1 text-[10px] text-red-300 font-mono bg-red-900/20 border border-red-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0" /> <span className="truncate">{error}</span>
              </div>
            )}
          </div>

          {/* ── REACTOR KNOB (drop / play original) ───────────── */}
          <div className="mt-4 z-40 relative">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => stage === 'idle' && !file && fileInputRef.current?.click()}
              className={`
                w-28 h-28 rounded-full relative flex items-center justify-center transition-transform duration-500
                ${file ? 'cursor-default' : 'cursor-pointer hover:scale-105'}
                bg-[conic-gradient(from_0deg,#222,#555,#111,#444,#111,#555,#222)]
                shadow-[0_20px_30px_rgba(0,0,0,0.9),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.8)]
                border border-[#111] group
              `}>
              <div className="absolute inset-[8%] rounded-full bg-gradient-to-b from-[#151515] to-[#0a0a0a] shadow-[inset_0_2px_10px_rgba(0,0,0,0.9)] flex items-center justify-center">
                <div className={`absolute inset-[10%] rounded-full border border-purple-500/80 shadow-[0_0_10px_rgba(168,85,247,0.6),inset_0_0_5px_rgba(168,85,247,0.4)]
                  ${isWorking ? 'animate-[spin_4s_linear_infinite]' : ''}
                  ${activePlay === 'main' ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.8)]' : ''}`}></div>
                <div className={`absolute inset-[24%] rounded-full border border-purple-500/50 shadow-[0_0_5px_rgba(168,85,247,0.3)]
                  ${isWorking ? 'animate-[spin_3s_linear_infinite_reverse]' : ''}`}></div>
                <div className={`absolute inset-[38%] rounded-full border border-purple-500/30
                  ${isWorking ? 'animate-[spin_2s_linear_infinite]' : ''}`}></div>

                <div className="absolute inset-[42%] bg-gradient-to-br from-[#444] to-[#111] rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_5px_10px_rgba(0,0,0,0.8)] flex items-center justify-center overflow-hidden border border-[#000]">
                  {stage === 'complete' && file ? (
                    <button onClick={(e) => { e.stopPropagation(); togglePlay('main'); }}
                            className="w-full h-full rounded-full flex items-center justify-center bg-transparent z-50 hover:bg-green-500/10 transition-colors">
                      {activePlay === 'main'
                        ? <Pause className="w-4 h-4 text-green-300" fill="currentColor" />
                        : <Play className="w-4 h-4 text-green-400 ml-0.5" fill="currentColor" />}
                    </button>
                  ) : isWorking ? (
                    <Loader2 className="w-4 h-4 text-purple-300 animate-spin" />
                  ) : stage === 'error' ? (
                    <X className="w-4 h-4 text-red-400" />
                  ) : file ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>
                  )}
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,.wav,.mp3"
                   onChange={handleFileDrop} className="hidden" />
            <input ref={dirInputRef} type="file" accept="audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,.wav,.mp3"
                   onChange={handleDirPick} className="hidden" multiple webkitdirectory="" directory="" />
          </div>

          {/* ── ACTION BUTTONS UNDER KNOB ─────────────────────── */}
          <div className="mt-3 z-40 flex gap-2 flex-wrap justify-center px-3">
            {!file && (
              <>
                <button onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-gradient-to-b from-[#2a2a35] to-[#15151a] border border-purple-500/30 text-zinc-300 hover:text-white hover:border-purple-400 transition-all">
                  <Upload className="w-3 h-3" /> Single File
                </button>
                <button onClick={() => dirInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-gradient-to-b from-[#2a2a35] to-[#15151a] border border-purple-500/30 text-zinc-300 hover:text-white hover:border-purple-400 transition-all">
                  <Folder className="w-3 h-3" /> Browse Local
                </button>
              </>
            )}
            {file && !isWorking && stage !== 'complete' && !tooLarge && (
              <button onClick={startSeparation}
                      className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-4 py-1.5 rounded-full bg-gradient-to-b from-purple-500 to-purple-700 border border-purple-300/40 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:shadow-[0_0_25px_rgba(168,85,247,0.6)] transition-all">
                <ListMusic className="w-3 h-3" /> Start Distillation
              </button>
            )}
            {file && tooLarge && (
              <a href="https://cloudconvert.com/wav-to-mp3" target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-gradient-to-b from-zinc-700 to-zinc-900 border border-zinc-500/40 text-zinc-200 hover:from-zinc-600 hover:to-zinc-800 transition-all">
                <Download className="w-3 h-3" /> Convert to MP3
              </a>
            )}
            {isWorking && (
              <button onClick={() => { setStage('error'); setError('Cancelled by user.'); }}
                      className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-gradient-to-b from-red-900/40 to-red-950/40 border border-red-500/30 text-red-300 hover:from-red-900/60 transition-all">
                <X className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>

          {/* ── CABLES + TEST TUBES ───────────────────────────── */}
          <div className="flex-1 w-full flex flex-col relative px-5 -mt-2">
            <div className="flex-1 w-full relative z-10 pointer-events-none">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full drop-shadow-[0_15px_10px_rgba(0,0,0,0.8)]">
                {previewStems.map((_, i) => {
                  const x = ((i + 0.5) / previewStems.length) * 100;
                  return (
                    <g key={`cable-${i}`}>
                      <path d={`M 50 20 C 50 70, ${x} 20, ${x} 100`} fill="none" stroke="#000" strokeWidth="6" vectorEffect="non-scaling-stroke" />
                      <path d={`M 50 20 C 50 70, ${x} 20, ${x} 100`} fill="none" stroke="#222" strokeWidth="5" vectorEffect="non-scaling-stroke" />
                      <path d={`M 50 20 C 50 70, ${x} 20, ${x} 100`} fill="none" stroke="#333" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                      <path d={`M 50 20 C 50 70, ${x} 20, ${x} 100`} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" transform="translate(-1, -1)" vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="h-[260px] w-full z-20 pb-4 flex items-end gap-1.5"
                 style={{ gridTemplateColumns: `repeat(${previewStems.length}, minmax(0, 1fr))` }}>
              {previewStems.map((stem) => {
                const isReady = !!stem.url;
                const isReacting = activePlay === 'main' || activePlay === stem.url;
                const volKey = stem.visual.id;
                const liveLevel = volumes[volKey] || 0;

                // ── fill height logic ──
                let dynamicHeight = '8%';
                if (isWorking) {
                  // simulate during processing: empty + slow fill
                  dynamicHeight = stage === 'uploading' ? '15%'
                    : stage === 'queued' ? '25%'
                    : stage === 'processing' ? '55%'
                    : stage === 'merging' ? '80%'
                    : '40%';
                } else if (stage === 'complete' && isReady) {
                  if (isReacting) dynamicHeight = `calc(30% + ${liveLevel * 70}%)`;
                  else dynamicHeight = activePlay ? '15%' : '100%';
                } else if (stage === 'complete') {
                  dynamicHeight = '100%';
                }

                return (
                  <div key={stem.visual.id} className="flex-1 flex flex-col items-center justify-end h-full relative group min-w-0">

                    <div className="absolute top-[-22px] text-[9px] font-mono tracking-widest text-zinc-500 font-bold uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] z-30 truncate max-w-full">
                      {stem.visual.name}
                    </div>

                    <div className="w-[12px] h-3 bg-gradient-to-r from-[#3a2805] via-[#d4af6a] to-[#3a2805] rounded-t-sm shadow-[0_2px_5px_rgba(0,0,0,0.8)] border-b border-black/80 z-20 relative">
                      <div className="absolute inset-y-0 left-[30%] w-[20%] bg-white/40"></div>
                    </div>
                    <div className="w-[20px] h-2 bg-gradient-to-r from-[#222] via-[#ccc] to-[#222] rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.9)] border-b border-black z-20 relative">
                      <div className="absolute inset-y-0 left-[30%] w-[15%] bg-white/60"></div>
                    </div>

                    <div className="relative w-full max-w-[40px] flex-1 rounded-full overflow-hidden shadow-[inset_0_0_15px_rgba(0,0,0,1),0_15px_20px_rgba(0,0,0,0.6)] backdrop-blur-[2px] bg-white/[0.01]">
                      <div className="absolute inset-0 rounded-full border border-white/10 shadow-[inset_4px_0_10px_rgba(255,255,255,0.1),inset_-4px_0_10px_rgba(0,0,0,0.8)] pointer-events-none z-40"></div>

                      <div className="absolute left-[15%] top-[10%] bottom-[10%] flex flex-col justify-between py-1 opacity-20 z-30 pointer-events-none">
                        {[...Array(10)].map((_, i) => (
                          <div key={i} className={`h-[1px] bg-white shadow-[0_1px_1px_black] ${i % 2 === 0 ? 'w-3' : 'w-1.5'}`}></div>
                        ))}
                      </div>

                      <div className="absolute bottom-0 left-[3px] right-[3px] rounded-b-full will-change-transform flex flex-col justify-end"
                           style={{
                             height: dynamicHeight,
                             transition: (stage === 'complete' && isReacting) ? 'none' : 'height 800ms cubic-bezier(0.4, 0, 0.2, 1)',
                           }}>
                        <div className="absolute inset-0 z-10"
                             style={{
                               background: `linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(${stem.visual.color}, 0.7) 30%, rgba(${stem.visual.color}, 0.9) 50%, rgba(${stem.visual.color}, 0.5) 80%, rgba(0,0,0,0.8) 100%)`,
                               boxShadow: stage === 'complete' ? `0 0 25px ${stem.visual.shadow}` : '',
                             }}></div>
                        <div className="absolute top-[-4px] left-0 right-0 h-[8px] rounded-full z-20"
                             style={{
                               background: `linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(${stem.visual.color}, 1) 50%, rgba(0,0,0,0.4) 100%)`,
                               boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.6), 0 2px 5px ${stem.visual.shadow}`,
                               transform: isReacting ? `scaleY(${1 + liveLevel * 0.5})` : 'scaleY(1)',
                               transition: isReacting ? 'none' : 'transform 200ms',
                             }}></div>
                        <div className="absolute inset-0 z-30 bubbles-texture opacity-50 mix-blend-screen pointer-events-none"></div>
                      </div>

                      <div className="absolute inset-y-1 left-[15%] w-[25%] bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full pointer-events-none z-50 blur-[0.5px]"></div>
                    </div>

                    <div className="w-[120%] max-w-[48px] h-3.5 bg-gradient-to-r from-[#222] via-[#ddd] to-[#111] rounded-b-xl rounded-t-[2px] shadow-[0_10px_15px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.5)] border-t border-black mt-[-4px] z-10 relative">
                      <div className="absolute inset-y-0 left-[25%] w-[15%] bg-white/50"></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── BOTTOM HARDWARE PANEL — per-stem controls ───────── */}
        <div className="w-[92%] py-3 flex flex-wrap justify-center items-start gap-2 mb-3 px-2">
          {previewStems.map(stem => {
            const isReady = !!stem.url;
            const isActive = activePlay === stem.url;
            return (
              <div key={`ctrl-${stem.visual.id}`} className="flex flex-col items-center w-[64px] gap-1.5">
                <button
                  onClick={() => isReady && togglePlay(stem)}
                  disabled={!isReady}
                  title={isReady ? `Play ${stem.visual.name}` : 'Not ready yet'}
                  className={`
                    w-11 h-11 rounded-full relative flex items-center justify-center group transition-all duration-300
                    ${isReady ? 'cursor-pointer hover:scale-105' : 'opacity-40 grayscale cursor-not-allowed'}
                  `}>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#333] to-[#111] shadow-[0_5px_10px_rgba(0,0,0,0.8)]"></div>
                  <div className={`absolute inset-[3px] rounded-full border-2 transition-all
                    ${isActive
                      ? 'border-purple-300 shadow-[inset_0_0_15px_rgba(147,51,234,0.8),0_0_15px_rgba(147,51,234,0.8)]'
                      : 'border-purple-600 shadow-[inset_0_0_10px_rgba(147,51,234,0.5),0_0_8px_rgba(147,51,234,0.4)] group-hover:border-purple-400'}`}
                    style={isActive ? { boxShadow: `inset 0 0 15px ${stem.visual.shadow}, 0 0 15px ${stem.visual.shadow}` } : {}}></div>
                  <div className="absolute inset-[6px] rounded-full bg-gradient-to-br from-[#15151a] to-[#0a0a0c] shadow-[inset_0_3px_5px_rgba(0,0,0,0.9)] flex items-center justify-center">
                    {isActive
                      ? <Pause className="w-3.5 h-3.5" fill="currentColor" style={{ color: stem.visual.hex, filter: `drop-shadow(0 0 5px ${stem.visual.hex})` }} />
                      : <Play className={`w-3.5 h-3.5 ml-0.5 ${isReady ? 'text-zinc-300 group-hover:text-white' : 'text-zinc-600'}`} fill="currentColor" />}
                  </div>
                </button>
                <a href={stem.url || '#'} download={stem.name || 'stem.mp3'}
                   onClick={(e) => !isReady && e.preventDefault()}
                   className={`text-[9px] font-mono tracking-widest font-bold flex items-center gap-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] transition-colors
                     ${isReady ? 'text-zinc-400 hover:text-white cursor-pointer' : 'text-zinc-700 cursor-not-allowed'}`}>
                  <Download className="w-3 h-3" /> .MP3
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── LOCAL FILE PICKER MODAL ─────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
             onClick={() => setPickerOpen(false)}>
          <div className="bg-[#0f0f14] border border-purple-500/30 rounded-2xl p-5 max-w-lg w-full max-h-[70vh] overflow-y-auto shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-zinc-200 text-sm font-mono uppercase tracking-widest flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-400" /> Local Audio Files
              </h2>
              <button onClick={() => setPickerOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {localFiles.length === 0 ? (
              <div className="text-zinc-500 text-xs font-mono py-8 text-center">No .wav or .mp3 files found in that folder.</div>
            ) : (
              <div className="space-y-1">
                {localFiles.map(({ file: f, size, url }) => (
                  <button key={f.name + size}
                          onClick={() => { acceptFile(f); setPickerOpen(false); }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#16161c] border border-zinc-800 hover:border-purple-500/50 hover:bg-[#1c1c25] transition-colors text-left">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileAudio className="w-4 h-4 text-purple-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-zinc-200 text-xs truncate">{f.name}</div>
                        <div className="text-zinc-500 text-[10px] font-mono">{f.type || 'audio'} · {formatBytes(size)}</div>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-zinc-600" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        svg path { vector-effect: non-scaling-stroke; }
        .bubbles-texture {
          background-image:
            radial-gradient(circle at 35% 10px,  rgba(255,255,255,0.9) 1.5px, transparent 2px),
            radial-gradient(circle at 65% 40px,  rgba(255,255,255,0.7) 1px,   transparent 1.5px),
            radial-gradient(circle at 45% 70px,  rgba(255,255,255,0.8) 1.5px, transparent 2px),
            radial-gradient(circle at 55% 100px, rgba(255,255,255,0.9) 2px,   transparent 2.5px),
            radial-gradient(circle at 30% 130px, rgba(255,255,255,0.6) 1px,   transparent 1.5px);
          background-size: 100% 150px;
          animation: bubbles-rise 3s infinite linear;
        }
        @keyframes bubbles-rise {
          0%   { background-position: 0 150px; }
          100% { background-position: 0 0px; }
        }
        /* Custom scrollbar inside the model drawer */
        .overflow-y-auto::-webkit-scrollbar { width: 4px; }
        .overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
        .overflow-y-auto::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.4); border-radius: 2px; }
      `}} />
    </div>
  );
}
