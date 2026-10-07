# Batch 1 — Print Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add print settings (paper Letter/A4, gap, bleed, cut-line styles), a single layout calculator that drives screen + print + PDF, double-sided printing with card backs, and PDF export — while today's default prints stay pixel-identical.

**Architecture:** `computeLayout(settings)` returns every box and cut mark in inches. Pages are drawn by absolutely positioning cells/marks from that result (replacing the CSS grid); back pages mirror it; the PDF builder (vendored jsPDF) draws from the same result. Print settings live in the existing `mtgTuning` storage and the Advanced dialog.

**Tech Stack:** Single file `MTG Proxy Maker.html` (vanilla JS/CSS), `service-worker.js`, new static assets `card-back.jpg` and `vendor/jspdf.umd.min.js` (jsPDF 4.2.1, MIT). Tests: in-page JS suites + a headless-Chrome real-print harness (Node 22) + PyMuPDF checks.

**Spec:** `docs/superpowers/specs/2026-10-06-print-pipeline-and-deck-tools-design.md` (Part 1 and section 0).

---

## Conventions for every task

- **Branch:** create `feat/print-pipeline` from the design branch before Task 1 (`git switch -c feat/print-pipeline design/print-pipeline-and-deck-tools`), so the spec and this plan ship with the code.
- **App file:** `D:\Claude Projects\MTG Proxy Maker\MTG Proxy Maker.html`. Locate code by the quoted text; line numbers drift.
- **Edit gotcha:** the Edit/Write tools turn `\uXXXX` escapes into literal characters. Nothing here needs `\u` escapes. Prefer the Edit tool; a python heredoc has hung before.
- **Line endings:** keep each file's existing endings; ignore git's "LF will be replaced by CRLF" warnings.
- **Local server:** `mcp__Claude_Browser__preview_start` with `name: "proxy-maker"` (port 8765). Always use `http://127.0.0.1:8765/...` — an unrelated server shadows `localhost:8765`.
- **In-page test suites** live in `.claude/tests/` (git-excluded). Run one with `mcp__Claude_Browser__navigate` to `http://127.0.0.1:8765/MTG%20Proxy%20Maker.html`, then `mcp__Claude_Browser__javascript_tool`:
  ```js
  await new Promise(r => setTimeout(r, 1000));
  await eval(await (await fetch('/.claude/tests/<FILE>.js', { cache: 'no-store' })).text())
  ```
- **Regression suites** (must stay green after every task): `tests-parse.js`, `tests-fetch.js`, `tests-ratelimit.js`, `tests-remaining.js`, `tests-placement-core.js`, `tests-placement-anchors.js`, `tests-duplicate.js`, `tests-remove-gaps.js` (102 checks). Runner:
  ```js
  await new Promise(r => setTimeout(r, 1000));
  const out = []; let total = 0, passed = 0;
  for (const f of ['tests-parse.js','tests-fetch.js','tests-ratelimit.js','tests-remaining.js','tests-placement-core.js','tests-placement-anchors.js','tests-duplicate.js','tests-remove-gaps.js']){
    const r = await eval(await (await fetch('/.claude/tests/' + f, { cache: 'no-store' })).text());
    const lines = String(r).split('\n').filter(l => /^(PASS|FAIL)/.test(l)); const p = lines.filter(l => l.startsWith('PASS')).length; total += lines.length; passed += p;
    if (p !== lines.length) out.push(f + ':\n  ' + String(r).split('\n').filter(l => !l.startsWith('PASS')).join('\n  '));
  }
  window.confirm = () => true; clearAllPages(true);
  passed + '/' + total + ' pass' + (out.length ? '\n' + out.join('\n') : '')
  ```
- **Real-print gate (section 0 of the spec)** — run from `D:\Claude Projects\MTG Proxy Maker` with the Bash tool:
  ```bash
  node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out
  .claude/tests/.venv/Scripts/python .claude/tests/compare-prints.py .claude/tests/print-baseline .claude/tests/print-out
  ```
  Expected: every line `PASS … 0 pixels differ` (or within tolerance) and exit code 0. The baseline in `.claude/tests/print-baseline/` was captured from `main` at `d3348fd` and must never be regenerated. Delete `.claude/tests/print-out` afterwards.
- **Commits:** one per task (plus review-fix commits). Message trailer: `Co-Authored-By: <your model attribution>`. Never push.

---

### Task 1: Checkboxes become toggle switches

**Files:**
- Create: `.claude/tests/tests-toggles.js`
- Modify: `MTG Proxy Maker.html` — the CSS rule starting `select, input[type="checkbox"], input[type="text"]` (~line 49) and the dark-theme rule list containing `:root[data-theme="dark"] input[type="checkbox"],` (~line 398)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-toggles.js`:

```js
// Every checkbox renders as a toggle switch but stays a real checkbox.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const cs = getComputedStyle(toggleGuides);
  ok('native look removed', cs.appearance === 'none' || cs.webkitAppearance === 'none', cs.appearance);
  ok('switch size 34x20', cs.width === '34px' && cs.height === '20px', cs.width + 'x' + cs.height);
  ok('rounded pill', parseFloat(cs.borderTopLeftRadius) >= 10, cs.borderTopLeftRadius);
  const before = toggleCutMarks.checked;
  toggleCutMarks.click();
  ok('click still toggles and fires change', toggleCutMarks.checked === !before && document.body.classList.contains('show-cuts') === toggleCutMarks.checked, String(toggleCutMarks.checked));
  toggleCutMarks.click();
  const on = getComputedStyle(toggleGuides).backgroundColor, prev = toggleGuides.checked;
  toggleGuides.checked = !prev;
  const off = getComputedStyle(toggleGuides).backgroundColor;
  toggleGuides.checked = prev;
  ok('checked and unchecked look different', on !== off, on + ' / ' + off);
  ensureDeckModal();
  ok('decklist switches styled too', getComputedStyle(document.getElementById('ignoreBasicsChk')).width === '34px', '');
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** on "native look removed" and "switch size".

- [ ] **Step 3: Implement.** In the rule `select, input[type="checkbox"], input[type="text"], textarea, input[type="number"] { … }` remove `input[type="checkbox"], ` so it reads `select, input[type="text"], textarea, input[type="number"] { … }`. In the dark-theme list remove the line `    :root[data-theme="dark"] input[type="checkbox"],`. Then add, immediately after the `select, input[type="text"], …` rule:

```css
    /* Checkboxes render as toggle switches; they stay real checkboxes for keyboard and screen readers. */
    input[type="checkbox"]{
      -webkit-appearance: none; appearance: none; box-sizing: border-box; margin: 0; flex: none;
      width: 34px; height: 20px; border-radius: 999px; position: relative; cursor: pointer; vertical-align: middle;
      background: #d1d5db; border: 1px solid #9ca3af; transition: background .15s ease, border-color .15s ease;
    }
    input[type="checkbox"]::before{
      content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease;
    }
    input[type="checkbox"]:checked{ background: #2563eb; border-color: #1d4ed8; }
    input[type="checkbox"]:checked::before{ transform: translateX(14px); }
    input[type="checkbox"]:disabled{ opacity: .5; cursor: default; }
    :root[data-theme="dark"] input[type="checkbox"]{ background: #334155; border-color: #475569; }
    :root[data-theme="dark"] input[type="checkbox"]:checked{ background: #3b82f6; border-color: #2563eb; }
```

- [ ] **Step 4: Run `tests-toggles.js` — expect all PASS (6).** Run the regression suites (102 PASS) and the real-print gate (PASS, exit 0). Take a screenshot of the controls bar to confirm the switches look right in light mode.

- [ ] **Step 5: Commit** — `git add "MTG Proxy Maker.html"` and commit `feat: checkboxes become toggle switches`.

---

### Task 2: Print settings model

**Files:**
- Create: `.claude/tests/tests-print-settings.js`
- Modify: `MTG Proxy Maker.html` — add a settings block right after the function `readCssInches(){ … }` (~line 1373–1390); call it from `loadTuning` and `init`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-print-settings.js`:

```js
// Print settings: defaults, validation, region default for new visitors, Letter for returning users.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const keep = { t: localStorage.getItem('mtgTuning'), p: localStorage.getItem('mtgProxyPages') };
  const langs = Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages');
  const setLangs = (arr) => Object.defineProperty(navigator, 'languages', { value: arr, configurable: true });
  try {
    await run('defaults and validation', async () => {
      localStorage.setItem('mtgTuning', JSON.stringify({ topIn: 0.25, paper: 'a4', gapMm: 7, bleedMm: 2, cutStyle: 'bogus', duplex: 'yes', backOffsetXIn: 0.03 }));
      const s = loadPrintSettings();
      ok('saved paper kept', s.paper === 'a4', s.paper);
      ok('invalid gap -> 0', s.gapMm === 0, s.gapMm);
      ok('valid bleed kept', s.bleedMm === 2, s.bleedMm);
      ok('invalid cut style -> ticks', s.cutStyle === 'ticks', s.cutStyle);
      ok('duplex only when true', s.duplex === false, String(s.duplex));
      ok('back offset kept', s.backOffsetXIn === 0.03, s.backOffsetXIn);
    });
    await run('returning users keep Letter', async () => {
      setLangs(['en-GB']);
      localStorage.setItem('mtgTuning', JSON.stringify({ topIn: 0.25 }));
      ok('saved tuning without paper -> Letter', loadPrintSettings().paper === 'letter', printSettings.paper);
      ok('the choice is saved', JSON.parse(localStorage.getItem('mtgTuning')).paper === 'letter', localStorage.getItem('mtgTuning'));
      localStorage.removeItem('mtgTuning'); localStorage.setItem('mtgProxyPages', '{"pages":[[]],"current":0}');
      ok('saved layout only -> Letter', loadPrintSettings().paper === 'letter', printSettings.paper);
    });
    await run('new visitors get their region', async () => {
      const fresh = (arr) => { localStorage.removeItem('mtgTuning'); localStorage.removeItem('mtgProxyPages'); setLangs(arr); return loadPrintSettings().paper; };
      ok('en-GB -> A4', fresh(['en-GB']) === 'a4', printSettings.paper);
      ok('en-US -> Letter', fresh(['en-US']) === 'letter', printSettings.paper);
      ok('fr-CA -> Letter', fresh(['fr-CA', 'fr']) === 'letter', printSettings.paper);
      ok('de -> no region -> Letter', fresh(['de']) === 'letter', printSettings.paper);
      ok('zh-Hant-TW style tag -> A4', fresh(['zh-TW']) === 'a4', printSettings.paper);
    });
    await run('save merges with tuning', async () => {
      localStorage.setItem('mtgTuning', JSON.stringify({ topIn: 0.4, fitMode: 'contain', paper: 'letter' }));
      loadPrintSettings();
      savePrintSettings({ gapMm: 2 });
      const t = JSON.parse(localStorage.getItem('mtgTuning'));
      ok('tuning fields kept', t.topIn === 0.4 && t.fitMode === 'contain', JSON.stringify(t));
      ok('setting saved', t.gapMm === 2 && printSettings.gapMm === 2, JSON.stringify(t));
    });
  } finally {
    if (langs) delete navigator.languages;
    keep.t === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep.t);
    keep.p === null ? localStorage.removeItem('mtgProxyPages') : localStorage.setItem('mtgProxyPages', keep.p);
    loadPrintSettings();
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`loadPrintSettings is not defined`).

- [ ] **Step 3: Implement.** Insert after the end of `function readCssInches(){ … }`:

```js
    /* ===== Print settings ===== */
    // Paper sizes in inches. A4 is 210 × 297 mm.
    const MM_PER_IN = 25.4;
    const PAPER_SIZES = {
      letter: { w: 8.5, h: 11, label: 'Letter' },
      a4: { w: 210 / MM_PER_IN, h: 297 / MM_PER_IN, label: 'A4' }
    };
    const GAP_CHOICES_MM = [0, 1, 2, 3];
    const BLEED_CHOICES_MM = [0, 1, 2, 3];
    const CUT_STYLES = ['ticks', 'full', 'corners'];
    // Countries that use US Letter; everywhere else defaults to A4.
    const LETTER_REGIONS = new Set(['US','CA','MX','PH','CL','CO','VE','GT','CR','PA','DO','SV','NI','HN','PR']);
    const PRINT_DEFAULTS = { paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks', duplex: false,
                             dfcOnBack: null, backImageKey: null, backOffsetXIn: 0, backOffsetYIn: 0 };
    let printSettings = Object.assign({}, PRINT_DEFAULTS);

    function regionPaper(){
      const tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
      for (const tag of tags){
        const m = /-([A-Za-z]{2})(?:-|$)/.exec(String(tag));
        if (m) return LETTER_REGIONS.has(m[1].toUpperCase()) ? 'letter' : 'a4';
      }
      return 'letter';
    }

    function readSavedTuning(){
      try{ return JSON.parse(localStorage.getItem('mtgTuning') || 'null'); }catch(_){ return null; }
    }

    // Saved values win; invalid ones fall back to defaults. Anyone who has used the app before (saved
    // tuning or a saved layout) keeps Letter unless they change it, so nobody's printout changes; only
    // brand-new visitors get the paper size for their region. That choice is saved straight away.
    function loadPrintSettings(){
      const saved = readSavedTuning();
      const t = saved || {};
      const s = Object.assign({}, PRINT_DEFAULTS);
      if (Object.prototype.hasOwnProperty.call(PAPER_SIZES, t.paper)) s.paper = t.paper;
      else {
        let returning = !!saved;
        try{ returning = returning || !!localStorage.getItem('mtgProxyPages'); }catch(_){}
        s.paper = returning ? 'letter' : regionPaper();
      }
      if (GAP_CHOICES_MM.includes(t.gapMm)) s.gapMm = t.gapMm;
      if (BLEED_CHOICES_MM.includes(t.bleedMm)) s.bleedMm = t.bleedMm;
      if (CUT_STYLES.includes(t.cutStyle)) s.cutStyle = t.cutStyle;
      s.duplex = t.duplex === true;
      if (t.dfcOnBack === true || t.dfcOnBack === false) s.dfcOnBack = t.dfcOnBack;
      if (typeof t.backImageKey === 'string' && t.backImageKey) s.backImageKey = t.backImageKey;
      if (typeof t.backOffsetXIn === 'number' && isFinite(t.backOffsetXIn)) s.backOffsetXIn = t.backOffsetXIn;
      if (typeof t.backOffsetYIn === 'number' && isFinite(t.backOffsetYIn)) s.backOffsetYIn = t.backOffsetYIn;
      printSettings = s;
      if (t.paper !== s.paper) savePrintSettings({});
      return s;
    }

    function savePrintSettings(patch){
      Object.assign(printSettings, patch || {});
      try{
        const prev = readSavedTuning() || {};
        Object.keys(PRINT_DEFAULTS).forEach(function(k){ prev[k] = printSettings[k]; });
        localStorage.setItem('mtgTuning', JSON.stringify(prev));
      }catch(_){}
    }
```

In `function loadTuning(){`, make the first statement inside `try{` be `loadPrintSettings();` (so imports that replace `mtgTuning` refresh the settings too):

```js
    function loadTuning(){
      try{
        loadPrintSettings();
        var raw = localStorage.getItem('mtgTuning');
```

In the `init` IIFE (`(async function init(){`), make `loadPrintSettings();` the first statement, before `const firstPage = createPage();`.

- [ ] **Step 4: Run `tests-print-settings.js` — expect all PASS (16).** Run the regression suites (102) and the real-print gate.

- [ ] **Step 5: Commit** — `feat: print settings model (paper, gap, bleed, cut style, duplex)`.

---

### Task 3: Layout calculator

