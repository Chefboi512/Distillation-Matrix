<div align="center">

# 🧪 DistillationMatrix

**A photoreal "lab" UI for splitting songs into isolated stems (vocals, drums, bass, …) via the [MVSEP](https://mvsep.com/) API.**

Drop a `.wav` or `.mp3` → pick a model → watch the tubes fill → preview & download every stem as WAV.

[Features](#-features) · [Quick start](#-quick-start) · [Cloudflare Pages deploy](#-cloudflare-pages-deploy) · [How it works](#-how-it-works) · [Models](#-models) · [License](#-license)

</div>

---

## ✨ Features

- 🎚️ **22 curated separation models** — Demucs4 HT, BS Roformer, MelBand Roformer, Ensemble 5/7-stem, Karaoke (lead/back vocals), DrumSep (kick / snare / cymbals / toms / hi-hat / crash), individual instrument extractors (bass, piano, guitar, …), and FX (de-reverb, de-noise, speech/music/effects).
- 🔬 **Photoreal distillation-lab UI** — brass-capped test tubes, brushed-metal chassis, animated bubbles, real-time Web Audio spectrum visualizer that drives the liquid levels per stem.
- 🎵 **Per-stem preview** — play the original mix or any returned stem independently; the visualizer keys to whichever is playing.
- 📂 **Local file browser** — drop a single file, or pick a folder and the app filters it to proper `audio/wav` / `audio/mpeg` MIME so you only see `.wav` and `.mp3`.
- ⬇️ **One-click WAV download** for every stem (16-bit uncompressed).
- 🔁 **Live job tracking** — `queued (#N, M ahead) → processing → distributing → merging → done`, with a cancel button.
- ☁️ **Cloudflare Pages ready** — same-origin proxy via Pages Functions holds the MVSEP API key. No exposed secrets, no CORS, no third-party proxy.

## 🚀 Quick start (local dev)

```bash
git clone https://github.com/Chefboi512/Distillation-Matrix.git
cd Distillation-Matrix
npm install
cp .env.example .env
# → edit .env and set MVSEP_API_KEY
npm run dev
```

Then open http://localhost:5173.

- The Vite dev server (`5173`) serves the React app and **proxies** `/api/mvsep/*` to…
- …the Express dev proxy (`8787`) which holds the MVSEP key from `process.env.MVSEP_API_KEY`.
- Both run in one terminal via `concurrently`.

## ☁️ Cloudflare Pages deploy

1. **Push to GitHub** (already done if you cloned this repo).
2. Go to https://dash.cloudflare.com → **Pages** → **Create a project** → **Connect to Git** → pick `Chefboi512/Distillation-Matrix`.
3. Use the auto-detected settings, or set:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** *(leave blank)*
4. **Add the environment variable** (CRITICAL — this is the API key):
   - **Pages** → your project → **Settings** → **Environment variables**
   - Add `MVSEP_API_KEY` = your key (mark as **encrypted**)
   - Apply to **Production** (and optionally **Preview**)
5. Click **Save and Deploy**. Cloudflare will:
   - Run `npm run build`
   - Deploy the `dist/` static bundle
   - Deploy `functions/api/mvsep/[[path]].js` as a Pages Function
6. Your site is live at `https://<project-name>.pages.dev`. Drop a file, pick a model, get stems.

> **Free tier limits:** Cloudflare Workers on the free plan cap request bodies at **10 MB** (100 MB on paid). A 3-5 min song at 320 kbps MP3 is well under that. WAV files are bigger — bump to paid if you need >10 min WAVs.

## 🧩 How it works

```
                        SAME ORIGIN (your-pages.dev)
   ┌──────────────────┐    POST /api/mvsep/create    ┌──────────────────┐
   │   React UI       │  ─────────────────────────► │ Cloudflare       │
   │  (Vite / dist)   │                             │ Pages Function   │
   │                  │  ◄─── {hash, link} ───────── │                  │
   │                  │  GET  /api/mvsep/get?hash=…  │   owns           │
   │                  │  ─────────────────────────► │   MVSEP_API_KEY  │
   │                  │  ◄─── {status, files:[…]} ── │                  │
   │   <audio>        │  GET  /api/mvsep/audio?url=… │  adds CORS so    │
   │   element        │  ─────────────────────────► │  Web Audio API   │
   │                  │  ◄─── stream with CORS ───── │  can read stems  │
   └──────────────────┘                             └────────┬─────────┘
                                                              │
                                              POST / GET     │
                                                              ▼
                                                    ┌──────────────────┐
                                                    │  MVSEP API       │
                                                    │  mvsep.com       │
                                                    └──────────────────┘
```

**Why the `/api/mvsep/audio` hop?** MVSEP's storage URLs don't send CORS headers, so the browser's Web Audio analyser (`createMediaElementSource`) would refuse to read frequency data from a cross-origin audio element. The Pages Function streams the file with permissive CORS headers — same-origin, no cross-origin taint.

## 🗂 Project layout

```
src/
  App.jsx                 the entire UI / state machine / Web Audio engine
  main.jsx                React 18 root
  index.css               Tailwind directives
functions/
  api/mvsep/[[path]].js   Cloudflare Pages Function (create / get / audio)
proxy-server.js           Express dev proxy (mirror of the Pages Function)
index.html                Vite entry
vite.config.js            dev server + /api/mvsep → :8787 proxy
tailwind.config.js
postcss.config.js
```

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

## 🔐 Environment variables

| Variable          | Where set                  | Used by                              |
|-------------------|----------------------------|--------------------------------------|
| `MVSEP_API_KEY`   | Cloudflare Pages dashboard | `functions/api/mvsep/[[path]].js`    |
| `MVSEP_API_KEY`   | `.env` (local dev only)    | `proxy-server.js`                    |

**Never commit your key.** The `.gitignore` already excludes `.env` and `.env.*`.

> If you've previously shipped a build that contained the key in source, **rotate the key** at https://mvsep.com/ before deploying this version.

## 📦 Tech

- **React 18** + **Vite 5** + **Tailwind 3**
- **lucide-react** for icons
- **Web Audio API** (AnalyserNode + MediaElementSource) for the live spectrum
- **Cloudflare Pages Functions** for the prod proxy (V8 isolates, free tier eligible)
- **Express + Multer** for the local dev proxy
- No backend database, no auth, no telemetry — audio only flows between the browser and MVSEP.

## 🤝 Contributing

PRs welcome. Keep the photoreal vibe — if you add a new model, add it to `SEPARATION_TYPES` in `src/App.jsx` with a short `desc` and an optional `tag`.

## 📄 License

[MIT](./LICENSE)
