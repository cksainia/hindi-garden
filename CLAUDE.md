# Huntrix Aria · Hindi Slayer — project guide

A single-file, offline-capable PWA that teaches conversational Hindi to a pre-teen
girl (Aria). Speaking/understanding-first, fun, positive-only (no guilt mechanics),
KPop-Demon-Hunters-inspired neon theme. Hosted free on GitHub Pages with optional
cross-device sync via a Cloudflare Worker.

## Live / hosting
- **Live URL:** https://cksainia.github.io/hindi-garden/
- **Repo:** github.com/cksainia/hindi-garden (GitHub Pages, deploys from `main`)
- **Deploy = `git push`.** Pages rebuilds automatically. CDN propagation can take
  1–5 minutes; verify with a cache-busting query (see "Verify a deploy" below).

## Architecture
Vanilla HTML/CSS/JS. **No build step, no framework, no bundler.** Edit files directly.

| File | Purpose |
|---|---|
| `index.html` | The entire app — markup, CSS, and all JS in one file |
| `data.js` | All content. Defines `window.UNITS`, `CONVOS`, `GRAMMAR`, `GAMES`, `CULTURE`, `CULTURE_THEMES`, `STORIES`, `LEVEL2`. Loaded before the app script. |
| `sw.js` | Service worker. Network-first with `{cache:"no-store"}`; falls back to cache offline |
| `manifest.webmanifest` | PWA manifest (name, icons, theme color) |
| `icon-192.png` `icon-512.png` `icon-180.png` | App icons (neon theme) |

## CRITICAL rules (read before editing)
1. **Bump the service-worker cache version on EVERY change.** In `sw.js`:
   `const CACHE="hindi-garden-vNN";` — increment `NN` or users keep the stale cached
   copy and your change won't appear. (Current: **v39**.)
2. **Never change the localStorage state key** `ariaHindiGarden_v1` (constant `SAVE_KEY`
   in `index.html`). It holds all of Aria's progress. `loadState()` does careful,
   additive migration — preserve that pattern; never wipe or rename fields.
3. **Avatar is device-local.** Stored under `ariaAvatar`, intentionally NOT synced
   (it's a real child's photo; the repo is public). Keep it out of sync/state.
4. **Feminine Hindi verb forms** — Aria is a girl. New conversational/grammar content
   must use feminine conjugations (e.g. "main khush hoon" forms, "karti/gayi").
5. **Positive-only UX.** No stre-loss guilt, no punishing red X spirals. Wins, gentle
   win-back, encouragement.

## Content model (`data.js`)
- A vocabulary word: `{ hi, ro, en, ic }` — Devanagari, romanization, English, emoji/icon.
- Level-2 words carry `lv:2` and live in `LEVEL2[topicId]` (25 per topic). They're
  attached at load via `UNITS.forEach(u=>{u.words2 = LEVEL2[u.id]||[]})`.
- 20 topics. Level 1 ≈ 518 words; Level 2 = 500 words.
- **Level-2 unlock gating:** a topic's L2 unlocks once all its L1 words are mastered
  (`level2Unlocked(unit)` in `index.html`). Convos/stories/grammar unlock L2 per-section.
- `CONVOS`, `STORIES`, `GRAMMAR`, `GAMES`, `CULTURE` (themed via `CULTURE_THEMES`).
- Watch for **Devanagari pitfalls** when editing literals programmatically: nukta and
  combining marks can make two visually-identical strings differ byte-wise. Match on the
  `ro` (romanization) field when filtering/deduping, not on `hi`.

## App structure (`index.html`)
- **Screen model:** `show(screen)` toggles `welcomeScreen` / `homeScreen` / `catScreen`
  / `menuScreen` / `actScreen` / `parentScreen`. `goHome()` returns to the hub.
- Welcome hero → home hub (progress panel + 8 choice tiles) → category → unit → activity.
- State shape (in `loadState()`): `done, log, seen, mastered, missed, wordLevel, seenDate,
  srs, quizzes, gameMiss, pathDone, achievements, cultureSeen, stars, speed, scriptMode`.
- **Spaced repetition:** `state.srs` per word, `SRS_STEPS=[1,3,7,16,35]`.
- **Levels:** `STARS_PER_LEVEL=12`; `levelInfo()` derives level/name/badge from stars.
- **Skills:** `skillScores()` returns 8 derived 0–100 scores for the parent dashboard.
- `speakSlow()` = the turtle button — 1/10th of normal TTS rate (`base*0.1`, floored 0.1).

## Cross-device sync + tracker feed
- `index.html` syncs state to a **Cloudflare Worker**:
  `SYNC_URL = "https://hindi-hop-sync.chitresh.workers.dev/"`, keyed by a per-user
  `code` (KV store). `syncPull()` merges remote→local; `syncPush()` (debounced via
  `syncPushSoon()`) writes on save.
- `buildSummary()` produces a compact, read-only progress snapshot; `syncPushSummary()`
  POSTs it under `<code>-sum`. An external summer-tracker app reads that key. Keep the
  summary field names stable — they're a contract. (See `hindi-sync-handoff.md`.)
- The Worker already returns `Access-Control-Allow-Origin: *` (cross-origin reads work).

## Verify before you push
There is now a committed smoke test (`test/smoke.js`). Just run:
```bash
npm install --no-save jsdom   # once (or `npm i`)
npm test                      # asserts 0 boot errors, word/story counts, L2 lowercase,
                              # quiz-shuffle behavior, and the buildSummary() contract
```
GitHub Actions runs this on every push/PR (`.github/workflows/deploy.yml`). The same
file can also gate Pages deploys on the test (see its header comment to activate).

The original ad-hoc jsdom recipe, for reference:
```bash
npm i jsdom            # once
```
```js
// smoke.js — load data.js + index.html headlessly, assert no errors and sane counts
const fs=require("fs"); const {JSDOM}=require("jsdom");
const html=fs.readFileSync("index.html","utf8");
const data=fs.readFileSync("data.js","utf8");
const injected=html.replace('<script src="data.js"></script>','<script>'+data+'</script>');
const dom=new JSDOM(injected,{runScripts:"dangerously",pretendToBeVisual:true,url:"https://x.test/"});
setTimeout(()=>{ const w=dom.window;
  let l1=0; w.UNITS.forEach(u=>l1+=u.words.length);
  console.log("L1 words:", l1, "| topics:", w.UNITS.length);
  // add assertions: no empty topics, buildSummary() runs, etc.
  process.exit(0);
}, 1500);
```
Also do a quick visual check: `python3 -m http.server 8080` then open
`http://localhost:8080/` (note: service worker caching can mask edits locally — hard-reload
or use a fresh private window).

## Verify a deploy is live
```bash
curl -s "https://cksainia.github.io/hindi-garden/sw.js?cb=$(date +%s)" | head -1   # expect new vNN
```

## Standard change checklist
1. Edit `index.html` and/or `data.js`.
2. If you changed app code or content, **bump `CACHE` in `sw.js`**.
3. Run the jsdom smoke test (0 errors, sane counts, `buildSummary()` works).
4. `git add -A && git commit -m "..." && git push`.
5. Wait for Pages, confirm the new `vNN` is live, then hard-reload the app.