**Files:**
- Create: `.claude/tests/tests-layout.js`
- Modify: `MTG Proxy Maker.html` — add the calculator right after the print-settings block from Task 2; make `tuningProblem` delegate to it

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-layout.js`:

```js
// computeLayout: positions in inches; default equals today's real print; cut-mark rules; fit problems.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const near = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;
  const boxNear = (a, b, tol) => ['x','y','w','h'].every(k => near(a[k], b[k], tol));
  const S = (o) => Object.assign({ paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks', topIn: 0.25, leftIn: 0, cardWIn: 2.475, cardHIn: 3.465, backOffsetXIn: 0, backOffsetYIn: 0 }, o);
  const baseline = async (name) => (await fetch('/.claude/tests/print-baseline/' + name + '.json', { cache: 'no-store' })).json();
  const overlaps = (r, b) => r.x < b.x + b.w - 1e-9 && r.x + r.w > b.x + 1e-9 && r.y < b.y + b.h - 1e-9 && r.y + r.h > b.y + 1e-9;

  await run('default matches today\'s real print', async () => {
    const L = computeLayout(S({})); const B = await baseline('one-page-plain');
    ok('page Letter', L.page.w === 8.5 && L.page.h === 11, JSON.stringify(L.page));
    ok('9 cards equal measured print cells (0.001")', L.cards.every((c, i) => boxNear(c.trim, B.printed[0].cells[i], 0.001)), JSON.stringify(L.cards[0].trim) + ' vs ' + JSON.stringify(B.printed[0].cells[0]));
    ok('bleed box = trim when bleed off', L.cards.every(c => boxNear(c.bleed, c.trim, 1e-9)), '');
  });
  await run('tuned matches today', async () => {
    const L = computeLayout(S({ topIn: 0.4, leftIn: 0.1, cardWIn: 2.5, cardHIn: 3.5 })); const B = await baseline('tuned-full-size');
    ok('cells match', L.cards.every((c, i) => boxNear(c.trim, B.printed[0].cells[i], 0.001)), JSON.stringify(L.cards[4].trim));
  });
  await run('ticks equal today\'s marks', async () => {
    const L = computeLayout(S({})); const B = await baseline('two-pages-cuts');
    const key = r => [r.x, r.y, r.w, r.h].map(v => v.toFixed(3)).join(',');
    const want = B.printed[0].marks.map(key).sort(), got = L.cutMarks.map(key).sort();
    ok('16 marks', got.length === 16, got.length);
    ok('same marks (0.001")', want.length === got.length && L.cutMarks.every(m => B.printed[0].marks.some(b => boxNear(m, b, 0.001))), got.slice(0, 3).join(' | ') + ' vs ' + want.slice(0, 3).join(' | '));
  });
  await run('gap and bleed geometry', async () => {
    const L = computeLayout(S({ paper: 'a4', gapMm: 2, bleedMm: 1 }));
    const b = 1 / 25.4, g = 2 / 25.4, bw = 2.475 + 2 * b;
    ok('A4 page', near(L.page.w, 210 / 25.4, 1e-9) && near(L.page.h, 297 / 25.4, 1e-9), JSON.stringify(L.page));
    ok('grid width', near(L.grid.w, 3 * bw + 2 * g, 1e-9), L.grid.w);
    ok('centred', near(L.grid.x, (210 / 25.4 - L.grid.w) / 2, 1e-9), L.grid.x);
    ok('cell 2 bleed x', near(L.cards[1].bleed.x, L.grid.x + bw + g, 1e-9), L.cards[1].bleed.x);
    ok('trim inset by bleed', near(L.cards[4].trim.x - L.cards[4].bleed.x, b, 1e-9) && near(L.cards[4].trim.w, 2.475, 1e-9), '');
    ok('fits', L.problem === '', L.problem);
  });
  await run('back pages mirror for a long-edge flip', async () => {
    const L = computeLayout(S({ backOffsetXIn: 0.05, backOffsetYIn: -0.02 }));
    const f = L.cards[0].trim, k = L.backCards[0].trim;
    ok('top-left front -> top-right back', near(k.x, 8.5 - f.x - f.w + 0.05, 1e-9) && near(k.y, f.y - 0.02, 1e-9), JSON.stringify(k));
    ok('middle column stays middle', near(L.backCards[1].trim.x + L.backCards[1].trim.w / 2, 4.25 + 0.05, 1e-6), '');
  });
  await run('full lines and corners never touch a card', async () => {
    for (const style of ['full', 'corners']) for (const gapMm of [0, 2]) for (const bleedMm of [0, 1]){
      const L = computeLayout(S({ cutStyle: style, gapMm, bleedMm }));
      const hit = L.cutMarks.find(m => L.cards.some(c => overlaps(m, c.bleed)));
      ok(style + ' gap ' + gapMm + ' bleed ' + bleedMm + ': no mark on a card', !hit, JSON.stringify(hit));
    }
    ok('corners need a gap', computeLayout(S({ cutStyle: 'corners' })).cutMarks.length === 0, '');
    ok('corners with gap: 8 arms per card', computeLayout(S({ cutStyle: 'corners', gapMm: 2 })).cutMarks.length === 72, computeLayout(S({ cutStyle: 'corners', gapMm: 2 })).cutMarks.length);
    const full0 = computeLayout(S({ cutStyle: 'full' })).cutMarks;
    ok('full lines with no gap stay in the margins', full0.length > 0 && full0.every(m => m.y + m.h <= 0.25 + 1e-9 || m.y >= 0.25 + 3 * 3.465 - 1e-9 || m.x + m.w <= 0.5375 + 1e-9 || m.x >= 0.5375 + 7.425 - 1e-9), '');
  });
  await run('fit problems', async () => {
    ok('2.6 x 3.64 overflows Letter by height', /11\.17/.test(computeLayout(S({ cardWIn: 2.6, cardHIn: 3.64 })).problem), computeLayout(S({ cardWIn: 2.6, cardHIn: 3.64 })).problem);
    const p = computeLayout(S({ paper: 'a4', gapMm: 3, bleedMm: 3 })).problem;
    ok('A4 + 3mm gap + 3mm bleed too wide', /wide/.test(p) && /bleed/.test(p) && /gaps/.test(p), p);
    ok('tuningProblem delegates (message kept)', /11\.17/.test(tuningProblem(0.25, 0, 2.6, 3.64)), tuningProblem(0.25, 0, 2.6, 3.64));
  });
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`computeLayout is not defined`).

- [ ] **Step 3: Implement.** Insert right after `function savePrintSettings(patch){ … }`:

```js
    /* ===== Layout calculator ===== */
    // Match the CSS variables --cut-mark-length / --cut-mark-inset / --cut-mark-thickness.
    const CUT_MARK = { lengthIn: 0.18, insetIn: 0.05, thicknessIn: 0.0125 };
    const CORNER_ARM_MAX_IN = 3 / MM_PER_IN;

    // The calculator's inputs, gathered from printer tuning and print settings.
    function currentLayoutSettings(){
      return {
        paper: printSettings.paper, gapMm: printSettings.gapMm, bleedMm: printSettings.bleedMm, cutStyle: printSettings.cutStyle,
        topIn: readInchesVar('--grid-top', 0.25), leftIn: readInchesVar('--grid-left', 0),
        cardWIn: readInchesVar('--cell-w', 2.475), cardHIn: readInchesVar('--cell-h', 3.465),
        backOffsetXIn: printSettings.backOffsetXIn, backOffsetYIn: printSettings.backOffsetYIn
      };
    }

    // Every position on a printed sheet, in inches from the page's top-left corner. Screen, print and
    // PDF all draw from this, so they can't disagree. cards[i] is reading-order cell i; backCards[i] is
    // where that card's back lands on the back page (mirrored for a long-edge flip).
    function computeLayout(s){
      s = s || currentLayoutSettings();
      const page = PAPER_SIZES[s.paper] || PAPER_SIZES.letter;
      const w = s.cardWIn, h = s.cardHIn, b = s.bleedMm / MM_PER_IN, g = s.gapMm / MM_PER_IN;
      const bw = w + 2 * b, bh = h + 2 * b;
      const grid = { w: cols * bw + (cols - 1) * g, h: rows * bh + (rows - 1) * g };
      grid.x = (page.w - grid.w) / 2 + s.leftIn;
      grid.y = s.topIn;
      const mirror = function(box){
        return { x: page.w - box.x - box.w + (s.backOffsetXIn || 0), y: box.y + (s.backOffsetYIn || 0), w: box.w, h: box.h };
      };
      const cards = [], backCards = [];
      for (let r = 0; r < rows; r++){
        for (let c = 0; c < cols; c++){
          const bleed = { x: grid.x + c * (bw + g), y: grid.y + r * (bh + g), w: bw, h: bh };
          const trim = { x: bleed.x + b, y: bleed.y + b, w: w, h: h };
          cards.push({ trim: trim, bleed: bleed });
          backCards.push({ trim: mirror(trim), bleed: mirror(bleed) });
        }
      }
      return {
        page: { w: page.w, h: page.h }, grid: grid, bleedIn: b, gapIn: g, cards: cards, backCards: backCards,
        cutMarks: cutMarkRects(s.cutStyle, cards, grid, page, g),
        problem: layoutProblem(s, page, grid, b, g)
      };
    }

    function uniqueSorted(values){
      return values.slice().sort(function(a, b){ return a - b; }).filter(function(v, i, a){ return i === 0 || Math.abs(v - a[i - 1]) > 1e-9; });
    }

    // Cut marks as thin rectangles, in page inches.
    function cutMarkRects(style, cards, grid, page, g){
      const T = CUT_MARK.thicknessIn, L = CUT_MARK.lengthIn, I = CUT_MARK.insetIn;
      const xs = uniqueSorted(cards.reduce(function(a, c){ return a.concat([c.trim.x, c.trim.x + c.trim.w]); }, []));
      const ys = uniqueSorted(cards.reduce(function(a, c){ return a.concat([c.trim.y, c.trim.y + c.trim.h]); }, []));
      const marks = [];
      if (style === 'full'){
        // Along every cut line across the page, stopping wherever the line would touch a card.
        const free = function(lo, hi, blocked){
          blocked.sort(function(a, b){ return a[0] - b[0]; });
          const out = []; let at = lo;
          blocked.forEach(function(iv){ if (iv[0] > at) out.push([at, iv[0]]); at = Math.max(at, iv[1]); });
          if (at < hi) out.push([at, hi]);
          return out.filter(function(iv){ return iv[1] - iv[0] > 1e-6; });
        };
        xs.forEach(function(x){
          const blocked = cards.filter(function(c){ return x + T / 2 > c.bleed.x && x - T / 2 < c.bleed.x + c.bleed.w; })
                               .map(function(c){ return [c.bleed.y, c.bleed.y + c.bleed.h]; });
          free(0, page.h, blocked).forEach(function(iv){ marks.push({ x: x - T / 2, y: iv[0], w: T, h: iv[1] - iv[0] }); });
        });
        ys.forEach(function(y){
          const blocked = cards.filter(function(c){ return y + T / 2 > c.bleed.y && y - T / 2 < c.bleed.y + c.bleed.h; })
                               .map(function(c){ return [c.bleed.x, c.bleed.x + c.bleed.w]; });
          free(0, page.w, blocked).forEach(function(iv){ marks.push({ x: iv[0], y: y - T / 2, w: iv[1] - iv[0], h: T }); });
        });
        return marks;
      }
      if (style === 'corners'){
        if (!(g > 0)) return marks;
        const arm = Math.min(CORNER_ARM_MAX_IN, g / 2);
        cards.forEach(function(c){
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(d){
            const tx = d[0] < 0 ? c.trim.x : c.trim.x + c.trim.w, ty = d[1] < 0 ? c.trim.y : c.trim.y + c.trim.h;
            const bx = d[0] < 0 ? c.bleed.x : c.bleed.x + c.bleed.w, by = d[1] < 0 ? c.bleed.y : c.bleed.y + c.bleed.h;
            marks.push({ x: d[0] < 0 ? bx - arm : bx, y: ty - T / 2, w: arm, h: T });   // horizontal arm
            marks.push({ x: tx - T / 2, y: d[1] < 0 ? by - arm : by, w: T, h: arm });   // vertical arm
          });
        });
        return marks;
      }
      // Ticks: exactly today's marks — 0.18" long, from 0.13" outside the grid edge to 0.05" inside it.
      xs.forEach(function(x){
        marks.push({ x: x - T / 2, y: grid.y + I - L, w: T, h: L });
        marks.push({ x: x - T / 2, y: grid.y + grid.h - I, w: T, h: L });
      });
      ys.forEach(function(y){
        marks.push({ x: grid.x + I - L, y: y - T / 2, w: L, h: T });
        marks.push({ x: grid.x + grid.w - I, y: y - T / 2, w: L, h: T });
      });
      return marks;
    }

    // Why a layout can't be printed, in words, or '' when it fits on the page.
    function layoutProblem(s, page, grid, b, g){
      if (![s.topIn, s.leftIn, s.cardWIn, s.cardHIn].every(isFinite)) return 'Enter a number in every field.';
      if (s.cardWIn <= 0 || s.cardHIn <= 0) return 'Card width and height must be greater than zero.';
      if (s.topIn < 0) return 'Top margin can\'t be negative.';
      const fmt = function(v){ return String(Math.round(v * 100) / 100); };
      const extras = (b > 0 ? ' + bleed' : '') + (g > 0 ? ' + gaps' : '');
      const neededH = s.topIn + grid.h;
      if (neededH > page.h + 1e-6){
        return 'Cards this tall don\'t fit: ' + rows + ' rows × ' + s.cardHIn.toFixed(3) + '″' + extras + ' + ' + s.topIn.toFixed(2) +
          '″ top margin = ' + neededH.toFixed(2) + '″, but the page is ' + fmt(page.h) + '″ tall.';
      }
      const neededW = grid.w + 2 * Math.abs(s.leftIn);
      if (neededW > page.w + 1e-6){
        return 'Cards this wide don\'t fit: ' + cols + ' columns × ' + s.cardWIn.toFixed(3) + '″' + extras +
          (s.leftIn ? ' shifted ' + Math.abs(s.leftIn).toFixed(2) + '″' : '') + ' need ' + neededW.toFixed(2) +
          '″, but the page is ' + fmt(page.w) + '″ wide.';
      }
      return '';
    }
```

Replace the body of `function tuningProblem(topIn, leftIn, cardWIn, cardHIn){ … }` (keep the comment above it) with:

```js
    function tuningProblem(topIn, leftIn, cardWIn, cardHIn){
      return computeLayout(Object.assign(currentLayoutSettings(), { topIn: topIn, leftIn: leftIn, cardWIn: cardWIn, cardHIn: cardHIn })).problem;
    }
```

- [ ] **Step 4: Run `tests-layout.js` — expect all PASS (28).** Run the regression suites (102; `tests-remaining.js` "tuning limits" must still pass) and the real-print gate.

- [ ] **Step 5: Commit** — `feat: layout calculator for pages, cards, backs and cut marks`.

---

### Task 4: Draw pages from the calculator (default prints stay identical)

**Files:**
- Replace: `.claude/tests/print-harness.mjs` (new version below; baseline scenarios unchanged)
- Create: `.claude/tests/tests-render.js`
- Modify: `MTG Proxy Maker.html` — CSS for `.page`, `.grid`, `.cut-marks-layer`, `.cell`, print and preview rules, the `@page` rule; JS `createPage`, `buildCutMarksLayer` (removed), `applyCutMarksToModel`, `syncCutMarksState`, `doUpdate`

- [ ] **Step 1: Replace the harness** with a version that also checks geometry. Overwrite `.claude/tests/print-harness.mjs` with:

```js
// Real-print harness: drives headless Chrome over the DevTools protocol, builds a known layout in the
// app, and saves Chrome's actual print output (Page.printToPDF honours @page = the print dialog at
// 100%, background graphics off). With --geometry it also checks every printed box against
// computeLayout() (max 0.001") and the PDF's sheet count and page size.
//
// usage: node print-harness.mjs <appUrl> <outDir> [--geometry] [scenario ...]
// Default scenarios: the three baseline ones (pixel-compared by compare-prints.py).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const argv = process.argv.slice(2);
const geometry = argv.includes('--geometry');
const [appUrl, outDir, ...wanted] = argv.filter(a => a !== '--geometry');
if (!appUrl || !outDir) { console.error('usage: node print-harness.mjs <appUrl> <outDir> [--geometry] [scenario ...]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const SCENARIOS = {
  'one-page-plain':  { cards: 9,  cutMarks: false },
  'two-pages-cuts':  { cards: 11, cutMarks: true },
  'tuned-full-size': { cards: 9,  cutMarks: true, tuning: { topIn: 0.4, leftIn: 0.1, cardWIn: 2.5, cardHIn: 3.5 } },
  'letter-gap2-full':   { cards: 9,  cutMarks: true, settings: { paper: 'letter', gapMm: 2, cutStyle: 'full' } },
  'a4-plain':           { cards: 9,  cutMarks: true, settings: { paper: 'a4' } },
  'a4-gap2-corners':    { cards: 9,  cutMarks: true, settings: { paper: 'a4', gapMm: 2, cutStyle: 'corners' } },
  'letter-bleed3':      { cards: 9,  cutMarks: true, settings: { paper: 'letter', bleedMm: 3 } },
  'a4-gap2-bleed1':     { cards: 9,  cutMarks: true, settings: { paper: 'a4', gapMm: 2, bleedMm: 1, cutStyle: 'corners' } },
  'letter-duplex':      { cards: 11, cutMarks: true, settings: { paper: 'letter', gapMm: 2, bleedMm: 1, duplex: true, backOffsetXIn: 0.05, backOffsetYIn: -0.03 } },
};
const DEFAULT_RUN = ['one-page-plain', 'two-pages-cuts', 'tuned-full-size'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-print-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

async function json(url) { for (let i = 0; i < 50; i++) { try { return await (await fetch(url)).json(); } catch { await sleep(200); } } throw new Error('Chrome did not start'); }
let ws, nextId = 1; const pending = new Map(); const waiters = [];
function send(method, params = {}) { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method })); }
function once(method) { return new Promise(r => waiters.push({ method, r })); }
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error('page error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  return res.result.value;
}

const SETUP = (s) => `(async () => {
  window.confirm = () => true;
  localStorage.removeItem('mtgTuning');
  if (typeof savePrintSettings === 'function') savePrintSettings(Object.assign({}, PRINT_DEFAULTS, ${JSON.stringify(s.settings || {})}));
  applyTuning(0.25, 0, 2.475, 3.465);
  ${s.tuning ? `applyTuning(${s.tuning.topIn}, ${s.tuning.leftIn}, ${s.tuning.cardWIn}, ${s.tuning.cardHIn});` : ''}
  clearAllPages(true);
  const placement = createPlacement();
  for (let i = 0; i < ${s.cards}; i++){
    const cv = document.createElement('canvas'); cv.width = 745; cv.height = 1040;
    const g = cv.getContext('2d');
    g.fillStyle = 'hsl(' + (i * 37 % 360) + ',65%,45%)'; g.fillRect(0, 0, 745, 1040);
    g.fillStyle = '#000'; g.fillRect(0, 0, 745, 18); g.fillRect(0, 1022, 745, 18); g.fillRect(0, 0, 18, 1040); g.fillRect(727, 0, 18, 1040);
    g.fillStyle = '#fff'; g.font = 'bold 360px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), 372, 650);
    placement.put(await createStoredItemFromDataUrl(cv.toDataURL('image/png')));
  }
  toggleCutMarks.checked = ${!!s.cutMarks}; syncCutMarksState();
  toggleGuides.checked = true; toggleGuides.dispatchEvent(new Event('change'));
  showPage(0);
  if (typeof syncBackPages === 'function') await syncBackPages();
  await Promise.all([...document.querySelectorAll('.page img')].map(img => img.complete && img.naturalWidth ? null : new Promise(r => { img.onload = img.onerror = r; })));
  await new Promise(r => setTimeout(r, 400));
  return pages.length;
})()`;

const MEASURE = `(() => {
  const PX = 96, r2 = (v) => Math.round(v * 10000) / 10000;
  return [...document.querySelectorAll('.page:not(.back-page)')].map(pageEl => {
    const pr = pageEl.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(); return { x: r2((r.left - pr.left) / PX), y: r2((r.top - pr.top) / PX), w: r2(r.width / PX), h: r2(r.height / PX) }; };
    const cells = [...pageEl.querySelectorAll('.cell')].map(c => { const box = rel(c); const img = c.querySelector('img'); box.img = img ? rel(img) : null; return box; });
    const marks = [...pageEl.querySelectorAll('.cut-mark')].filter(m => getComputedStyle(m.closest('.cut-marks-layer')).opacity !== '0').map(rel);
    return { page: { w: r2(pr.width / PX), h: r2(pr.height / PX) }, cells, marks };
  });
})()`;

const GEOMETRY = `(() => {
  const L = computeLayout(), PX = 96; let max = 0; const bad = [];
  const rel = (el, pg) => { const r = el.getBoundingClientRect(), p = pg.getBoundingClientRect(); return { x: (r.left - p.left) / PX, y: (r.top - p.top) / PX, w: r.width / PX, h: r.height / PX }; };
  const cmp = (label, got, want) => ['x','y','w','h'].forEach(k => { const d = Math.abs(got[k] - want[k]); if (d > max) max = d; if (d > 0.001) bad.push(label + ' ' + k + ' ' + got[k].toFixed(4) + ' vs ' + want[k].toFixed(4)); });
  const fronts = [...document.querySelectorAll('.page:not(.back-page)')];
  fronts.forEach((pg, pi) => {
    const pr = pg.getBoundingClientRect();
    cmp('p' + pi + ' page', { x: 0, y: 0, w: pr.width / PX, h: pr.height / PX }, { x: 0, y: 0, w: L.page.w, h: L.page.h });
    pg.querySelectorAll('.cell').forEach((c, i) => cmp('p' + pi + ' cell' + i, rel(c, pg), L.cards[i].trim));
    pg.querySelectorAll('.bleed-box').forEach((b, i) => { if (getComputedStyle(b).display !== 'none') cmp('p' + pi + ' bleed' + i, rel(b, pg), L.cards[i].bleed); });
    if (pg.classList.contains('cut-marks')){
      const marks = [...pg.querySelectorAll('.cut-mark')];
      if (marks.length !== L.cutMarks.length) bad.push('p' + pi + ' marks ' + marks.length + ' vs ' + L.cutMarks.length);
      marks.forEach((m, i) => L.cutMarks[i] && cmp('p' + pi + ' mark' + i, rel(m, pg), L.cutMarks[i]));
    }
  });
  const backs = [...document.querySelectorAll('.page.back-page')];
  backs.forEach((pg, pi) => pg.querySelectorAll('.back-cell').forEach(c => cmp('back' + pi + ' cell' + c.dataset.index, rel(c, pg), L.backCards[+c.dataset.index].trim)));
  const order = [...document.querySelectorAll('.page')].map(p => p.classList.contains('back-page') ? 'B' : 'F').join('');
  return { maxDeviationIn: max, problems: bad.slice(0, 20), fronts: fronts.length, backs: backs.length, order, page: L.page };
})()`;

let failed = false;
try {
  await json(`http://127.0.0.1:${PORT}/json/version`);
  const target = (await json(`http://127.0.0.1:${PORT}/json/list`)).find(t => t.type === 'page');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(p.method + ': ' + msg.error.message)) : p.resolve(msg.result); }
    else if (msg.method) { for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method) { waiters[i].r(msg.params); waiters.splice(i, 1); } }
  };
  await send('Page.enable'); await send('Runtime.enable');
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: appUrl });
  await loaded; await sleep(1500);

  for (const name of (wanted.length ? wanted : DEFAULT_RUN)){
    const s = SCENARIOS[name]; if (!s) throw new Error('unknown scenario ' + name);
    const pageCount = await evaluate(SETUP(s));
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    await sleep(300);
    const printed = await evaluate(MEASURE);
    const geo = geometry ? await evaluate(GEOMETRY) : null;
    await send('Emulation.setEmulatedMedia', { media: '' });
    // printBackground: false matches the print dialog's default ("Background graphics" off): only
    // elements marked print-color-adjust: exact print their backgrounds, exactly as for users.
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: false });
    const bytes = Buffer.from(pdf.data, 'base64');
    fs.writeFileSync(path.join(outDir, name + '.pdf'), bytes);
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify({ scenario: name, appPages: pageCount, printed, geometry: geo }, null, 1));
    let line = name + ': app pages ' + pageCount + ', print-layout pages ' + printed.length + ', pdf ' + Math.round(bytes.length / 1024) + ' KB';
    if (geo) {
      const text = bytes.toString('latin1');
      const sheets = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
      const box = (text.match(/\/MediaBox\s*\[\s*([\d.\s]+)\]/) || [])[1];
      const [bw, bh] = box ? box.trim().split(/\s+/).slice(2).map(Number) : [0, 0];
      const wantSheets = geo.fronts + geo.backs;
      const sizeOk = Math.abs(bw - geo.page.w * 72) < 0.5 && Math.abs(bh - geo.page.h * 72) < 0.5;
      const ok = geo.problems.length === 0 && sheets === wantSheets && sizeOk;
      line += ` | geometry max dev ${geo.maxDeviationIn.toFixed(5)}" | sheets ${sheets}/${wantSheets} (${geo.order}) | page ${bw}x${bh}pt ${sizeOk ? 'ok' : 'WRONG'} | ${ok ? 'PASS' : 'FAIL'}`;
      if (!ok) { failed = true; if (geo.problems.length) line += '\n   ' + geo.problems.join('\n   '); }
    }
    console.log(line);
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Write the failing in-page test** — create `.claude/tests/tests-render.js`:

