// Headless smoke test for Hindi Garden — loads data.js + index.html in jsdom and
// asserts no boot errors plus content/contract invariants. Run with: npm test
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const data = fs.readFileSync(path.join(root, "data.js"), "utf8");
const injected = html.replace('<script src="data.js"></script>', "<script>" + data + "</script>");

const dom = new JSDOM(injected, { runScripts: "dangerously", pretendToBeVisual: true, url: "https://x.test/" });
const w = dom.window;
// jsdom has no speech APIs; stub so they don't mask real errors
w.speechSynthesis = w.speechSynthesis || { speak() {}, cancel() {}, getVoices() { return []; } };
w.SpeechSynthesisUtterance = w.SpeechSynthesisUtterance || function () { return {}; };

const bootErrors = [];
w.addEventListener("error", (e) => bootErrors.push(String((e.error && e.error.stack) || e.message)));

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? " — " + detail : "")); };

setTimeout(() => {
  const { UNITS, LEVEL2, STORIES, CONVOS, GRAMMAR, GAMES, CULTURE } = w;

  check("boot has no errors", bootErrors.length === 0, bootErrors.join("\n"));

  // --- Vocab ---
  let l1 = 0, l2 = 0, missing = 0;
  UNITS.forEach((u) => {
    (u.words || []).forEach((wd) => { l1++; if (!wd.hi || !wd.ro || !wd.en || !wd.ic) missing++; });
    (u.words2 || []).forEach((wd) => { l2++; if (!wd.hi || !wd.ro || !wd.en || !wd.ic) missing++; });
  });
  check("20 topics", UNITS.length === 20, "got " + UNITS.length);
  check("518 Level-1 words", l1 === 518, "got " + l1);
  check("500 Level-2 words", l2 === 500, "got " + l2);
  check("no vocab fields missing", missing === 0, missing + " missing");

  // --- Level-2 romanization is all lowercase ---
  const capsRo = [];
  Object.keys(LEVEL2 || {}).forEach((topic) => (LEVEL2[topic] || []).forEach((wd) => {
    if (wd.ro && wd.ro !== wd.ro.toLowerCase()) capsRo.push(topic + ":" + wd.ro);
  }));
  check("Level-2 romanization all lowercase", capsRo.length === 0, capsRo.slice(0, 8).join(", "));

  // --- Stories ---
  const l1s = STORIES.filter((s) => (s.lv || 1) === 1);
  const l2s = STORIES.filter((s) => (s.lv || 1) === 2);
  check("30 Level-1 stories", l1s.length === 30, "got " + l1s.length);
  check("30 Level-2 stories", l2s.length === 30, "got " + l2s.length);
  const ids = STORIES.map((s) => s.id);
  check("story ids unique", new Set(ids).size === ids.length);
  let badStory = 0;
  STORIES.forEach((s) => {
    if (!s.id || !s.title || !Array.isArray(s.lines) || !s.lines.length) badStory++;
    s.lines.forEach((ln) => { if (!ln.hi || !ln.ro || !ln.en || !ln.ic) badStory++; });
    const q = s.question;
    if (!q || !q.q || !Array.isArray(q.opts) || q.opts.length !== 4 || typeof q.ans !== "number" || q.ans < 0 || q.ans > 3) badStory++;
  });
  check("all stories structurally valid", badStory === 0, badStory + " problems");

  // --- Story quiz answer positions are shuffled at render (read the real DOM) ---
  if (typeof w.startStoryQuestion === "function") {
    const story = STORIES.find((s) => s.question && s.question.opts.length === 4) || STORIES[0];
    const n = story.question.opts.length;
    const menu = w.document.getElementById("menuScreen");
    const firstPositions = new Set();
    let everyRenderIsPermutation = true;
    for (let run = 0; run < 30; run++) {
      w.startStoryQuestion(story.id);
      const idx = [...menu.querySelectorAll("button")]
        .map((b) => (b.getAttribute("onclick") || "").match(/answerStory\((\d+)\)/))
        .filter(Boolean).map((mm) => Number(mm[1]));
      const isPerm = idx.length === n && new Set(idx).size === n && idx.every((v) => v >= 0 && v < n);
      if (!isPerm) everyRenderIsPermutation = false;
      firstPositions.add(idx.indexOf(0)); // where the correct answer (orig index 0) landed
    }
    check("every story render lists a full permutation of options", everyRenderIsPermutation);
    check("correct answer is not always in the same position", firstPositions.size > 1,
      "answer landed in positions: " + [...firstPositions].join(","));
  }

  // --- Other content present ---
  check("conversations present", CONVOS.length > 0);
  check("grammar lessons present", GRAMMAR.length > 0);
  check("games present", GAMES.length > 0);
  check("culture notes present", CULTURE.length > 0);

  // --- Free/Plus paywall: Level 2 is gated until unlocked ---
  if (typeof w.isPlus === "function" && typeof w.openUnit === "function") {
    check("free tier starts without Plus", w.isPlus() === false);
    const u = w.UNITS[0];
    w.openUnit(u.id); // free user opening a topic
    const topicHtml = w.document.getElementById("menuScreen").innerHTML;
    check("free user: Level 2 tab routes to upsell (not L2 content)",
      /showPlusUpsell\(\)/.test(topicHtml) && !/openUnit\([^)]*,2\)/.test(topicHtml));
    w.openCategory("stories", 2); // try to force L2 stories as a free user
    check("free user: forcing category L2 still shows upsell",
      /showPlusUpsell\(\)/.test(w.document.getElementById("catScreen").innerHTML));
    if (typeof w.confirmUnlock === "function") {
      w.confirmUnlock(); // should open a parental gate, NOT unlock immediately
      check("unlock is behind a parental gate (not granted on tap)",
        w.isPlus() === false && /×/.test(w.document.body.textContent));
    }
    if (typeof w.unlockPlus === "function") {
      w.unlockPlus();
      const saved = JSON.parse(w.localStorage.getItem("ariaHindiGarden_v1") || "{}");
      check("unlockPlus persists entitlement + date", saved.plus === true && /^\d{4}-\d\d-\d\d$/.test(saved.plusSince || ""));
    }
  }

  // --- Grammar games show English-script transliteration, not Devanagari-only ---
  if (typeof w.startGame === "function") {
    w.startGame("combo");
    check("grammar games render a romanization helper (.wro)",
      /class="wro"/.test(w.document.getElementById("menuScreen").innerHTML));
  }
  if (typeof w.roma === "function") {
    check("roma() transliterates Devanagari to latin", /^[a-z ]+$/i.test(w.roma("मैं सेब खाती हूँ")));
  }

  // --- External tracker contract ---
  check("buildSummary() runs", typeof w.buildSummary === "function" && !!w.buildSummary());

  if (failures.length) {
    console.error("❌ SMOKE TEST FAILED (" + failures.length + "):");
    failures.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log("✅ Smoke test passed: " + l1 + " L1 + " + l2 + " L2 words, " +
    l1s.length + "+" + l2s.length + " stories, 0 boot errors, contracts intact.");
  process.exit(0);
}, 2000);
