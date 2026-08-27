<div align="center">

# 🧪 DistillationMatrix

**A photoreal "lab" UI for splitting songs into isolated stems (vocals, drums, bass, …) via the [MVSEP](https://mvsep.com/) API.**

Drop a `.wav` or `.mp3` → pick a model → watch the tubes fill → preview & download every stem as WAV.

[Features](#-features) · [Quick start](#-quick-start) · [How it works](#-how-it-works) · [Models](#-models) · [License](#-license)

</div>

---

## ✨ Features

- 🎚️ **22 curated separation models** — Demucs4 HT, BS Roformer, MelBand Roformer, Ensemble 5/7-stem, Karaoke (lead/back vocals), DrumSep (kick / snare / cymbals / toms / hi-hat / crash), individual instrument extractors (bass, piano, guitar, …), and FX (de-reverb, de-noise, speech/music/effects).
- 🔬 **Photoreal distillation-lab UI** — brass-capped test tubes, brushed-metal chassis, animated bubbles, real-time Web Audio spectrum visualizer that drives the liquid levels per stem.
- 🎵 **Per-stem preview** — play the original mix or any returned stem independently; the visualizer keys to whichever is playing.
- 📂 **Local file browser** — drop a single file, or pick a folder and the app filters it to proper `audio/wav` / `audio/mpeg` MIME so you only see `.wav` and `.mp3`.
- ⬇️ **One-click WAV download** for every stem (16-bit uncompressed).
- 🔁 **Live job tracking** — `queued (#N, M ahead) → processing → distributing → merging → done`, with a cancel button.
- 🛡️ **Built-in CORS proxy** — MVSEP doesn't ship CORS headers, so a tiny Express proxy is included and `npm run dev` runs both the proxy and the Vite dev server together.

## 🚀 Quick start

```bash
# 1. Clone & install
git clone https://github.com/<you>/distillation-matrix.git
cd distillation-matrix
npm install

# 2. (Optional) set your MVSEP API key
cp .env.example .env
# → edit .env and paste your key from https://mvsep.com/

# 3. Run dev (Vite + proxy, side by side)
npm run dev
```

Then open http://localhost:5173 — drop an audio file, pick a model, hit **Start Distillation**.

### Production build

```bash
npm run build       # bundles src/ into dist/
npm run preview     # serve the built bundle locally
```

The proxy (`proxy-server.js`) is for local dev only. For production, set up your own server-side route to MVSEP and ship the key as an env var (never commit it).

## 🧩 How it works

```
┌──────────────┐  multipart POST   ┌──────────────┐  POST /create  ┌────────┐
│  React UI    │ ────────────────► │  Local proxy │ ─────────────► │ MVSEP  │
│  (Vite)      │                   │  (Express)   │ ◄──── {hash} ── │  API   │
│              │                   └──────┬───────┘                 └────┬───┘
│              │ ◄───── JSON ─────────────┘                             │
│              │   every 5s: GET /get?hash=… ─────────────────────────► │
│              │ ◄─── {status: processing|done|…, files:[…]} ───────────┘
└──────────────┘
```

- `src/App.jsx` — the entire UI / state machine / Web Audio engine
- `proxy-server.js` — the CORS-busting proxy
- `vite.config.js`, `tailwind.config.js` — build / styling config
- `index.html` — Vite entry

## 🎛️ Models

| Tag      | Models                                                          |
|----------|-----------------------------------------------------------------|
| `POPULAR`| Demucs4 HT (4-stem, fast + clean)                               |
| `BEST`   | Ensemble 5-stem (top SDR ensemble)                              |
| `PRO`    | Ensemble All-In (7 stems), BS Roformer SW (6 stems)             |
| `TOP`    | BS Roformer, MelBand Roformer                                   |
| `NEW`    | BS PolarFormer                                                  |
| `FX`     | Reverb Removal, DeNoise, BandIt Plus (speech/music/effects)     |
| _default_| MDX23C, SCNet, Ensemble 2-stem, Karaoke (lead/back), DrumSep, individual instrument extractors |

Full MVSEP catalogue: https://mvsep.com/ — the model IDs in `src/App.jsx` map 1:1.

## 🔐 Environment

| Variable          | Required | Where                                |
|-------------------|----------|--------------------------------------|
| `VITE_MVSEP_KEY`  | yes      | `.env` (see `.env.example`)          |
| `PORT` (proxy)    | no       | defaults to `8787` in `proxy-server.js` |

## 📦 Tech

- **React 18** + **Vite 5** + **Tailwind 3**
- **lucide-react** for icons
- **Web Audio API** (AnalyserNode + MediaElementSource) for the live spectrum
- **Express + Multer** for the dev proxy
- No backend database, no auth, no telemetry — your audio never leaves the page beyond the MVSEP upload.

## 🤝 Contributing

PRs welcome. Keep the photoreal vibe — if you add a new model, add it to `SEPARATION_TYPES` in `src/App.jsx` with a short `desc` and an optional `tag`.

## 📄 License

[MIT](./LICENSE)