```js
// Pages are drawn from computeLayout: cells and marks sit exactly where the calculator says.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const keep = localStorage.getItem('mtgTuning');
  const PX = 96, rel = (el, pg) => { const r = el.getBoundingClientRect(), p = pg.getBoundingClientRect(), s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-scale')) || 1; return { x: (r.left - p.left) / PX / s, y: (r.top - p.top) / PX / s, w: r.width / PX / s, h: r.height / PX / s }; };
  const near = (a, b) => ['x','y','w','h'].every(k => Math.abs(a[k] - b[k]) < 0.002);
  try {
    await run('A4 with gap: cells, page size and @page follow the layout', async () => {
      window.confirm = () => true; clearAllPages(true);
      savePrintSettings({ paper: 'a4', gapMm: 2, cutStyle: 'full' }); applyLayout();
      const L = computeLayout(), pg = pages[0].pageEl;
      ok('page is A4', Math.abs(pg.offsetWidth / PX - 210 / 25.4) < 0.01 && Math.abs(pg.offsetHeight / PX - 297 / 25.4) < 0.01, pg.offsetWidth + 'x' + pg.offsetHeight);
      ok('@page rule is A4', /size:\s*8\.26\d*in\s+11\.69\d*in/.test(document.getElementById('pageSizeRule').textContent), document.getElementById('pageSizeRule').textContent);
      ok('every cell at its trim box', pages[0].cells.every((c, i) => near(rel(c, pg), L.cards[i].trim)), JSON.stringify(rel(pages[0].cells[1], pg)) + ' vs ' + JSON.stringify(L.cards[1].trim));
      toggleCutMarks.checked = true; syncCutMarksState();
      await new Promise(r => setTimeout(r, 250));   // the layer fades in over .15s
      const marks = [...pg.querySelectorAll('.cut-mark')];
      ok('marks drawn from the layout', marks.length === L.cutMarks.length && marks.every((m, i) => near(rel(m, pg), L.cutMarks[i])), marks.length + ' vs ' + L.cutMarks.length);
      ok('marks layer visible only when on', getComputedStyle(pg.querySelector('.cut-marks-layer')).opacity === '1', '');
      toggleCutMarks.checked = false; syncCutMarksState();
      await new Promise(r => setTimeout(r, 250));
      ok('hidden when off', getComputedStyle(pg.querySelector('.cut-marks-layer')).opacity === '0', '');
    });
    await run('new pages get the current layout', async () => {
      addPage();
      const L = computeLayout(), pg = pages[1].pageEl;
      showPage(1);
      ok('page 2 cell 9 placed', near(rel(pages[1].cells[8], pg), L.cards[8].trim), JSON.stringify(rel(pages[1].cells[8], pg)));
    });
  } finally {
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning(); applyLayout(); clearAllPages(true);
  }
  return results.join('\n');
})()
```

- [ ] **Step 3: Run it — expect FAIL** (`applyLayout is not defined`).

- [ ] **Step 4: CSS.** Make these replacements in the `<style>` block:

(a) In the `.page { … }` rule replace the three lines `display: grid;`, `place-items: start center;`, `padding-top: var(--grid-top);` with the single line `display: block;`.

(b) Replace the whole `.grid { … }` one-line rule and the cut-marks rules from `.grid .cut-marks-layer {` through the end of `.cut-marks-layer .cut-mark.horizontal { … }` with:

```css
    /* Positions come from computeLayout() via inline styles (inches). */
    .grid { position: absolute; z-index: 1; }
    .page > .cut-marks-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 3;
      opacity: 0;
      transition: opacity .15s ease-in-out;
    }
    .page.cut-marks > .cut-marks-layer { opacity: 1; }
    .cut-marks-layer .cut-mark {
      position: absolute;
      background: var(--cut-mark-color);
      border-radius: 999px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
```

(c) In the `.cell { … }` rule replace `position: relative;` with `position: absolute; box-sizing: border-box;` (inline styles set the size; border-box keeps the on-screen dashed guide inside the card box — print has no border, so print output is unaffected).

(d) In the preview-mode rule `.preview-mode .page { … }` change `position: static !important;` to `position: relative !important;`.

(e) Delete the line `    @page { size: 8.5in 11in; margin: 0; }` together with its comment line `    /* Instruct printers on paper size */`.

(f) In the print block, in `.page{ … }` change `position: static !important;` to `position: relative !important;` and change `padding-top: var(--grid-top);` to `padding-top: 0;`. Delete the line `      .page .grid { margin-left: auto !important; margin-right: auto !important; }`.

(g) Right after the closing `</style>` of the main style block (before `</head>`), add:

```html
  <!-- Paper size for the print dialog; updated by applyLayout() when the paper setting changes. -->
  <style id="pageSizeRule">@page { size: 8.5in 11in; margin: 0; }</style>
```

- [ ] **Step 5: JS.** Replace the whole `function buildCutMarksLayer(layer){ … }` (from `function buildCutMarksLayer(layer){` through its final closing brace, just before `function createPage(){`) with:

```js
    /* ===== Drawing pages from the layout ===== */
    function inch(v){ return (Math.round(v * 1e6) / 1e6) + 'in'; }

    // Positions an element at a box (inches), optionally relative to another box's origin.
    function placeBox(el, box, origin){
      el.style.left = inch(box.x - (origin ? origin.x : 0));
      el.style.top = inch(box.y - (origin ? origin.y : 0));
      el.style.width = inch(box.w);
      el.style.height = inch(box.h);
    }

    let currentLayout = null;

    // Applies the current layout everywhere: paper size (screen and print dialog), every page's grid,
    // cells and cut marks.
    function applyLayout(){
      const layout = computeLayout();
      currentLayout = layout;
      const root = document.documentElement.style;
      root.setProperty('--page-w', inch(layout.page.w));
      root.setProperty('--page-h', inch(layout.page.h));
      const rule = document.getElementById('pageSizeRule');
      const sizeText = '@page { size: ' + inch(layout.page.w) + ' ' + inch(layout.page.h) + '; margin: 0; }';
      if (rule && rule.textContent !== sizeText) rule.textContent = sizeText;
      pages.forEach(function(model){ layoutPage(model, layout); });
      return layout;
    }

    function layoutPage(model, layout){
      layout = layout || currentLayout || computeLayout();
      placeBox(model.gridEl, layout.grid);
      model.cells.forEach(function(cell, i){ placeBox(cell, layout.cards[i].trim, layout.grid); });
      drawCutMarks(model.cutMarksLayer, layout.cutMarks);
    }

    function drawCutMarks(layer, rects){
      layer.innerHTML = '';
      rects.forEach(function(r){
        const m = document.createElement('div');
        m.className = 'cut-mark';
        placeBox(m, r);
        layer.appendChild(m);
      });
    }
```

In `createPage`, replace:

```js
      var cutLayer = document.createElement('div');
      cutLayer.className = 'cut-marks-layer';
      cutLayer.setAttribute('aria-hidden', 'true');
      grid.appendChild(cutLayer);
      p.appendChild(grid);
      pageWrap.appendChild(p);
      buildCutMarksLayer(cutLayer);
```

with:

```js
      var cutLayer = document.createElement('div');
      cutLayer.className = 'cut-marks-layer';
      cutLayer.setAttribute('aria-hidden', 'true');
      p.appendChild(grid);
      p.appendChild(cutLayer);
      pageWrap.appendChild(p);
```

and in the same function replace:

```js
      wireGridEvents(model);
      applyCutMarksToModel(model, !!(toggleCutMarks && toggleCutMarks.checked));
      return model;
```

with:

```js
      wireGridEvents(model);
      layoutPage(model);
      applyCutMarksToModel(model, !!(toggleCutMarks && toggleCutMarks.checked));
      return model;
```

Replace `function applyCutMarksToModel(model, show){ … }` with:

```js
    function applyCutMarksToModel(model, show){
      if (!model || !model.pageEl) return;
      model.pageEl.classList.toggle('cut-marks', show);
    }
```

In `function doUpdate(){` make `applyLayout();` the first statement (before `refreshPxPerIn();`).

- [ ] **Step 6: Run `tests-render.js` — expect all PASS (7).** Run the regression suites (102).

- [ ] **Step 7: Real-print gate — the critical check.** Run the baseline comparison (Conventions). Expected: all four pages PASS with 0 (or near-0, within tolerance) differing pixels. If any page fails, open the written `*-diff.png`, find the cause, and fix it before continuing — do **not** loosen the tolerance or regenerate the baseline. Then run the geometry matrix:

```bash
node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry one-page-plain two-pages-cuts tuned-full-size letter-gap2-full a4-plain a4-gap2-corners
```

Expected: every line ends `PASS` with max deviation ≤ 0.001″, sheets equal to front pages, page `612x792pt` (Letter) or `595.28x841.89pt` (A4) `ok`. Delete `.claude/tests/print-out`.

- [ ] **Step 8: Commit** — `feat: pages drawn from the layout calculator (Letter/A4, gaps, cut-line styles)`.

---

### Task 5: Bleed

**Files:**
- Create: `.claude/tests/tests-bleed.js`
- Modify: `MTG Proxy Maker.html` — CSS (new `.bleed-box` and bleed cell rules), `createPage`, `layoutPage`, `renderCell`; add `sampleBorderColor`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-bleed.js`:

```js
// Bleed: border-colour sampling, bleed boxes at the calculator's positions, square filled corners.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const keep = localStorage.getItem('mtgTuning');
  const imgFrom = (draw) => new Promise(r => { const cv = document.createElement('canvas'); cv.width = 745; cv.height = 1040; draw(cv.getContext('2d')); const im = new Image(); im.onload = () => r(im); im.src = cv.toDataURL('image/png'); });
  try {
    await run('sampler', async () => {
      const white = await imgFrom(g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 745, 1040); g.fillStyle = '#c00'; g.fillRect(60, 60, 625, 920); });
      ok('white border -> white', sampleBorderColor(white) === 'rgb(255,255,255)', sampleBorderColor(white));
      const rounded = await imgFrom(g => { g.fillStyle = '#123456'; g.beginPath(); g.roundRect(0, 0, 745, 1040, 90); g.fill(); });
      ok('transparent rounded corners ignored', sampleBorderColor(rounded) === 'rgb(18,52,86)', sampleBorderColor(rounded));
      const tainted = new Image(); tainted.src = 'https://example.invalid/x.png';
      ok('unreadable image -> black', sampleBorderColor(tainted) === 'rgb(0,0,0)', sampleBorderColor(tainted));
    });
    await run('bleed boxes on the page', async () => {
      window.confirm = () => true; clearAllPages(true);
      savePrintSettings({ paper: 'letter', bleedMm: 3 }); applyLayout();
      const cv = document.createElement('canvas'); cv.width = 745; cv.height = 1040; const g = cv.getContext('2d'); g.fillStyle = '#0a0'; g.fillRect(0, 0, 745, 1040);
      createPlacement().put(await createStoredItemFromDataUrl(cv.toDataURL('image/png')));
      await new Promise(r => setTimeout(r, 500));
      const box = pages[0].bleedBoxes[0], cell = pages[0].cells[0];
      ok('page marked has-bleed', pages[0].pageEl.classList.contains('has-bleed'), '');
      ok('filled cell shows its bleed box', getComputedStyle(box).display === 'block', getComputedStyle(box).display);
      ok('empty cell has none', getComputedStyle(pages[0].bleedBoxes[1]).display === 'none', '');
      ok('bleed box takes the border colour', getComputedStyle(box).backgroundColor === 'rgb(0, 170, 0)', getComputedStyle(box).backgroundColor);
      ok('cell corners squared and filled', getComputedStyle(cell).borderTopLeftRadius === '0px' && getComputedStyle(cell).backgroundColor === 'rgb(0, 170, 0)', getComputedStyle(cell).borderTopLeftRadius + ' ' + getComputedStyle(cell).backgroundColor);
      ok('prints without "background graphics"', (getComputedStyle(box).printColorAdjust || getComputedStyle(box).webkitPrintColorAdjust) === 'exact', getComputedStyle(box).webkitPrintColorAdjust);
      savePrintSettings({ bleedMm: 0 }); applyLayout();
      ok('bleed off: no bleed box, rounded cell', getComputedStyle(box).display === 'none' && getComputedStyle(cell).borderTopLeftRadius === '8px', '');
    });
  } finally {
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning(); applyLayout(); clearAllPages(true);
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`sampleBorderColor is not defined`).

- [ ] **Step 3: CSS.** Add after the `.cell .placeholder{ … }` rule:

```css
    /* Bleed: a box in the card's border colour behind the card; the card's corners are squared and
       filled with the same colour. Both print even with "Background graphics" off. */
    .bleed-box { position: absolute; display: none; background: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page.has-bleed .bleed-box.filled { display: block; }
    .page.has-bleed .cell.filled { border-radius: 0; background: var(--bleed-color, #000); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
```

- [ ] **Step 4: JS.** Add after `function drawCutMarks(layer, rects){ … }`:

```js
    const borderColorCache = new Map();

    // Border colour of an <img>, cached by its URL.
    function sampleBorderColor(img){
      const key = img.currentSrc || img.src;
      if (key && borderColorCache.has(key)) return borderColorCache.get(key);
      const color = borderColorFromSource(img, img.naturalWidth, img.naturalHeight);
      if (key) borderColorCache.set(key, color);
      return color;
    }

    // A card's border colour: the median of a band 1.5–3% inside each edge, skipping transparent
    // pixels (rounded corners). Black when the image can't be read (another site without CORS).
    // `source` is anything drawImage accepts (an <img>, an ImageBitmap, a canvas).
    function borderColorFromSource(source, naturalW, naturalH){
      let color = 'rgb(0,0,0)';
      try{
        const W = 200, H = Math.max(1, Math.round(W * (naturalH || 1) / (naturalW || 1)));
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(source, 0, 0, W, H);
        const data = g.getImageData(0, 0, W, H).data;
        const rs = [], gs = [], bs = [];
        for (let y = 0; y < H; y++){
          for (let x = 0; x < W; x++){
            const d = Math.min(x / W, 1 - (x + 1) / W, y / H, 1 - (y + 1) / H);
            if (d < 0.015 || d > 0.03) continue;
            const i = (y * W + x) * 4;
            if (data[i + 3] < 200) continue;
            rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
          }
        }
        if (rs.length){
          const med = function(a){ a.sort(function(p, q){ return p - q; }); return a[a.length >> 1]; };
          color = 'rgb(' + med(rs) + ',' + med(gs) + ',' + med(bs) + ')';
        }
      }catch(err){
        console.warn('Could not sample the border colour; using black', err);
      }
      return color;
    }
```

In `createPage`, replace:

```js
      var cells = [];
      for(var i=0;i<CELLS_PER_PAGE;i++){
```

with:

```js
      var cells = [], bleedBoxes = [];
      for(var b=0;b<CELLS_PER_PAGE;b++){
        var bleedBox = document.createElement('div'); bleedBox.className = 'bleed-box'; bleedBox.setAttribute('aria-hidden', 'true');
        grid.appendChild(bleedBox); bleedBoxes.push(bleedBox);
      }
      for(var i=0;i<CELLS_PER_PAGE;i++){
```

and change the model line to include them:

```js
      var model = { items: new Array(CELLS_PER_PAGE).fill(null), pageEl: p, gridEl: grid, cells: cells, bleedBoxes: bleedBoxes, cutMarksLayer: cutLayer };
```

In `layoutPage`, replace

```js
      model.cells.forEach(function(cell, i){ placeBox(cell, layout.cards[i].trim, layout.grid); });
```

with

```js
      model.pageEl.classList.toggle('has-bleed', layout.bleedIn > 0);
      model.cells.forEach(function(cell, i){
        placeBox(cell, layout.cards[i].trim, layout.grid);
        placeBox(model.bleedBoxes[i], layout.cards[i].bleed, layout.grid);
      });
```

In `renderCell(model, i)`:
- right after `cell.innerHTML='';` add `const bleedBox = model.bleedBoxes[i];`
- in the empty branch (`if(!data){`) add as its first two lines: `cell.classList.remove('filled'); bleedBox.classList.remove('filled');`
- after `cell.setAttribute('aria-label','Occupied cell ' + (i+1));` add `cell.classList.add('filled'); bleedBox.classList.add('filled');`
- replace the onload handler

```js
      el.onload = function(){
        if (data.__renderToken !== token) return;
        fitImage(el);
      };
```

with

```js
      el.onload = function(){
        if (data.__renderToken !== token) return;
        fitImage(el);
        const color = sampleBorderColor(el);
        bleedBox.style.background = color;
        cell.style.setProperty('--bleed-color', color);
      };
```

- [ ] **Step 5: Run `tests-bleed.js` — expect all PASS (10).** Run `tests-render.js` and the regression suites.

- [ ] **Step 6: Real-print gate + bleed geometry.** Baseline comparison must still PASS. Then:

```bash
node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry letter-bleed3 a4-gap2-bleed1
# letter-bleed3: bleed box 1 starts at x = (8.5 - 3*(2.475 + 2*3/25.4))/2 = 0.1832", card at 0.3013"; sample 0.213", 2.1"
.claude/tests/.venv/Scripts/python -c "import pymupdf; pix=pymupdf.open('.claude/tests/print-out/letter-bleed3.pdf')[0].get_pixmap(dpi=150); print('bleed pixel', pix.pixel(int(0.213*150), int(2.1*150)))"
```

Expected: both geometry lines PASS; the printed bleed pixel (0.03″ inside the first bleed box, left of the card) is black `(0, 0, 0)` (the harness cards have black borders), proving bleed prints with background graphics off. Delete `.claude/tests/print-out`.

- [ ] **Step 7: Commit** — `feat: bleed in the card's border colour`.

---

### Task 6: Advanced dialog holds every print setting

**Files:**
- Create: `.claude/tests/tests-advanced.js`
- Modify: `MTG Proxy Maker.html` — the `#tuneModal` markup, CSS for the dialog, `openTune`, the save and reset handlers, the help modal button label

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-advanced.js`:

```js
// Advanced dialog: paper, gap, bleed, cut style, fine-tuning; validation; saving; corners need a gap.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const keep = localStorage.getItem('mtgTuning');
  const pick = (name, value) => { const r = tuneModal.querySelector('input[name="' + name + '"][value="' + value + '"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
  const checked = (name) => (tuneModal.querySelector('input[name="' + name + '"]:checked') || {}).value;
  try {
    await run('opens with current settings', async () => {
      savePrintSettings({ paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks' }); applyLayout();
      openTune();
      ok('paper Letter', checked('paper') === 'letter', checked('paper'));
      ok('gap 0', checked('gap') === '0', checked('gap'));
      ok('bleed 0', checked('bleed') === '0', checked('bleed'));
      ok('cut style ticks', checked('cutStyle') === 'ticks', checked('cutStyle'));
      ok('corners disabled with no gap', tuneModal.querySelector('input[name="cutStyle"][value="corners"]').disabled, '');
      ok('fine-tuning collapsed', !tuneModal.querySelector('details.fine-tuning').open, '');
      ok('mini preview drawn', tuneModal.querySelectorAll('#tunePreview .tp-card').length === 9, tuneModal.querySelectorAll('#tunePreview .tp-card').length);
    });
    await run('choosing settings and saving', async () => {
      pick('paper', 'a4'); pick('gap', '2'); pick('bleed', '1');
      ok('corners enabled once there is a gap', !tuneModal.querySelector('input[name="cutStyle"][value="corners"]').disabled, '');
      pick('cutStyle', 'corners');
      ok('preview follows the draft (A4 aspect)', Math.abs(document.getElementById('tunePreview').offsetHeight / document.getElementById('tunePreview').offsetWidth - 297 / 210) < 0.02, '');
      document.getElementById('saveTuneBtn').click();
      ok('dialog closed', !tuneModal.classList.contains('open'), '');
      ok('settings saved', printSettings.paper === 'a4' && printSettings.gapMm === 2 && printSettings.bleedMm === 1 && printSettings.cutStyle === 'corners', JSON.stringify(printSettings));
      ok('pages re-laid out', Math.abs(pages[0].pageEl.offsetWidth / 96 - 210 / 25.4) < 0.01, pages[0].pageEl.offsetWidth);
    });
    await run('gap back to 0 drops corners to ticks', async () => {
      openTune(); pick('gap', '0');
      ok('style switched to ticks', checked('cutStyle') === 'ticks', checked('cutStyle'));
      closeModal(tuneModal);
    });
    await run('validation keeps the dialog open', async () => {
      openTune(); pick('gap', '3'); pick('bleed', '3');
      document.getElementById('saveTuneBtn').click();
      const err = document.getElementById('tuneError');
      ok('A4 + 3mm + 3mm rejected with a reason', tuneModal.classList.contains('open') && !err.hidden && /wide/.test(err.textContent), err.textContent);
      ok('nothing saved', printSettings.gapMm === 2, printSettings.gapMm);
      closeModal(tuneModal);
    });
    await run('reset', async () => {
      openTune(); document.getElementById('resetTuneBtn').click();
      ok('gap/bleed/style reset, paper kept', checked('gap') === '0' && checked('bleed') === '0' && checked('cutStyle') === 'ticks' && checked('paper') === 'a4', [checked('gap'), checked('bleed'), checked('cutStyle'), checked('paper')].join());
      closeModal(tuneModal);
    });
    ok('help button says "Print settings"', /Print settings/.test(ensureHelpModal().querySelector('#tuneBtn').textContent), ensureHelpModal().querySelector('#tuneBtn').textContent);
  } finally {
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning(); applyLayout();
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Markup.** Replace the whole `<div id="tuneModal" class="modal"> … </div>` block (from `<!-- Tuning modal -->` through the closing `</div>` of `#tuneModal`, just before `<div id="ctxMenu"`) with:

```html
  <!-- Print settings (Help → Print settings) -->
  <div id="tuneModal" class="modal">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tuneTitle">
      <h2 id="tuneTitle">Print settings</h2>
      <div class="tune-layout">
        <div class="tune-fields">
          <div class="tune-row"><span>Paper</span>
            <div class="seg" role="radiogroup" aria-label="Paper">
              <label><input type="radio" name="paper" value="letter">Letter</label>
              <label><input type="radio" name="paper" value="a4">A4</label>
            </div>
          </div>
          <div class="tune-row"><span>Gap between cards</span>
            <div class="seg" role="radiogroup" aria-label="Gap between cards">
              <label><input type="radio" name="gap" value="0">0</label>
              <label><input type="radio" name="gap" value="1">1 mm</label>
              <label><input type="radio" name="gap" value="2">2 mm</label>
              <label><input type="radio" name="gap" value="3">3 mm</label>
            </div>
          </div>
          <div class="tune-row"><span title="Extra border colour around each card so slightly-off cuts don't show white">Bleed</span>
            <div class="seg" role="radiogroup" aria-label="Bleed">
              <label><input type="radio" name="bleed" value="0">Off</label>
              <label><input type="radio" name="bleed" value="1">1 mm</label>
              <label><input type="radio" name="bleed" value="2">2 mm</label>
              <label><input type="radio" name="bleed" value="3">3 mm</label>
            </div>
          </div>
          <div class="tune-row"><span>Cut lines</span>
            <div class="seg" role="radiogroup" aria-label="Cut-line style">
              <label title="Short marks in the page margin"><input type="radio" name="cutStyle" value="ticks">Ticks</label>
              <label title="Lines across the sheet through gaps and margins — for trimmers"><input type="radio" name="cutStyle" value="full">Full lines</label>
              <label title="L-marks at each card's corners — needs a gap"><input type="radio" name="cutStyle" value="corners">Corners</label>
            </div>
          </div>
          <p class="footnote" id="cutStyleHint" hidden>Corners need a gap between cards.</p>

          <details class="fine-tuning">
            <summary>Printer fine-tuning</summary>
            <div class="warning">⚠️ Only adjust these if your prints look clipped or misaligned. Most printers work with the defaults.</div>
            <div class="panel" style="display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end;">
              <label class="field" title="Adds extra white space above the grid so printers that can't print to the edge don't clip.">
                Top margin (in)
                <input id="tuneTopIn" type="number" step="0.01" min="0" value="0.25" style="width:120px">
              </label>
              <label class="field" title="Shifts the entire grid left/right relative to the page center. Positive = right.">
                Horizontal offset (in)
                <input id="tuneLeftIn" type="number" step="0.01" value="0.00" style="width:120px">
              </label>
              <label class="field" title="Exact card width in inches (affects grid and cut marks).">
                Card width (in)
                <input id="tuneCardWIn" type="number" step="0.001" min="2.400" max="2.600" style="width:120px">
              </label>
              <label class="field" title="Exact card height in inches (affects grid and cut marks).">
                Card height (in)
                <input id="tuneCardHIn" type="number" step="0.001" min="3.400" max="3.600" style="width:120px">
              </label>
              <label class="field" style="grid-column: 1 / span 2;" title="Change how images scale inside each cell.">
                <strong>Image fit mode</strong>
                <select id="fitMode">
                  <option value="cover" selected>Cover (fill & crop)</option>
                  <option value="contain">Contain (fit inside, may letterbox)</option>
                </select>
              </label>
              <label class="field" style="grid-column: 3; grid-row: 1 / span 2; align-self:end; justify-self:end;" title="When on, width/height stay proportional to 2.5×3.5 while you edit.">
                <input id="tuneScaleLock" type="checkbox" checked />
                Keep 2.5×3.5 ratio
              </label>
            </div>
          </details>
        </div>
        <div id="tunePreview" class="tune-preview" aria-hidden="true"></div>
      </div>

      <div id="tuneError" class="warning" role="alert" hidden></div>

      <div style="display:flex;gap:8px;align-items:center;">
        <button id="saveTuneBtn">Save</button>
        <button id="resetTuneBtn" class="secondary">Reset</button>
        <div class="right"></div>
        <button id="closeTuneBtn" class="secondary">Close</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: CSS.** Add before the line `:root[data-theme="dark"] body { … }`:

```css
    .tune-layout { display: flex; gap: 16px; align-items: flex-start; }
    .tune-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .tune-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 14px; }
    .seg { display: inline-flex; border: 1px solid #9ca3af; border-radius: 8px; overflow: hidden; }
    .seg label { position: relative; padding: 5px 10px; font-size: 13px; cursor: pointer; user-select: none; }
    .seg label + label { border-left: 1px solid #d1d5db; }
    .seg input { position: absolute; opacity: 0; pointer-events: none; }
    .seg label:has(input:checked) { background: #2563eb; color: #fff; }
    .seg label:has(input:disabled) { opacity: .45; cursor: default; }
    .seg label:has(input:focus-visible) { outline: 2px solid #2563eb; outline-offset: -2px; }
    .fine-tuning summary { cursor: pointer; font-weight: 600; font-size: 14px; margin: 4px 0; }
    .tune-preview { position: relative; width: 150px; flex: none; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.25); border-radius: 2px; }
    .tune-preview .tp-card { position: absolute; background: #374151; }
    .tune-preview .tp-bleed { position: absolute; background: #111827; }
    .tune-preview .tp-mark { position: absolute; background: #e11d48; min-width: 1px; min-height: 1px; }
    :root[data-theme="dark"] .seg label + label { border-left-color: #374151; }
```

- [ ] **Step 5: JS.** Replace `function openTune(){ … }` with:

```js
    function tuneRadio(name){ return tuneModal.querySelector('input[name="' + name + '"]:checked'); }
    function setTuneRadio(name, value){
      const r = tuneModal.querySelector('input[name="' + name + '"][value="' + value + '"]');
      if (r) r.checked = true;
    }

    // The settings as currently entered in the dialog (not yet saved).
    function readTuneDraft(){
      let w = parseFloat(tuneCardWIn.value), h = parseFloat(tuneCardHIn.value);
      if (tuneScaleLock && tuneScaleLock.checked){
        if (isFinite(w) && w > 0) h = +(w / BASE_W_IN * BASE_H_IN).toFixed(4);
        else if (isFinite(h) && h > 0) w = +(h / BASE_H_IN * BASE_W_IN).toFixed(4);
      }
      return Object.assign(currentLayoutSettings(), {
        paper: tuneRadio('paper') ? tuneRadio('paper').value : printSettings.paper,
        gapMm: Number(tuneRadio('gap') ? tuneRadio('gap').value : printSettings.gapMm),
        bleedMm: Number(tuneRadio('bleed') ? tuneRadio('bleed').value : printSettings.bleedMm),
        cutStyle: tuneRadio('cutStyle') ? tuneRadio('cutStyle').value : printSettings.cutStyle,
        topIn: parseFloat(tuneTopIn.value), leftIn: parseFloat(tuneLeftIn.value), cardWIn: w, cardHIn: h
      });
    }

    // Corners need a gap; with no gap, switch a Corners choice to Ticks.
    function refreshCutStyleChoices(){
      const noGap = !(Number(tuneRadio('gap') ? tuneRadio('gap').value : 0) > 0);
      const corners = tuneModal.querySelector('input[name="cutStyle"][value="corners"]');
      corners.disabled = noGap;
      if (noGap && corners.checked) setTuneRadio('cutStyle', 'ticks');
      document.getElementById('cutStyleHint').hidden = !noGap;
    }

    // Mini sheet preview of the draft settings.
    function renderTunePreview(){
      const box = document.getElementById('tunePreview');
      const draft = readTuneDraft();
      if (![draft.topIn, draft.leftIn, draft.cardWIn, draft.cardHIn].every(isFinite)) return;
      const L = computeLayout(draft);
      const scale = box.clientWidth / L.page.w;
      box.style.height = (L.page.h * scale) + 'px';
      box.innerHTML = '';
      const add = function(cls, r){
        const el = document.createElement('div'); el.className = cls;
        el.style.left = (r.x * scale) + 'px'; el.style.top = (r.y * scale) + 'px';
        el.style.width = (r.w * scale) + 'px'; el.style.height = (r.h * scale) + 'px';
        box.appendChild(el);
      };
      L.cards.forEach(function(c){ if (L.bleedIn > 0) add('tp-bleed', c.bleed); add('tp-card', c.trim); });
      L.cutMarks.forEach(function(m){ add('tp-mark', m); });
    }

    function openTune(){
      document.getElementById('tuneError').hidden = true;
      tuneTopIn.value   = readInchesVar('--grid-top', .25).toFixed(2);
      tuneLeftIn.value  = readInchesVar('--grid-left', 0).toFixed(2);
      tuneCardWIn.value = readInchesVar('--cell-w', 2.4750).toFixed(4);
      tuneCardHIn.value = readInchesVar('--cell-h', 3.4650).toFixed(4);
      setTuneRadio('paper', printSettings.paper);
      setTuneRadio('gap', String(printSettings.gapMm));
      setTuneRadio('bleed', String(printSettings.bleedMm));
      setTuneRadio('cutStyle', printSettings.cutStyle);
      tuneModal.querySelector('details.fine-tuning').open = false;

      try{
        const t = JSON.parse(localStorage.getItem('mtgTuning') || '{}');
        if (tuneScaleLock) tuneScaleLock.checked = (typeof t.scaleLock === 'undefined') ? true : !!t.scaleLock;
      }catch(_){
        if (tuneScaleLock) tuneScaleLock.checked = true;
      }

      refreshCutStyleChoices();
      openModal(tuneModal);
      renderTunePreview();
      const first = tuneRadio('paper'); if (first) first.focus();
    }

    tuneModal.addEventListener('change', function(e){
      if (e.target && e.target.name === 'gap') refreshCutStyleChoices();
      renderTunePreview();
    });
    tuneModal.addEventListener('input', function(){ renderTunePreview(); });
```

In the save handler (`saveTuneBtn.addEventListener('click', function(){ … })`) replace everything from `let w = parseFloat(tuneCardWIn.value);` down to and including `applyTuning(topIn, leftIn, w, h);` with:

```js
        const draft = readTuneDraft();
        tuneCardWIn.value = draft.cardWIn.toFixed(4);
        tuneCardHIn.value = draft.cardHIn.toFixed(4);
        const tuneError = document.getElementById('tuneError');
        const problem = computeLayout(draft).problem;
        if (problem){
          tuneError.textContent = problem;
          tuneError.hidden = false;
          return;
        }
        tuneError.hidden = true;

        savePrintSettings({ paper: draft.paper, gapMm: draft.gapMm, bleedMm: draft.bleedMm, cutStyle: draft.cutStyle });
        applyTuning(draft.topIn, draft.leftIn, draft.cardWIn, draft.cardHIn);
```

In the reset handler add, after `if (tuneScaleLock) tuneScaleLock.checked = true;`:

```js
        setTuneRadio('gap', '0');
        setTuneRadio('bleed', '0');
        setTuneRadio('cutStyle', 'ticks');
        refreshCutStyleChoices();
        renderTunePreview();
```

In `ensureHelpModal`, change the button `<button id="tuneBtn" class="secondary" title="Printer tuning (margins/offset)">Advanced</button>` to `<button id="tuneBtn" class="secondary" title="Paper, gaps, bleed, cut lines and printer tuning">Print settings</button>`.

- [ ] **Step 6: Run `tests-advanced.js` — expect all PASS (17).** Run the regression suites (102 — `tests-remaining.js` "tuning limits" uses `#tuneCardWIn`, `#saveTuneBtn` and `[role="alert"]`, which are unchanged), `tests-render.js`, `tests-bleed.js`, and the real-print baseline gate. Take a screenshot of the open dialog (light theme) and check it looks tidy; fix spacing if it doesn't.

- [ ] **Step 7: Commit** — `feat: print settings dialog (paper, gap, bleed, cut lines, fine-tuning)`.

---

### Task 7: Ripple insert / remove helpers

**Files:**
- Create: `.claude/tests/tests-ripple.js`
- Modify: `MTG Proxy Maker.html` — add the helpers right after the `/* ===== Remove gaps ===== */` block (after the `removeGapsBtn` listener)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-ripple.js`:

```js
// rippleInsert / rippleRemove: shift only up to the next empty cell; spill to a new page; drop empty trailing pages.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const fresh = (n) => { window.confirm = () => true; clearAllPages(true); for (let i = 1; i < n; i++) addPage(); showPage(0); };
  const card = (name) => createUrlItem('https://example.invalid/' + name + '.png', { name, back: null });
  const put = (p, i, n) => { pages[p].items[i] = card(n); renderCell(pages[p], i); };
  const layout = () => pages.map(p => p.items.map(i => !i ? '.' : i.type === 'stored' ? '#' : i.name).join(' ')).join(' | ');
  await run('insert ripples to the next gap only', async () => {
    fresh(1); ['A','A','B','C',null,'D','E'].forEach((n, i) => n && put(0, i, n));
    rippleInsert(2, card('A'));
    ok('A A A B C D E', layout() === 'A A A B C D E . .', layout());
  });
  await run('insert into an empty cell just places it', async () => {
    fresh(1); put(0, 0, 'A'); rippleInsert(4, card('X'));
    ok('placed', layout() === 'A . . . X . . . .', layout());
  });
  await run('insert with no gap after spills to a new page', async () => {
    fresh(1); 'ABCDEFGHI'.split('').forEach((n, i) => put(0, i, n));
    rippleInsert(3, card('X'));
    ok('spilled', layout() === 'A B C X D E F G H | I . . . . . . . .', layout());
  });
  await run('insert crosses pages up to a gap', async () => {
    fresh(2); 'ABCDEFGHI'.split('').forEach((n, i) => put(0, i, n)); put(1, 0, 'J'); put(1, 2, 'K');
    rippleInsert(8, card('X'));
    ok('to page 2 gap', layout() === 'A B C D E F G H X | I J K . . . . . .', layout());
  });
  await run('remove ripples back to the next gap', async () => {
    fresh(1); ['A','B','C',null,'D'].forEach((n, i) => n && put(0, i, n));
    rippleRemove(0);
    ok('B C . . D', layout() === 'B C . . D . . . .', layout());
  });
  await run('remove drops pages left empty at the end', async () => {
    fresh(2); 'ABCDEFGHI'.split('').forEach((n, i) => put(0, i, n)); put(1, 0, 'J');
    rippleRemove(0);
    ok('one page left', pages.length === 1 && layout() === 'B C D E F G H I J', layout());
  });
  await run('stored images survive a move; clipboard cancelled', async () => {
    fresh(1);
    const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; cv.getContext('2d').fillRect(0, 0, 50, 70);
    const stored = await createStoredItemFromDataUrl(cv.toDataURL('image/png'));
    pages[0].items[0] = stored; renderCell(pages[0], 0); put(0, 1, 'B');
    internalCut(pages[0], 1);
    rippleInsert(0, card('X'));
    let blob = false; try { await imageStore.getBlob(stored.key); blob = true; } catch (_) {}
    ok('stored item moved, blob kept', pages[0].items[1] === stored && blob, layout());
    ok('internal clipboard cleared', internalClipboard === null, '');
  });
  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`rippleInsert is not defined`).

- [ ] **Step 3: Implement** — insert after the `removeGapsBtn` listener block:

```js

    /* ===== Ripple insert / remove =====
       Positions run in reading order across all pages (page 1 cell 1 … last page cell 9). Cards are
       moved, never cloned, so uploaded images keep their stored data. */
    function posToSlot(p){ return { page: Math.floor(p / CELLS_PER_PAGE), index: p % CELLS_PER_PAGE }; }
    function totalPositions(){ return pages.length * CELLS_PER_PAGE; }
    function itemAtPos(p){ const s = posToSlot(p); return pages[s.page] ? pages[s.page].items[s.index] : null; }
    function setItemAtPos(p, item){ const s = posToSlot(p); pages[s.page].items[s.index] = item; renderCell(pages[s.page], s.index); }

    // Puts `item` at position p. If p is taken, the cards from p up to the next empty cell each move
    // forward one cell; with no empty cell after p, a page is added at the end. Returns the slot.
    function rippleInsert(p, item){
      clearInternalClipboard();
      let e = p;
      while (e < totalPositions() && itemAtPos(e)) e++;
      if (e >= totalPositions()) appendPageSlot();
      for (let q = e; q > p; q--) setItemAtPos(q, itemAtPos(q - 1));
      setItemAtPos(p, item);
      saveState();
      return posToSlot(p);
    }

    // Removes (and discards) the card at p; the cards after it, up to the next empty cell, each move
    // back one cell. Pages left empty at the end are removed (one page always remains).
    function rippleRemove(p){
      const removed = itemAtPos(p);
      if (!removed) return false;
      clearInternalClipboard();
      discardItem(removed);
      let q = p;
      while (q + 1 < totalPositions() && itemAtPos(q + 1)){ setItemAtPos(q, itemAtPos(q + 1)); q++; }
      setItemAtPos(q, null);
      while (pages.length > 1 && !pages[pages.length - 1].items.some(Boolean)){ pages.pop().pageEl.remove(); }
      showPage(Math.min(currentPage, pages.length - 1));
      saveState();
      return true;
    }
```

- [ ] **Step 4: Run `tests-ripple.js` — expect all PASS (8).** Run the regression suites.

- [ ] **Step 5: Commit** — `feat: ripple insert/remove helpers`.

---

### Task 8: Card back asset and offline caching

**Files:**
- Create: `card-back.jpg` (repo root)
- Modify: `service-worker.js` — `SHELL_CACHE`, `APP_SHELL`

- [ ] **Step 1: Make the asset.** The source scan is `.superpowers/assets/card-back-source.webp` (1191 × 1701). Use the isolated Pillow environment `.claude/tests/.venv` (install Pillow there if missing: `.claude/tests/.venv/Scripts/python -m pip install -q pillow`). Run from `D:\Claude Projects\MTG Proxy Maker`:

```bash
.claude/tests/.venv/Scripts/python - <<'EOF'
import os
from PIL import Image
im = Image.open('.superpowers/assets/card-back-source.webp').convert('RGB')
crop = im.crop((78, 118, 1113, 1567))   # brown frame 953x1367 + even 41px black border = 2.5:3.5
assert crop.size == (1035, 1449), crop.size
for q in range(90, 69, -2):
    crop.save('card-back.jpg', 'JPEG', quality=q, optimize=True, progressive=True)
    size = os.path.getsize('card-back.jpg')
    if size <= 300 * 1024:
        break
print('quality', q, 'bytes', size, 'size', crop.size)
EOF
```

Expected: `size (1035, 1449)` and bytes ≤ 307200.

- [ ] **Step 2: Service worker.** In `service-worker.js` change `const SHELL_CACHE = 'mtg-proxy-shell-v2';` to `const SHELL_CACHE = 'mtg-proxy-shell-v3';` and the `APP_SHELL` array to:

```js
const APP_SHELL = [
  './MTG Proxy Maker.html',
  './manifest.json',
  './card-back.jpg'
];
```

- [ ] **Step 3: Verify.** Reload `http://127.0.0.1:8765/MTG%20Proxy%20Maker.html`, wait 2 s, then run in the page:

```js
await new Promise(r => setTimeout(r, 2000));
const r = await fetch('card-back.jpg', { cache: 'no-store' }); const b = await r.blob();
const im = await createImageBitmap(b);
const cached = !!(await (await caches.open('mtg-proxy-shell-v3')).match(new URL('card-back.jpg', location.href).href));
({ status: r.status, bytes: b.size, size: im.width + 'x' + im.height, cached, oldCacheGone: !(await caches.keys()).includes('mtg-proxy-shell-v2') })
```

Expected: status 200, bytes ≤ 307200, `1035x1449`, `cached: true`, `oldCacheGone: true`. Take a screenshot of the image (open `http://127.0.0.1:8765/card-back.jpg`) to confirm it is the approved crop.

- [ ] **Step 4: Commit** — `git add card-back.jpg service-worker.js` and commit `feat: default card back image, cached for offline use`.

---

### Task 9: Double-sided printing

**Files:**
- Create: `.claude/tests/tests-duplex.js`
- Modify: `MTG Proxy Maker.html` — print-settings dialog markup (duplex section), CSS (back pages, labels, choice dialog), JS (back pages, back image setting, DFC prompt, export/import of the back image, `Add missing DFC backs` state, print/preview hooks)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-duplex.js`:

```js
// Double-sided printing: back pages after each front, mirrored, DFC backs on request, back image setting.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const keep = localStorage.getItem('mtgTuning');
  const PX = 96, near = (a, b) => ['x','y','w','h'].every(k => Math.abs(a[k] - b[k]) < 0.002);
  const rel = (el, pg) => { const r = el.getBoundingClientRect(), p = pg.getBoundingClientRect(); return { x: (r.left - p.left) / PX, y: (r.top - p.top) / PX, w: r.width / PX, h: r.height / PX }; };
  const card = (n, back) => createUrlItem('https://example.invalid/' + n + '.png', { name: n, back: back || null });
  const clickChoice = (label) => { const b = [...document.querySelectorAll('#choiceModal button')].find(x => x.textContent.trim() === label); b.click(); };
  const waitFor = async (fn) => { for (let i = 0; i < 50; i++){ if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
  try {
    await run('back pages follow each front, mirrored', async () => {
      window.confirm = () => true; clearAllPages(true);
      savePrintSettings({ paper: 'letter', gapMm: 2, bleedMm: 0, duplex: true, dfcOnBack: false, backOffsetXIn: 0.05, backOffsetYIn: 0 }); applyLayout();
      for (let i = 0; i < 11; i++) createPlacement().put(card('C' + i));
      await syncBackPages();
      const order = [...pageWrap.querySelectorAll('.page')].map(p => p.classList.contains('back-page') ? 'B' : 'F').join('');
      ok('order F B F B', order === 'FBFB', order);
      enterPreview();
      const back = pages[0].backEl, L = computeLayout();
      const shown = (pg) => [...pg.querySelectorAll('.back-cell')].filter(c => c.style.display !== 'none');
      const cells = shown(back);
      ok('one back per filled cell', cells.length === 9 && shown(pages[1].backEl).length === 2, cells.length + ' / ' + shown(pages[1].backEl).length);
      ok('mirrored positions', cells.every(c => near(rel(c, back), L.backCards[+c.dataset.index].trim)), JSON.stringify(rel(cells[0], back)) + ' vs ' + JSON.stringify(L.backCards[0].trim));
      ok('default back image', cells.every(c => /card-back\.jpg$/.test(c.querySelector('img').src)), cells[0].querySelector('img').src);
      ok('labelled in preview', /Back of page 1/.test(back.textContent), back.textContent);
      exitPreview();
      ok('hidden outside preview/print', getComputedStyle(back).display === 'none', '');
    });
    await run('turning duplex off removes back pages', async () => {
      savePrintSettings({ duplex: false }); await syncBackPages();
      ok('none left', pageWrap.querySelectorAll('.back-page').length === 0, pageWrap.querySelectorAll('.back-page').length);
    });
    await run('DFC prompt: yes, and remove separately placed backs', async () => {
      window.confirm = () => true; clearAllPages(true);
      savePrintSettings({ duplex: false, dfcOnBack: null }); applyLayout();
      const p = createPlacement();
      p.put(card('Delver', 'https://example.invalid/Insectile.png')); p.put(card('Bolt')); p.put(card('Insectile'));
      pages[0].items[2] = createUrlItem('https://example.invalid/Insectile.png', { name: 'Delver', back: null }); renderCell(pages[0], 2);
      const done = setDuplex(true);
      ok('first question shown', await waitFor(() => /1 double-faced card/.test(document.getElementById('choiceModal').textContent)), document.getElementById('choiceModal').textContent);
      clickChoice('Yes, print them on the back');
      ok('second question shown', await waitFor(() => /separately placed back face/.test(document.getElementById('choiceModal').textContent)), document.getElementById('choiceModal').textContent);
      clickChoice('Remove them');
      await done;
      ok('answer saved', printSettings.dfcOnBack === true && printSettings.duplex === true, JSON.stringify(printSettings));
      ok('separate back removed', pages[0].items.filter(Boolean).map(i => i.name).join() === 'Delver,Bolt', pages[0].items.filter(Boolean).map(i => i.name).join());
      await syncBackPages();
      const backs = [...pages[0].backEl.querySelectorAll('.back-cell img')].map(i => i.src);
      ok('DFC back on the reverse, default back for others', /Insectile\.png$/.test(backs[0]) && /card-back\.jpg$/.test(backs[1]), backs.join(' | '));
      ok('Add missing DFC backs disabled', addDFCBacksBtn.disabled === true, '');
    });
    await run('DFC prompt: no', async () => {
      savePrintSettings({ duplex: false, dfcOnBack: null });
      const done = setDuplex(true);
      await waitFor(() => document.getElementById('choiceModal').classList.contains('open'));
      clickChoice('No, use the card back');
      await done;
      await syncBackPages();
      ok('answer saved', printSettings.dfcOnBack === false, String(printSettings.dfcOnBack));
      ok('DFC gets the card back', /card-back\.jpg$/.test(pages[0].backEl.querySelector('.back-cell img').src), pages[0].backEl.querySelector('.back-cell img').src);
      ok('button enabled again', addDFCBacksBtn.disabled === false, '');
    });
    await run('uploaded back image', async () => {
      const cv = document.createElement('canvas'); cv.width = 100; cv.height = 140; cv.getContext('2d').fillRect(0, 0, 100, 140);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      await setBackImageFile(new File([blob], 'back.png', { type: 'image/png' }));
      await syncBackPages();
      ok('stored and used', !!printSettings.backImageKey && /^blob:/.test(pages[0].backEl.querySelector('.back-cell img').src), printSettings.backImageKey);
      const full = await buildExportData('full');
      ok('full export carries it', !!full.images[printSettings.backImageKey] && full.tuning.backImageKey === printSettings.backImageKey, '');
      await resetBackImage(); await syncBackPages();
      ok('reset to default', printSettings.backImageKey === null && /card-back\.jpg$/.test(pages[0].backEl.querySelector('.back-cell img').src), '');
    });
    await run('import asks before changing print settings', async () => {
      savePrintSettings({ paper: 'letter', gapMm: 0 });
      const file = (tuning) => new File([JSON.stringify({ version: 1, mode: 'light', pages: [[null]], current: 0, tuning })], 'x.mtgproxy');
      let p = performImport(file(Object.assign({}, readSavedTuning(), { paper: 'a4', gapMm: 2 })));
      ok('asked', await waitFor(() => document.getElementById('choiceModal').classList.contains('open') && /different print settings/.test(document.getElementById('choiceModal').textContent)), document.getElementById('choiceModal').textContent);
      clickChoice('Keep mine'); await p;
      ok('kept mine', printSettings.paper === 'letter' && printSettings.gapMm === 0, JSON.stringify(printSettings));
      p = performImport(file(Object.assign({}, readSavedTuning(), { paper: 'a4', gapMm: 2 })));
      await waitFor(() => document.getElementById('choiceModal').classList.contains('open'));
      clickChoice("Use the file's"); await p;
      ok("used the file's", printSettings.paper === 'a4' && printSettings.gapMm === 2, JSON.stringify(printSettings));
      await performImport(file(Object.assign({}, readSavedTuning())));
      ok('same settings: no question', !document.getElementById('choiceModal').classList.contains('open'), '');
    });
  } finally {
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning(); applyLayout(); window.confirm = () => true; clearAllPages(true); await syncBackPages();
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`syncBackPages is not defined`).

- [ ] **Step 3: Markup.** In the print-settings dialog, insert right before `<details class="fine-tuning">`:

```html
          <div class="tune-row"><span>Double-sided printing</span>
            <input id="duplexToggle" type="checkbox" aria-label="Double-sided printing" />
          </div>
          <div class="tune-row" id="backImageRow"><span>Card back</span>
            <span style="display:flex;align-items:center;gap:8px;">
              <img id="backImageThumb" alt="Card back" style="width:36px;height:50px;object-fit:cover;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,.3)" />
              <label class="button secondary" style="padding:5px 10px;font-size:13px;">Upload…<input id="backImageInput" type="file" accept="image/*" style="display:none" /></label>
              <button id="backImageReset" class="secondary" style="padding:5px 10px;font-size:13px;">Reset</button>
            </span>
          </div>
```

and inside the fine-tuning `.panel`, after the `tuneScaleLock` label, add:

```html
              <label class="field" title="Moves the back side to line up with the front. Positive = right / down.">
                Back offset X (in)
                <input id="tuneBackX" type="number" step="0.01" value="0.00" style="width:120px">
              </label>
              <label class="field" title="Moves the back side to line up with the front. Positive = right / down.">
                Back offset Y (in)
                <input id="tuneBackY" type="number" step="0.01" value="0.00" style="width:120px">
              </label>
```

and add a choice dialog right after the closing `</div>` of `#tuneModal`:

```html
  <!-- In-app question dialog (askChoice) -->
  <div id="choiceModal" class="modal">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="choiceText" style="width:min(520px,92vw)">
      <p id="choiceText" style="margin:0;font-size:15px;line-height:1.5"></p>
      <div id="choiceButtons" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"></div>
    </div>
  </div>
```

- [ ] **Step 4: CSS.** Add after the bleed rules from Task 5:

```css
    /* Back pages: only in print preview and printing. */
    .page.back-page { display: none; }
    .back-cell { position: absolute; overflow: hidden; border-radius: 8px; display: grid; place-items: center; }
    .back-cell img { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: none; }
    .page.back-page.has-bleed .back-cell { border-radius: 0; background: var(--bleed-color, #000); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page.back-page .bleed-box { display: none; }
    .page.back-page.has-bleed .bleed-box { display: block; }
    .back-label { display: none; position: absolute; top: -26px; left: 0; font-size: 13px; font-weight: 600; color: #6b7280; }
    .preview-mode .back-label { display: block; }
    @media print { .back-label { display: none !important; } }
```

- [ ] **Step 5: JS — back pages.** Add after the ripple helpers (Task 7):

```js

    /* ===== Double-sided printing ===== */
    const DEFAULT_BACK_URL = 'card-back.jpg';
    let backImageUrl = DEFAULT_BACK_URL;

    // Resolves the back image setting to a URL; a stored upload that has gone missing (e.g. a
    // lightweight import) falls back to the default back.
    async function resolveBackImage(){
      if (!printSettings.backImageKey){ backImageUrl = DEFAULT_BACK_URL; return backImageUrl; }
      try{ backImageUrl = await imageStore.getUrl(printSettings.backImageKey); }
      catch(_){
        savePrintSettings({ backImageKey: null });
        backImageUrl = DEFAULT_BACK_URL;
        setStatus('Your uploaded card back wasn\'t available; using the default back');
      }
      return backImageUrl;
    }

    // What prints behind a card: its own back face when DFC backs go on the reverse, else the back image.
    function backSrcFor(item){
      if (!item) return null;
      if (printSettings.dfcOnBack === true && typeof item.back === 'string' && item.back) return item.back;
      return backImageUrl;
    }

    function ensureBackPage(model, index){
      if (model.backEl && model.backEl.isConnected){
        if (model.backEl.previousElementSibling !== model.pageEl) model.pageEl.after(model.backEl);
        return model.backEl;
      }
      const back = document.createElement('div');
      back.className = 'page back-page';
      back.setAttribute('aria-label', 'Back of printable page');
      const label = document.createElement('div'); label.className = 'back-label'; back.appendChild(label);
      model.backEl = back; model.backCells = [];
      for (let i = 0; i < CELLS_PER_PAGE; i++){
        const bleedBox = document.createElement('div'); bleedBox.className = 'bleed-box'; back.appendChild(bleedBox);
        const cell = document.createElement('div'); cell.className = 'back-cell'; cell.dataset.index = i;
        const img = document.createElement('img'); img.alt = ''; img.draggable = false; cell.appendChild(img);
        img.onload = function(){
          fitImage(img);
          const color = sampleBorderColor(img);
          bleedBox.style.background = color;
          cell.style.setProperty('--bleed-color', color);
        };
        back.appendChild(cell);
        model.backCells.push({ cell: cell, img: img, bleedBox: bleedBox, src: null });
      }
      model.pageEl.after(back);
      return back;
    }

    // Keeps one back page after each front page when double-sided printing is on (none when off).
    // Only changed images are reloaded, so printing straight after is safe.
    async function syncBackPages(){
      await resolveBackImage();
      const layout = currentLayout || computeLayout();
      const live = new Set();
      if (printSettings.duplex){
        pages.forEach(function(model, pi){
          const back = ensureBackPage(model, pi);
          live.add(back);
          back.querySelector('.back-label').textContent = 'Back of page ' + (pi + 1);
          back.classList.toggle('has-bleed', layout.bleedIn > 0);
          model.backCells.forEach(function(bc, i){
            const src = backSrcFor(model.items[i]);
            bc.cell.style.display = src ? '' : 'none';
            bc.bleedBox.style.visibility = src ? '' : 'hidden';
            placeBox(bc.cell, layout.backCards[i].trim);
            placeBox(bc.bleedBox, layout.backCards[i].bleed);
            if (src && bc.src !== src){
              bc.src = src;
              bc.img.removeAttribute('crossorigin');
              if (/^https:\/\/cards\.scryfall\.io\//i.test(src)) bc.img.crossOrigin = 'anonymous';
              bc.img.src = src;
            } else if (bc.img.complete && bc.img.naturalWidth) {
              fitImage(bc.img);
            }
          });
        });
      }
      pageWrap.querySelectorAll('.page.back-page').forEach(function(el){ if (!live.has(el)) el.remove(); });
      pages.forEach(function(model){ if (!live.has(model.backEl)) model.backEl = null; });
      refreshDfcButton();
      if (live.size){
        await Promise.all(Array.from(pageWrap.querySelectorAll('.back-page img')).map(function(img){
          return (!img.getAttribute('src') || (img.complete && img.naturalWidth)) ? null : new Promise(function(r){ img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
        }));
      }
    }

    // A function declaration (not a const) because saveState() and applyLayout() call it, and they can
    // run before this part of the script has executed; `var` keeps the timer usable that early too.
    var backPagesTimer = null;
    function scheduleBackPages(){
      clearTimeout(backPagesTimer);
      backPagesTimer = setTimeout(function(){ syncBackPages(); }, 150);
    }

    function refreshDfcButton(){
      if (!addDFCBacksBtn) return;
      const onReverse = printSettings.duplex && printSettings.dfcOnBack === true;
      addDFCBacksBtn.disabled = onReverse;
      addDFCBacksBtn.title = onReverse
        ? 'Double-faced cards print their back faces on the reverse (Print settings → Double-sided printing)'
        : 'Scan placed cards and add any missing DFC back faces';
    }

    // In-app question with buttons; resolves with the chosen button's value.
    function askChoice(text, buttons){
      const modal = document.getElementById('choiceModal');
      document.getElementById('choiceText').textContent = text;
      const row = document.getElementById('choiceButtons'); row.innerHTML = '';
      return new Promise(function(resolve){
        buttons.forEach(function(b, i){
          const btn = document.createElement('button');
          btn.textContent = b.label;
          if (i > 0) btn.className = 'secondary';
          btn.addEventListener('click', function(){ closeModal(modal); resolve(b.value); });
          row.appendChild(btn);
        });
        openModal(modal);
      });
    }

    // Turns double-sided printing on or off. Turning it on with double-faced cards in the layout asks
    // whether to print their back faces on the reverse, and offers to remove back faces that were
    // also placed as separate cards (they'd print twice).
    async function setDuplex(on){
      if (!on){ savePrintSettings({ duplex: false }); await syncBackPages(); return; }
      const urlItems = [];
      pages.forEach(function(m){ m.items.forEach(function(it){ if (it && it.type === 'url' && it.url) urlItems.push(it); }); });
      await backfillCardFaces(urlItems);
      const dfcs = urlItems.filter(function(it){ return typeof it.back === 'string' && it.back; });
      let dfcOnBack = printSettings.dfcOnBack;
      if (dfcs.length){
        dfcOnBack = await askChoice(
          'Print the back faces of your ' + dfcs.length + ' double-faced card' + (dfcs.length === 1 ? '' : 's') + ' on the reverse of their fronts?',
          [{ label: 'Yes, print them on the back', value: true }, { label: 'No, use the card back', value: false }]);
        if (dfcOnBack){
          const backKeys = new Set(dfcs.map(function(it){ return imageUrlKey(it.back); }));
          const separate = [];
          for (let p = 0; p < totalPositions(); p++){
            const it = itemAtPos(p);
            if (it && it.type === 'url' && backKeys.has(imageUrlKey(it.url))) separate.push(p);
          }
          if (separate.length){
            const remove = await askChoice(
              'You also have ' + separate.length + ' separately placed back face' + (separate.length === 1 ? '' : 's') + '. Remove ' + (separate.length === 1 ? 'it' : 'them') + '? (They\'d print twice.)',
              [{ label: 'Remove them', value: true }, { label: 'Keep them', value: false }]);
            if (remove) for (let i = separate.length - 1; i >= 0; i--) rippleRemove(separate[i]);
          }
        }
      }
      savePrintSettings({ duplex: true, dfcOnBack: dfcOnBack });
      saveState();
      await syncBackPages();
    }

    async function setBackImageFile(file){
      if (!file || !looksLikeImageFile(file)) return;
      const blob = file instanceof Blob ? file : null;
      const stored = await imageStore.storeBlob(blob, file.type || null);
      const old = printSettings.backImageKey;
      savePrintSettings({ backImageKey: stored.key });
      if (old) Promise.resolve(imageStore.delete(old)).catch(function(){});
      await syncBackPages();
      refreshBackThumb();
    }

    async function resetBackImage(){
      const old = printSettings.backImageKey;
      savePrintSettings({ backImageKey: null });
      if (old) Promise.resolve(imageStore.delete(old)).catch(function(){});
      await syncBackPages();
      refreshBackThumb();
    }

    async function refreshBackThumb(){
      const thumb = document.getElementById('backImageThumb');
      if (thumb) thumb.src = await resolveBackImage();
    }
```

- [ ] **Step 6: JS — hooks.**
  - At the end of `applyLayout()` (before `return layout;`) add `scheduleBackPages();`.
  - At the end of `function saveState(){ … }` (after the `try/catch`) add `scheduleBackPages();`.
  - Print button: replace the body of `printBtn.addEventListener('click', function(){ … })` with:
    ```js
      ctxHide();
      syncBackPages().then(function(){
        pages.forEach(p => p.pageEl.offsetHeight);
        window.print();
      });
    ```
    and the preview print button body (`previewPrintBtn.addEventListener('click', function(){ … })`) with the same three statements (without `ctxHide();`).
  - In `enterPreview()` add `syncBackPages();` after `syncCutMarksState();`.
  - In the `beforeprint` listener add `syncBackPages();` after `syncCutMarksState();` (best effort for Ctrl+P).
  - In `openTune()` add, before `refreshCutStyleChoices();`:
    ```js
      document.getElementById('duplexToggle').checked = !!printSettings.duplex;
      document.getElementById('tuneBackX').value = (printSettings.backOffsetXIn || 0).toFixed(2);
      document.getElementById('tuneBackY').value = (printSettings.backOffsetYIn || 0).toFixed(2);
      refreshBackThumb();
    ```
  - In `readTuneDraft()` add to the returned object: `backOffsetXIn: parseFloat(document.getElementById('tuneBackX').value) || 0, backOffsetYIn: parseFloat(document.getElementById('tuneBackY').value) || 0`.
  - In the save handler change the `savePrintSettings({ … })` call to also include `backOffsetXIn: draft.backOffsetXIn, backOffsetYIn: draft.backOffsetYIn`.
  - In the reset handler add `document.getElementById('tuneBackX').value = '0.00'; document.getElementById('tuneBackY').value = '0.00';`.
  - Wire the controls (after the `tuneModal.addEventListener('input', …)` line):
    ```js
    document.getElementById('duplexToggle').addEventListener('change', function(e){
      const on = e.target.checked;
      setDuplex(on).then(function(){ e.target.checked = !!printSettings.duplex; });
    });
    document.getElementById('backImageInput').addEventListener('change', function(e){
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (f) setBackImageFile(f);
    });
    document.getElementById('backImageReset').addEventListener('click', function(){ resetBackImage(); });
    ```
  - In the `init` IIFE, after `loadTuning();` add `syncBackPages();`.
  - Export (`buildExportData`): after the loop over pages and before the Scryfall `cachedImages` loop, add:
    ```js
      if (mode === 'full' && printSettings.backImageKey && !imagesData[printSettings.backImageKey]){
        try {
          const blob = await imageStore.getBlob(printSettings.backImageKey);
          imagesData[printSettings.backImageKey] = { mime: blob.type || 'image/png', data: await blobToBase64(blob) };
        } catch(err){ console.warn('Failed to export the card back image', err); }
      }
    ```
  - Import (`performImport`): in the loop that stores `data.images`, right after `remapImageKey(data.pages, key, stored.key);` add `if (data.tuning && data.tuning.backImageKey === key) data.tuning.backImageKey = stored.key;`. Then replace the whole "Restore tuning if present" block (`if (data.tuning){ try { localStorage.setItem('mtgTuning', JSON.stringify(data.tuning)); loadTuning(); } catch(_){} }`) with:
    ```js
      // Print settings are printer-specific: apply the file's only if they match ours or the user agrees.
      if (data.tuning && typeof data.tuning === 'object'){
        const mine = readSavedTuning() || {};
        const keys = ['paper','gapMm','bleedMm','cutStyle','duplex','dfcOnBack','backOffsetXIn','backOffsetYIn','topIn','leftIn','cardWIn','cardHIn','fitMode','scaleLock'];
        const theirsBack = data.tuning.backImageKey || null;
        const differs = keys.some(function(k){ return typeof data.tuning[k] !== 'undefined' && JSON.stringify(data.tuning[k]) !== JSON.stringify(mine[k]); })
          || (theirsBack !== (mine.backImageKey || null));
        const use = !differs || await askChoice('This file has different print settings (paper, gaps, bleed, printer offsets or card back). Use them?',
          [{ label: 'Keep mine', value: false }, { label: "Use the file's", value: true }]);
        if (use){
          try { localStorage.setItem('mtgTuning', JSON.stringify(Object.assign({}, mine, data.tuning))); loadTuning(); } catch(_){}
        } else if (theirsBack && theirsBack !== mine.backImageKey){
          Promise.resolve(imageStore.delete(theirsBack)).catch(function(){});
        }
        syncBackPages();
      }
    ```

- [ ] **Step 7: Run `tests-duplex.js` — expect all PASS (23).** Run the regression suites, `tests-render.js`, `tests-bleed.js`, `tests-advanced.js`, `tests-ripple.js`.

- [ ] **Step 8: Real-print gate + duplex geometry.** Baseline comparison must PASS (duplex off by default). Then:

```bash
node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry letter-duplex letter-bleed3 two-pages-cuts
```

Expected: `letter-duplex` PASS with `sheets 4/4 (FBFB)` and back cells within 0.001″ of `backCards`; the others still PASS. Delete `.claude/tests/print-out`.

- [ ] **Step 9: Commit** — `feat: double-sided printing with card backs and the DFC prompt`.

---

### Task 10: PDF export

**Files:**
- Create: `vendor/jspdf.umd.min.js`, `vendor/LICENSE-jspdf.txt`, `vendor/README.md`, `.claude/tests/pdf-check.py`, `.claude/tests/tests-pdf.js`
- Modify: `service-worker.js` (`SHELL_CACHE` v4, `APP_SHELL` adds the library), `MTG Proxy Maker.html` (export dialog option, `loadJsPdf`, `buildPdf`, `performExport` branch), `.claude/tests/print-harness.mjs` (`--pdf` mode)

- [ ] **Step 1: Vendor jsPDF 4.2.1** (download approved by the user before execution). From the repo root:

```bash
mkdir -p vendor
curl -sSfL -o vendor/jspdf.umd.min.js https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js
curl -sSfL -o vendor/LICENSE-jspdf.txt https://raw.githubusercontent.com/parallax/jsPDF/v4.2.1/LICENSE
head -c 300 vendor/jspdf.umd.min.js; echo; grep -c "MIT" vendor/LICENSE-jspdf.txt; sha256sum vendor/jspdf.umd.min.js; wc -c vendor/jspdf.umd.min.js
```

Expected: the file starts with a jsPDF banner, the licence contains "MIT". Write `vendor/README.md` with the exact version, both source URLs, the SHA-256 and byte size printed above:

```markdown
# Vendored libraries

| File | Library | Version | Source | SHA-256 |
|---|---|---|---|---|
| `jspdf.umd.min.js` | jsPDF (MIT, see `LICENSE-jspdf.txt`) | 4.2.1 | https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js | <sha256 from above> |

Loaded on demand by the PDF export (Export → PDF). Precached by `service-worker.js` for offline use.
```

- [ ] **Step 2: Service worker.** `const SHELL_CACHE = 'mtg-proxy-shell-v4';` and add `'./vendor/jspdf.umd.min.js'` to `APP_SHELL`.

- [ ] **Step 3: Write the in-page test** — create `.claude/tests/tests-pdf.js`:

```js
// PDF export UI + builder smoke test (geometry is checked from the file by pdf-check.py).
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  await run('export dialog offers PDF with quality and an estimate', async () => {
    const m = ensureExportModal(); openModal(m);
    const pdf = m.querySelector('input[name="exportMode"][value="pdf"]');
    ok('PDF option present', !!pdf, '');
    pdf.checked = true; pdf.dispatchEvent(new Event('change', { bubbles: true }));
    ok('quality choices shown', getComputedStyle(m.querySelector('#pdfOptions')).display !== 'none' && m.querySelectorAll('input[name="pdfQuality"]').length === 2, '');
    ok('JPEG default', m.querySelector('input[name="pdfQuality"]:checked').value === 'jpeg', '');
    ok('actual-size reminder', /Actual size/.test(m.textContent), '');
    for (let i = 0; i < 40 && /Estimating/.test(m.querySelector('#pdfEstimate').textContent); i++) await new Promise(r => setTimeout(r, 100));
    ok('estimate shown', /about .* MB|under 1 MB/.test(m.querySelector('#pdfEstimate').textContent), m.querySelector('#pdfEstimate').textContent);
    closeModal(m);
  });
  await run('builder produces a PDF', async () => {
    window.confirm = () => true; clearAllPages(true);
    const cv = document.createElement('canvas'); cv.width = 745; cv.height = 1040; cv.getContext('2d').fillRect(0, 0, 745, 1040);
    const item = await createStoredItemFromDataUrl(cv.toDataURL('image/png'));
    createPlacement().put(item); createPlacement().put(await cloneItem(item));
    const blob = await buildPdf('jpeg');
    const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    ok('PDF header', String.fromCharCode(...head) === '%PDF-', String.fromCharCode(...head));
    ok('library loaded once', typeof window.jspdf === 'object', '');
  });
  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 4: Write the file checker** — create `.claude/tests/pdf-check.py`:

```python
"""Check an exported PDF against the expectations written by print-harness.mjs --pdf.

usage: .venv/Scripts/python pdf-check.py <scenario>-export.pdf <scenario>-export.json
Checks: page count, page size, every placed image's rectangle (0.05 pt), each distinct image embedded
once, and cut-mark count per front page. Exits 1 on any mismatch.
"""
import sys, json
import pymupdf

pdf_path, exp_path = sys.argv[1], sys.argv[2]
exp = json.load(open(exp_path))
doc = pymupdf.open(pdf_path)
fail = []
if doc.page_count != len(exp['sheets']):
    fail.append(f"pages {doc.page_count} vs {len(exp['sheets'])}")
xrefs = set()
for i, sheet in enumerate(exp['sheets'][:doc.page_count]):
    page = doc[i]
    if abs(page.rect.width - exp['pageW']) > 0.5 or abs(page.rect.height - exp['pageH']) > 0.5:
        fail.append(f"p{i+1} size {page.rect.width}x{page.rect.height}")
    infos = page.get_image_info(xrefs=True)
    got = sorted([(round(b['bbox'][0], 1), round(b['bbox'][1], 1), round(b['bbox'][2], 1), round(b['bbox'][3], 1)) for b in infos])
    want = sorted([(round(r[0], 1), round(r[1], 1), round(r[2], 1), round(r[3], 1)) for r in sheet['images']])
    if len(got) != len(want) or any(max(abs(a - b) for a, b in zip(g, w)) > 0.05 for g, w in zip(got, want)):
        fail.append(f"p{i+1} images {got[:3]}… vs {want[:3]}…")
    xrefs.update(b['xref'] for b in infos)
    if 'marks' in sheet:
        # cut marks are filled shapes about 0.9 pt thick; bleed rectangles are much larger
        rects = [d for d in page.get_drawings() if d.get('fill') is not None and min(d['rect'].width, d['rect'].height) < 2]
        if len(rects) < sheet['marks']:
            fail.append(f"p{i+1} cut marks {len(rects)} < {sheet['marks']}")
if len(xrefs) != exp['distinctImages']:
    fail.append(f"distinct images embedded {len(xrefs)} vs {exp['distinctImages']}")
print('FAIL ' + '; '.join(fail) if fail else f"PASS {pdf_path}: {doc.page_count} pages, {len(xrefs)} distinct images")
sys.exit(1 if fail else 0)
```

- [ ] **Step 5: Add `--pdf` to the harness.** In `.claude/tests/print-harness.mjs`:
  - after `const geometry = argv.includes('--geometry');` add `const pdfMode = argv.includes('--pdf');` and change the filter to `argv.filter(a => a !== '--geometry' && a !== '--pdf')`;
  - add this script constant after `GEOMETRY`:
    ```js
    const EXPORT_PDF = `(async () => {
      const blob = await buildPdf('jpeg');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { pdf: btoa(bin), expect: pdfExpectations() };
    })()`;
    ```
  - inside the scenario loop, after writing the print PDF/JSON, add:
    ```js
        if (pdfMode) {
          const res = await evaluate(EXPORT_PDF);
          fs.writeFileSync(path.join(outDir, name + '-export.pdf'), Buffer.from(res.pdf, 'base64'));
          fs.writeFileSync(path.join(outDir, name + '-export.json'), JSON.stringify(res.expect));
          console.log(name + ': exported PDF written');
        }
    ```

- [ ] **Step 6: Export dialog markup.** In `ensureExportModal`, after the Lightweight `<label class="field"> … </label>` add:

```html
              <label class="field">
                <input type="radio" name="exportMode" value="pdf" />
                <strong>PDF (ready to print)</strong> — exact page size; print it at "Actual size / 100%"
              </label>
              <div id="pdfOptions" style="display:none;margin-left:28px;flex-direction:column;gap:6px;font-size:13px;">
                <label class="field"><input type="radio" name="pdfQuality" value="jpeg" checked /> High-quality JPEG (smaller file)</label>
                <label class="field"><input type="radio" name="pdfQuality" value="png" /> Original PNG (exact pixels, large file)</label>
                <span id="pdfEstimate" class="footnote">Estimating…</span>
                <span class="footnote">In the print dialog choose <b>Actual size</b> (100%), not "Fit to page".</span>
              </div>
```

and in the same function, after `setupModalBackdrop(exportModal);`, add:

```js
      exportModal.addEventListener('change', function(e){
        if (e.target.name !== 'exportMode' && e.target.name !== 'pdfQuality') return;
        const isPdf = (exportModal.querySelector('input[name="exportMode"]:checked') || {}).value === 'pdf';
        exportModal.querySelector('#pdfOptions').style.display = isPdf ? 'flex' : 'none';
        if (isPdf) updatePdfEstimate();
      });
```

- [ ] **Step 7: JS — the PDF builder.** Add after `function blobToBase64(blob){ … }`:

```js
    /* ===== PDF export ===== */
    let jsPdfPromise = null;
    function loadJsPdf(){
      if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
      if (!jsPdfPromise){
        jsPdfPromise = new Promise(function(resolve, reject){
          const s = document.createElement('script');
          s.src = 'vendor/jspdf.umd.min.js';
          s.onload = function(){ window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf) : reject(new Error('jsPDF failed to initialise')); };
          s.onerror = function(){ jsPdfPromise = null; reject(new Error('Could not load the PDF library')); };
          document.head.appendChild(s);
        });
      }
      return jsPdfPromise;
    }

    // The sheets a print or PDF contains, in order: each front page, then its back when double-sided.
    function printSheets(){
      const sheets = [];
      pages.forEach(function(m){ sheets.push({ model: m, back: false }); if (printSettings.duplex) sheets.push({ model: m, back: true }); });
      return sheets;
    }

    async function sheetSources(){
      await resolveBackImage();
      const out = [];
      for (const sheet of printSheets()){
        const cells = [];
        for (let i = 0; i < CELLS_PER_PAGE; i++){
          const item = sheet.model.items[i];
          if (!item){ cells.push(null); continue; }
          if (sheet.back){ cells.push({ src: backSrcFor(item), key: null }); continue; }
          const src = await resolveItemSrc(item);
          cells.push(src ? { src: src, key: item.type === 'stored' ? item.key : null } : null);
        }
        out.push({ back: sheet.back, cells: cells });
      }
      return out;
    }

    async function sourceBlob(c){
      if (c.key) return imageStore.getBlob(c.key);
      const r = await fetch(c.src, { mode: 'cors' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }

    async function updatePdfEstimate(){
      const el = exportModal && exportModal.querySelector('#pdfEstimate');
      if (!el) return;
      el.textContent = 'Estimating…';
      const seen = new Map();
      for (const sheet of await sheetSources()) for (const c of sheet.cells){
        if (!c || seen.has(c.src)) continue;
        try { seen.set(c.src, (await sourceBlob(c)).size); } catch(_){ seen.set(c.src, 0); }
      }
      let bytes = Array.from(seen.values()).reduce(function(a, b){ return a + b; }, 0);
      const q = (exportModal.querySelector('input[name="pdfQuality"]:checked') || {}).value;
      if (q !== 'png') bytes = bytes / 4;
      el.textContent = bytes < 1024 * 1024 ? 'Estimated size: under 1 MB' : 'Estimated size: about ' + Math.round(bytes / (1024 * 1024)) + ' MB';
    }

    // Draws every sheet from computeLayout: bleed rectangles, card images clipped to the card
    // (rounded like the printed cell when there's no bleed), cut marks as vector rectangles. Each
    // distinct image is embedded once. Returns a Blob.
    async function buildPdf(quality){
      const lib = await loadJsPdf();
      const layout = applyLayout();
      const PT = 72, R = 8 / 96;   // the cells' 8px corner radius, in inches
      const doc = new lib.jsPDF({ unit: 'pt', format: [layout.page.w * PT, layout.page.h * PT], orientation: 'portrait', compress: true });
      const sheets = await sheetSources();
      const images = new Map();
      let done = 0, missing = 0;
      const total = new Set(sheets.flatMap(function(s){ return s.cells.filter(Boolean).map(function(c){ return c.src; }); })).size;
      for (const sheet of sheets) for (const c of sheet.cells){
        if (!c || images.has(c.src)) continue;
        setStatus('Building PDF: ' + (++done) + '/' + total + ' images…');
        try{
          const blob = await sourceBlob(c);
          const bmp = await createImageBitmap(blob);
          const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
          cv.getContext('2d').drawImage(bmp, 0, 0);
          const isPng = quality === 'png' && /png/i.test(blob.type);
          const data = isPng ? new Uint8Array(await blob.arrayBuffer()) : cv.toDataURL('image/jpeg', 0.92);
          images.set(c.src, { data: data, format: isPng ? 'PNG' : 'JPEG', w: bmp.width, h: bmp.height, color: borderColorFromSource(bmp, bmp.width, bmp.height), alias: 'img' + images.size });
        }catch(err){
          console.warn('PDF: could not read image', c.src, err);
          images.set(c.src, null);
          missing++;
        }
      }
      const fit = fitModeSelect.value;
      const rgb = function(s){ const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s) || [0, 0, 0, 0]; return [+m[1], +m[2], +m[3]]; };
      sheets.forEach(function(sheet, si){
        if (si > 0) doc.addPage([layout.page.w * PT, layout.page.h * PT], 'portrait');
        const boxes = sheet.back ? layout.backCards : layout.cards;
        sheet.cells.forEach(function(c, i){
          const im = c && images.get(c.src);
          if (!im) return;
          const t = boxes[i].trim, b = boxes[i].bleed;
          if (layout.bleedIn > 0){
            doc.setFillColor.apply(doc, rgb(im.color));
            doc.rect(b.x * PT, b.y * PT, b.w * PT, b.h * PT, 'F');
            doc.rect(t.x * PT, t.y * PT, t.w * PT, t.h * PT, 'F');
          }
          const d = computeFitDims(im.w, im.h, t.w, t.h, fit);
          doc.saveGraphicsState();
          if (layout.bleedIn > 0) doc.rect(t.x * PT, t.y * PT, t.w * PT, t.h * PT, null);
          else doc.roundedRect(t.x * PT, t.y * PT, t.w * PT, t.h * PT, R * PT, R * PT, null);
          doc.clip(); doc.discardPath();
          doc.addImage(im.data, im.format, (t.x + (t.w - d.w) / 2) * PT, (t.y + (t.h - d.h) / 2) * PT, d.w * PT, d.h * PT, im.alias, 'NONE');
          doc.restoreGraphicsState();
        });
        if (!sheet.back && toggleCutMarks.checked){
          doc.setFillColor(53, 59, 71);   // rgba(17,24,39,.85) over white, as printed
          layout.cutMarks.forEach(function(m){
            const r = Math.min(m.w, m.h) / 2 * PT;
            doc.roundedRect(m.x * PT, m.y * PT, m.w * PT, m.h * PT, r, r, 'F');
          });
        }
      });
      setStatus('PDF ready' + (missing ? ' — ' + missing + ' image(s) couldn\'t be included' : ''));
      return doc.output('blob');
    }

    // What pdf-check.py expects for the current layout (used by the test harness).
    async function pdfExpectations(){
      const layout = currentLayout || computeLayout(), PT = 72, fit = fitModeSelect.value;
      const sheets = await sheetSources(), dims = new Map();
      for (const s of sheets) for (const c of s.cells){
        if (!c || dims.has(c.src)) continue;
        const bmp = await createImageBitmap(await sourceBlob(c)); dims.set(c.src, [bmp.width, bmp.height]);
      }
      return {
        pageW: layout.page.w * PT, pageH: layout.page.h * PT, distinctImages: dims.size,
        sheets: sheets.map(function(s){
          const boxes = s.back ? layout.backCards : layout.cards;
          const out = { images: s.cells.map(function(c, i){
            if (!c) return null;
            const t = boxes[i].trim, d = computeFitDims(dims.get(c.src)[0], dims.get(c.src)[1], t.w, t.h, fit);
            const x = t.x + (t.w - d.w) / 2, y = t.y + (t.h - d.h) / 2;
            return [x * PT, y * PT, (x + d.w) * PT, (y + d.h) * PT];
          }).filter(Boolean) };
          if (!s.back && toggleCutMarks.checked) out.marks = layout.cutMarks.length;
          return out;
        })
      };
    }
```

In `performExport(mode)`, make the first lines:

```js
    async function performExport(mode){
      if (mode === 'pdf'){
        const quality = (exportModal.querySelector('input[name="pdfQuality"]:checked') || {}).value || 'jpeg';
        const blob = await buildPdf(quality);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'deck-layout-' + new Date().toISOString().slice(0,10) + '.pdf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
```

- [ ] **Step 8: Run `tests-pdf.js` — expect all PASS (7).** Then the file checks:

```bash
node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --pdf two-pages-cuts a4-gap2-bleed1 letter-duplex
for s in two-pages-cuts a4-gap2-bleed1 letter-duplex; do .claude/tests/.venv/Scripts/python .claude/tests/pdf-check.py .claude/tests/print-out/$s-export.pdf .claude/tests/print-out/$s-export.json; done
```

Expected: three `PASS` lines; `letter-duplex` shows 4 pages; distinct images = 11 cards + 1 back = 12. Render page 1 of `two-pages-cuts-export.pdf` and of the print PDF `two-pages-cuts.pdf` at 100 DPI and view both side by side (screenshots) to confirm they look the same. Delete `.claude/tests/print-out`. Run the regression suites and the real-print baseline gate.

- [ ] **Step 9: Commit** — `git add vendor service-worker.js "MTG Proxy Maker.html"` and commit `feat: PDF export (jsPDF 4.2.1, vendored)`.

---

### Task 11: Final verification

- [ ] **Step 1:** Fresh page load; run every in-page suite: the 8 regression files plus `tests-toggles.js`, `tests-print-settings.js`, `tests-layout.js`, `tests-render.js`, `tests-bleed.js`, `tests-advanced.js`, `tests-ripple.js`, `tests-duplex.js`, `tests-pdf.js`. All PASS.
- [ ] **Step 2:** Real-print baseline gate (pixel-identical defaults) — PASS.
- [ ] **Step 3:** Geometry matrix — all PASS:
  ```bash
  node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry one-page-plain two-pages-cuts tuned-full-size letter-gap2-full a4-plain a4-gap2-corners letter-bleed3 a4-gap2-bleed1 letter-duplex
  ```
- [ ] **Step 4:** PDF checks (Task 10 Step 8) — PASS.
- [ ] **Step 5:** Console check: no `TypeError`/`ReferenceError` during the runs.
- [ ] **Step 6:** Report to the controller with all outputs. The controller then asks the user for the real paper test (spec section 0, item 5) before merging and pushing.
