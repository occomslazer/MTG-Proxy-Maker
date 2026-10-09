# Centred Grid and Safe Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centre the card grid vertically (Top margin → Vertical offset, saved margins converted) and grey out paper/gap/bleed choices that would put cards within 4 mm of an edge.

**Architecture:** The calculator's `topIn` input becomes `offsetYIn`, and `grid.y = (page.h − grid.h)/2 + offsetYIn`, mirroring the horizontal rule. One function, `migrateTuning(t)`, converts saved or imported `topIn` values. A pure `safeMarginOf(settings)` measures the smallest edge distance with offsets at 0, and the Print settings dialog uses it to disable choices. Default prints move down 1.3 mm on purpose; the reference prints are replaced only after a shift-and-compare proof.

**Tech Stack:** `MTG Proxy Maker.html` (vanilla JS/CSS), in-page test suites, `.claude/tests/print-harness.mjs`, PyMuPDF/Pillow in `.claude/tests/.venv`.

**Spec:** `docs/superpowers/specs/2026-10-08-centered-grid-and-safe-options-design.md`

---

## Conventions

- **Branch:** `feat/centered-grid`. Never push. Never switch branches.
- **App file:** locate code by the quoted text. The working copy uses CRLF line endings; keep them. The Edit/Write tools turn `\uXXXX` escapes into literal characters, so don't write `\u` escapes.
- **Server:** `mcp__Claude_Browser__preview_start` with `name: "proxy-maker"`. Always use `http://127.0.0.1:8765/...`. If the viewport is 0×0, emulate 1400×900 and reset it afterwards.
- **Saved state:** save and restore the user's localStorage (`mtgProxyPages`, `mtgTuning`, `mtgThemeDark`, `mtgDeckPanelOpen`) around all runs.
- **Run a suite / regression runner:** exactly as in `docs/superpowers/plans/2026-10-07-batch2-deck-tools.md` → "Conventions for every task".
- **Suites that must stay green** (update expectations only where this plan changes behaviour, and list every expectation you change):
  - regression 102
  - toggles 6, print-settings 19, layout 39, render 7, bleed 15, advanced 39, ripple 43, duplex 135, pdf 85
  - deck-data 20, deck-rows 20, deck-panel 61, deck-plusminus 34, art-picker 48, tokens 43
- **Commits:** one per task, plus fix commits. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No TODO/FIXME comments. `.claude/` is git-excluded.

---

### Task 1: Centred grid with a vertical offset

**Files:**
- Create: `.claude/tests/tests-centering.js`
- Modify: `MTG Proxy Maker.html`:
  - CSS variable
  - `currentLayoutSettings`, `computeLayout`, `layoutProblem`
  - `DEFAULT_TUNING`, `roundTuning`, `applyTuning`, `tuningProblem`
  - `migrateTuning` (new), `loadTuning`, `importPrintSettings`
  - the fine-tuning markup, `readTuneDraft`, `renderTunePreview`, `openTune`, the Save and Reset handlers
- Modify: `.claude/tests/print-harness.mjs` (SETUP and scenarios), plus every existing suite that uses `topIn`/`tuneTopIn`/`--grid-top`
- Modify: `README.md` (fine-tuning steps), and in the earlier spec `docs/superpowers/specs/2026-10-06-print-pipeline-and-deck-tools-design.md` section 2.1 (y0 formula and fit rule; add "see 2026-10-08 spec")

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-centering.js`:

```js
// Vertical centring: grid.y = (page.h − grid.h)/2 + offsetYIn; saved/imported topIn converted
// (0.25 → centred); dialog field "Vertical offset"; fit messages.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + (e && e.stack || e)); } };
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const keep = localStorage.getItem('mtgTuning');
  const base = { paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks', offsetYIn: 0, leftIn: 0, cardWIn: 2.475, cardHIn: 3.465, backOffsetXIn: 0, backOffsetYIn: 0 };
  try {
    await run('calculator centres vertically', async () => {
      const L = computeLayout(base);
      ok('letter default top = (11 − 10.395)/2', near(L.grid.y, (11 - 10.395) / 2), L.grid.y);
      ok('bottom margin equals top', near(11 - (L.grid.y + L.grid.h), L.grid.y), (11 - L.grid.y - L.grid.h) + ' vs ' + L.grid.y);
      const G = computeLayout(Object.assign({}, base, { gapMm: 3 }));
      ok('3 mm gap: 4.7 mm each side', near(G.grid.y, (11 - (3 * 3.465 + 2 * 3 / 25.4)) / 2) && Math.abs(G.grid.y * 25.4 - 4.68) < 0.01, G.grid.y * 25.4);
      const O = computeLayout(Object.assign({}, base, { offsetYIn: 0.1 }));
      ok('offset moves down', near(O.grid.y, L.grid.y + 0.1), O.grid.y);
      const A = computeLayout(Object.assign({}, base, { paper: 'a4' }));
      ok('A4 centred', near(A.grid.y, (297 / 25.4 - 10.395) / 2), A.grid.y);
      ok('back pages follow', near(L.backCards[0].trim.y, L.cards[0].trim.y), L.backCards[0].trim.y);
    });
    await run('fit rules', async () => {
      ok('offset off the bottom rejected', /off the page|don.t fit/i.test(computeLayout(Object.assign({}, base, { offsetYIn: 0.4 })).problem), computeLayout(Object.assign({}, base, { offsetYIn: 0.4 })).problem);
      ok('offset off the top rejected', /off the page|don.t fit/i.test(computeLayout(Object.assign({}, base, { offsetYIn: -0.4 })).problem), '');
      ok('small offset fine', computeLayout(Object.assign({}, base, { offsetYIn: 0.3 })).problem === '', computeLayout(Object.assign({}, base, { offsetYIn: 0.3 })).problem);
      ok('too tall named', /tall/.test(computeLayout(Object.assign({}, base, { cardHIn: 3.7 })).problem), computeLayout(Object.assign({}, base, { cardHIn: 3.7 })).problem);
    });
    await run('migrating saved topIn', async () => {
      const m1 = migrateTuning({ topIn: 0.25, leftIn: 0, cardWIn: 2.475, cardHIn: 3.465, paper: 'letter', gapMm: 0, bleedMm: 0 });
      ok('0.25 becomes centred', m1.offsetYIn === 0 && !('topIn' in m1), JSON.stringify(m1));
      const m2 = migrateTuning({ topIn: 0.4, leftIn: 0.1, cardWIn: 2.5, cardHIn: 3.5, paper: 'letter', gapMm: 0, bleedMm: 0 });
      ok('custom top keeps its place', near(m2.offsetYIn, 0.15) && !('topIn' in m2), JSON.stringify(m2));
      const m3 = migrateTuning({ topIn: 0.1, cardWIn: 2.475, cardHIn: 3.465, paper: 'letter', gapMm: 3, bleedMm: 0 });
      ok('uses saved gap', near(m3.offsetYIn, +(0.1 - (11 - (10.395 + 2 * 3 / 25.4)) / 2).toFixed(2)), JSON.stringify(m3));
      const m4 = migrateTuning({ offsetYIn: 0.05, topIn: 0.4 });
      ok('existing offset wins', m4.offsetYIn === 0.05 && !('topIn' in m4), JSON.stringify(m4));
      const m5 = migrateTuning({ paper: 'a4' });
      ok('no geometry: unchanged', !('offsetYIn' in m5) && !('topIn' in m5), JSON.stringify(m5));
    });
    await run('loading converts and stores the offset', async () => {
      localStorage.setItem('mtgTuning', JSON.stringify({ topIn: 0.4, leftIn: 0, cardWIn: 2.5, cardHIn: 3.5, paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks' }));
      loadTuning();
      const t = JSON.parse(localStorage.getItem('mtgTuning'));
      ok('stored as offset', near(t.offsetYIn, 0.15) && !('topIn' in t), JSON.stringify(t));
      ok('grid stays at 0.4', near(computeLayout().grid.y, 0.4), computeLayout().grid.y);
    });
    await run('dialog field', async () => {
      localStorage.setItem('mtgTuning', JSON.stringify({ offsetYIn: 0.12, leftIn: 0, cardWIn: 2.475, cardHIn: 3.465, paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks' }));
      loadTuning(); openTune();
      const f = document.getElementById('tuneOffsetYIn');
      ok('Vertical offset field', f && f.value === '0.12' && /Vertical offset/.test(f.closest('label').textContent) && !document.getElementById('tuneTopIn'), f && f.outerHTML);
      document.getElementById('resetTuneBtn').click();
      ok('Reset sets 0', f.value === '0.00', f.value);
      f.value = '0.05'; f.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('saveTuneBtn').click();
      await new Promise(r => setTimeout(r, 50));
      ok('saved', near(JSON.parse(localStorage.getItem('mtgTuning')).offsetYIn, 0.05) && near(computeLayout().grid.y, (11 - 10.395) / 2 + 0.05), localStorage.getItem('mtgTuning'));
    });
  } finally {
    if (tuneModal.classList.contains('open')) closeModal(tuneModal);
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning();
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`migrateTuning is not defined`; letter top is 0.25).

- [ ] **Step 3: Calculator.**

In the `:root` CSS, replace `--grid-top: 0.25in;` with `--grid-offset-y: 0in;`. Grep for any other use of `--grid-top` in CSS and update it.

In `currentLayoutSettings`, replace `topIn: readInchesVar('--grid-top', 0.25),` with `offsetYIn: readInchesVar('--grid-offset-y', 0),`.

In `computeLayout`, replace `grid.y = s.topIn;` with:

```js
      // Centred on the page both ways; the printer offsets shift it from there.
      grid.y = (page.h - grid.h) / 2 + s.offsetYIn;
```

Replace `layoutProblem` up to (not including) the line `const room = (page.w - grid.w) / 2, shiftX = s.leftIn + (s.backOffsetXIn || 0);` with:

```js
    function layoutProblem(s, page, grid, b, g){
      if (![s.offsetYIn, s.leftIn, s.cardWIn, s.cardHIn].every(isFinite) ||
          ![s.backOffsetXIn, s.backOffsetYIn].every(function(v){ return v === undefined || isFinite(v); })) return 'Enter a number in every field.';
      if (s.cardWIn <= 0 || s.cardHIn <= 0) return 'Card width and height must be greater than zero.';
      const fmt = function(v){ return String(Math.round(v * 100) / 100); };
      const extras = (b > 0 ? ' + bleed' : '') + (g > 0 ? ' + gaps' : '');
      if (grid.h > page.h + 1e-6){
        return 'Cards this tall don\'t fit: ' + rows + ' rows × ' + s.cardHIn.toFixed(3) + '″' + extras + ' = ' + grid.h.toFixed(2) +
          '″, but the page is ' + fmt(page.h) + '″ tall.';
      }
      const roomY = (page.h - grid.h) / 2;
      if (Math.abs(s.offsetYIn) > roomY + 1e-6){
        return 'The vertical offset moves the cards off the page: ' + s.offsetYIn.toFixed(2) + '″, but there is only ' + roomY.toFixed(2) + '″ of room above and below.';
      }
```

Keep the existing width checks after it. Then replace the back-side vertical check (`const top = s.topIn + (s.backOffsetYIn || 0); …`) with:

```js
      const shiftY = s.offsetYIn + (s.backOffsetYIn || 0);
      if (Math.abs(shiftY) > roomY + 1e-6){
        return 'The back side runs off the page: offset ' + shiftY.toFixed(2) + '″ but there is only ' + roomY.toFixed(2) + '″ of room above and below.';
      }
```

- [ ] **Step 4: Tuning model.** Replace `DEFAULT_TUNING`, `roundTuning`, `applyTuning` and `tuningProblem` with:

```js
    const DEFAULT_TUNING = { offsetYIn: 0, leftIn: 0, cardWIn: 2.4750, cardHIn: 3.4650 };

    // Printer tuning exactly as applied: offsets to 0.01 in, card size to 0.0001 in. Validate this,
    // not the raw entry, so what passes is what prints. Non-numbers stay NaN.
    function roundTuning(offsetYIn, leftIn, cardWIn, cardHIn){
      return { offsetYIn: +Number(offsetYIn).toFixed(2), leftIn: +Number(leftIn).toFixed(2), cardWIn: +Number(cardWIn).toFixed(4), cardHIn: +Number(cardHIn).toFixed(4) };
    }

    function applyTuning(offsetYIn, leftIn, cardWIn, cardHIn){
      offsetYIn = Number(offsetYIn) || 0;
      leftIn  = Number(leftIn) || 0;
      cardWIn = Number(cardWIn) || readInchesVar('--cell-w', BASE_W_IN);
      cardHIn = Number(cardHIn) || readInchesVar('--cell-h', BASE_H_IN);
      const r = roundTuning(offsetYIn, leftIn, cardWIn, cardHIn);
      offsetYIn = r.offsetYIn; leftIn = r.leftIn; cardWIn = r.cardWIn; cardHIn = r.cardHIn;

      // apply CSS custom properties (in inches so cellSizePx() stays exact)
      document.documentElement.style.setProperty('--grid-offset-y', offsetYIn.toFixed(2)+'in');
      document.documentElement.style.setProperty('--grid-left', leftIn.toFixed(2)+'in');
      document.documentElement.style.setProperty('--cell-w', cardWIn.toFixed(4)+'in');
      document.documentElement.style.setProperty('--cell-h', cardHIn.toFixed(4)+'in');

      // persist (merge with any existing fields like scaleLock); the old top margin is gone for good
      try{
        const prev = JSON.parse(localStorage.getItem('mtgTuning') || '{}');
        delete prev.topIn;
        prev.offsetYIn = offsetYIn; prev.leftIn = leftIn; prev.cardWIn = cardWIn; prev.cardHIn = cardHIn;
        localStorage.setItem('mtgTuning', JSON.stringify(prev));
      }catch(_){}

      // reflow: update previews and guides with new dimensions
      doUpdate();
    }

    // Why a tuning can't be used, in words, or '' when the grid fits on the page.
    function tuningProblem(offsetYIn, leftIn, cardWIn, cardHIn){
      return computeLayout(Object.assign(currentLayoutSettings(), { offsetYIn: offsetYIn, leftIn: leftIn, cardWIn: cardWIn, cardHIn: cardHIn })).problem;
    }

    // Saved or imported tuning from before the grid was centred kept a top margin (topIn). Returns a
    // copy with the vertical offset that prints at the same place for that tuning's paper, gap, bleed
    // and card size. The old default 0.25 (stored by every Save, even untouched) becomes centred.
    function migrateTuning(t){
      const out = Object.assign({}, t);
      if (typeof out.topIn === 'undefined') return out;
      const top = Number(out.topIn);
      delete out.topIn;
      if (typeof out.offsetYIn !== 'undefined' || !isFinite(top)) return out;
      if (Math.abs(top - 0.25) < 1e-9){ out.offsetYIn = 0; return out; }
      const centred = computeLayout(Object.assign({}, PRINT_DEFAULTS, {
        paper: PAPER_SIZES[out.paper] ? out.paper : 'letter',
        gapMm: GAP_CHOICES_MM.includes(out.gapMm) ? out.gapMm : 0,
        bleedMm: BLEED_CHOICES_MM.includes(out.bleedMm) ? out.bleedMm : 0,
        offsetYIn: 0, leftIn: 0,
        cardWIn: isFinite(Number(out.cardWIn)) && Number(out.cardWIn) > 0 ? Number(out.cardWIn) : DEFAULT_TUNING.cardWIn,
        cardHIn: isFinite(Number(out.cardHIn)) && Number(out.cardHIn) > 0 ? Number(out.cardHIn) : DEFAULT_TUNING.cardHIn,
        backOffsetXIn: 0, backOffsetYIn: 0
      })).grid.y;
      out.offsetYIn = +(top - centred).toFixed(2);
      return out;
    }
```

Check that `PRINT_DEFAULTS`, `PAPER_SIZES`, `GAP_CHOICES_MM` and `BLEED_CHOICES_MM` are declared before `migrateTuning` runs. They are top-level constants in the print-settings section, which comes earlier in the script.

- [ ] **Step 5: Loading and import.**
  - **`loadTuning`:**
    - Replace `var t = raw ? (JSON.parse(raw) || {}) : {};` with:
      ```js
        var t = raw ? (JSON.parse(raw) || {}) : {};
        if (typeof t.topIn !== 'undefined'){ t = migrateTuning(t); localStorage.setItem('mtgTuning', JSON.stringify(t)); }
      ```
    - In the geometry block, replace every `topIn`/`top` use with `offsetYIn`/`offY`. That covers `hasGeometry`'s key list (`'offsetYIn'`), the read (`(typeof t.offsetYIn !== 'undefined') ? Number(t.offsetYIn) : readInchesVar('--grid-offset-y', 0)`), `roundTuning`, the PLAIN_PRINT probe object (`offsetYIn: offY`), the reset to `DEFAULT_TUNING.offsetYIn`, and `applyTuning(offY, left, w, h)`.
  - **`importPrintSettings`:**
    - At its top, replace the parameter use with a converted copy: `theirs = migrateTuning(theirs);`.
    - In `mine`, replace `topIn: readInchesVar('--grid-top', 0.25)` with `offsetYIn: readInchesVar('--grid-offset-y', 0)`.
    - In `keys`, replace `'topIn'` with `'offsetYIn'`.
    - In the "Use the file's" merge, the stored object must not keep a stale `offsetYIn` when the file has one. Replace `Object.assign({}, readSavedTuning() || {}, theirs, { backImageKey: theirsBack })` with `Object.assign({}, migrateTuning(readSavedTuning() || {}), theirs, { backImageKey: theirsBack })`.
  - **Other readers:** grep the whole file for `topIn`, `--grid-top` and `tuneTopIn`. Nothing may remain except inside `migrateTuning`. Check the export path too: it exports the saved tuning, which now carries `offsetYIn`.

- [ ] **Step 6: Dialog.** Replace the Top margin label in the fine-tuning panel:

```html
              <label class="field" title="Moves the grid up/down from the page centre. Positive = down.">
                Vertical offset (in)
                <input id="tuneOffsetYIn" type="number" step="0.01" value="0.00" style="width:120px">
              </label>
```

- `var tuneTopIn = document.getElementById('tuneTopIn');` becomes `var tuneOffsetYIn = document.getElementById('tuneOffsetYIn');`.
- In `readTuneDraft`, `roundTuning(parseFloat(tuneTopIn.value), …)` becomes `roundTuning(parseFloat(tuneOffsetYIn.value), …)`.
- In `renderTunePreview`, the finite check uses `draft.offsetYIn`.
- In `openTune`, use `tuneOffsetYIn.value = readInchesVar('--grid-offset-y', 0).toFixed(2);`.
- In the Save handler, use `if (isFinite(draft.offsetYIn)) tuneOffsetYIn.value = draft.offsetYIn.toFixed(2);` and `applyTuning(draft.offsetYIn, draft.leftIn, draft.cardWIn, draft.cardHIn);`.
- In the Reset handler, use `tuneOffsetYIn.value = DEFAULT_TUNING.offsetYIn.toFixed(2);`.
- Help text: grep for "top margin" and change it to "vertical offset".

- [ ] **Step 7: Tests and harness.**
  - **Existing suites:** grep `.claude/tests/*.js` for `topIn`, `tuneTopIn` and `--grid-top`, and convert each use.
    - A test that sets a top margin to place the grid at y becomes an offset of `y − (page.h − grid.h)/2`.
    - A test asserting 0.25″ top becomes the centred value.
    - A test of top-margin validation becomes the vertical-offset validation.
    - List every changed expectation in your report.
  - **`print-harness.mjs`, SETUP:**
    - `applyTuning(0.25, 0, 2.475, 3.465)` becomes `applyTuning(0, 0, 2.475, 3.465)`.
    - The scenario `tuning` object uses `offsetYIn` instead of `topIn`: `tuned-full-size` becomes `{ offsetYIn: 0.15, leftIn: 0.1, cardWIn: 2.5, cardHIn: 3.5 }`, which keeps its grid at 0.4″ exactly as before.
    - Scenarios that used a small top margin only so they would fit (`letter-duplex`, `letter-bleed3`, `a4-duplex-tuned`, and others — read them) get `offsetYIn: 0`, unless they test an offset deliberately.
    - Make SETUP clear any saved `topIn`.
  - **`check-pdf-boxes.py` / `pdf-check.py` / `compare-pdf-print.py`:** these read layout data from the harness json. Check none assumes `topIn`.

- [ ] **Step 8: Docs.**
  - **README "Printer fine-tuning" steps:** "Adjust top margin, horizontal offset…" becomes "Adjust the vertical or horizontal offset (the cards are centred on the page; offsets move them)…".
  - **Earlier spec section 2.1:** change the y0 formula to `y0 = (page.h − gridH)/2 + offsetY`, and the fit rule to "the grid with its offsets stays on the page". Add "(changed 2026-10-08, see 2026-10-08-centered-grid-and-safe-options-design.md)".

- [ ] **Step 9: Run.**
  - `tests-centering.js`: all PASS (20).
  - Every suite in the conventions list. Report counts and changed expectations.
  - Geometry: `node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry --pdf one-page-plain two-pages-cuts tuned-full-size letter-gap2-full a4-plain a4-gap2-corners letter-bleed3 a4-gap2-bleed1 letter-duplex a4-duplex-tuned`, then `pdf-check.py`, `check-pdf-boxes.py` and `compare-pdf-print.py` on every scenario. All PASS.
  - Baseline gate (legacy mode): `tuned-full-size` must still be `488` px (its grid didn't move). `one-page-plain` and `two-pages-cuts` **will now FAIL**; this is expected and is resolved in Task 3. Record their numbers.
  - Delete `print-out`.

- [ ] **Step 10: Commit** — `feat: centre the card grid vertically; top margin becomes a vertical offset`.

---

### Task 2: Grey out choices that won't print

**Files:**
- Create: `.claude/tests/tests-safe-options.js`
- Modify: `MTG Proxy Maker.html` — constants, `safeMarginOf` (new), `refreshSafeChoices` (new), the note markup under the cut-style hint, dialog listeners and `openTune`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-safe-options.js`:

```js
// Paper / gap / bleed choices that would put cards within 4 mm of an edge are disabled (offsets
// ignored); the selected choice never is; a note warns when the saved combination is too close.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + (e && e.stack || e)); } };
  const keep = localStorage.getItem('mtgTuning');
  const radio = (name, v) => tuneModal.querySelector('input[name="' + name + '"][value="' + v + '"]');
  const pick = (name, v) => { const r = radio(name, v); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
  const disabled = (name) => [...tuneModal.querySelectorAll('input[name="' + name + '"]')].filter(r => r.disabled).map(r => r.value).join(',');
  const base = { paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks', offsetYIn: 0, leftIn: 0, cardWIn: 2.475, cardHIn: 3.465, backOffsetXIn: 0, backOffsetYIn: 0 };
  try {
    await run('safeMarginOf', async () => {
      ok('letter default 7.7 mm', Math.abs(safeMarginOf(base) * 25.4 - 7.68) < 0.01, safeMarginOf(base) * 25.4);
      ok('letter 3 mm gap 4.7 mm', Math.abs(safeMarginOf(Object.assign({}, base, { gapMm: 3 })) * 25.4 - 4.68) < 0.01, '');
      ok('letter 2 mm bleed 1.7 mm', Math.abs(safeMarginOf(Object.assign({}, base, { bleedMm: 2 })) * 25.4 - 1.70) < 0.02, safeMarginOf(Object.assign({}, base, { bleedMm: 2 })) * 25.4);
      ok('offsets ignored', safeMarginOf(Object.assign({}, base, { leftIn: 0.5, offsetYIn: 0.3 })) === safeMarginOf(base), '');
    });
    await run('Letter choices', async () => {
      savePrintSettings({ paper: 'letter', gapMm: 0, bleedMm: 0, cutStyle: 'ticks' }); applyTuning(0, 0, 2.475, 3.465);
      openTune();
      ok('bleed 2 and 3 greyed', disabled('bleed') === '2,3', disabled('bleed'));
      ok('no gap greyed with bleed off', disabled('gap') === '', disabled('gap'));
      ok('tooltip explains', /Doesn.t fit on Letter with 2 mm bleed: the cards would be 1\.7 mm from the edge \(4 mm needed\)\./.test(radio('bleed', '2').closest('label').title), radio('bleed', '2').closest('label').title);
      pick('gap', '3');
      ok('3 mm gap greys 1 mm bleed', disabled('bleed') === '1,2,3', disabled('bleed'));
      pick('gap', '0'); pick('bleed', '1');
      ok('1 mm bleed greys every gap', disabled('gap') === '1,2,3', disabled('gap'));
      ok('selected choice enabled', !radio('bleed', '1').disabled, '');
      ok('no warning note', document.getElementById('safeMarginNote').hidden, '');
      closeModal(tuneModal);
    });
    await run('A4 choices and paper', async () => {
      openTune(); pick('paper', 'a4');
      ok('A4 greys bleed 3 only (gap 0)', disabled('bleed') === '3', disabled('bleed'));
      pick('bleed', '2');
      ok('A4 2 mm bleed greys gaps', disabled('gap') === '1,2,3', disabled('gap'));
      ok('Letter greyed with 2 mm bleed', disabled('paper') === 'letter', disabled('paper'));
      ok('paper tooltip', /Doesn.t fit on Letter with 2 mm bleed/.test(radio('paper', 'letter').closest('label').title), radio('paper', 'letter').closest('label').title);
      closeModal(tuneModal);
    });
    await run('card size re-evaluates', async () => {
      openTune(); pick('paper', 'letter');
      const w = document.getElementById('tuneCardWIn');
      w.value = '2.4000'; w.dispatchEvent(new Event('input', { bubbles: true }));
      ok('smaller cards free 2 mm bleed', !radio('bleed', '2').disabled, disabled('bleed'));
      closeModal(tuneModal);
    });
    await run('saved combination too close', async () => {
      savePrintSettings({ paper: 'letter', gapMm: 0, bleedMm: 2, cutStyle: 'ticks' }); applyTuning(0, 0, 2.475, 3.465);
      openTune();
      ok('kept selected and enabled', radio('bleed', '2').checked && !radio('bleed', '2').disabled, '');
      const note = document.getElementById('safeMarginNote');
      ok('warning shown', !note.hidden && /within 4 mm of the edge/.test(note.textContent), note.textContent);
      pick('bleed', '0');
      ok('warning clears', note.hidden, '');
      ok('2 mm now greyed', radio('bleed', '2').disabled, '');
      closeModal(tuneModal);
    });
  } finally {
    if (tuneModal.classList.contains('open')) closeModal(tuneModal);
    keep === null ? localStorage.removeItem('mtgTuning') : localStorage.setItem('mtgTuning', keep);
    loadTuning();
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`safeMarginOf is not defined`).

- [ ] **Step 3: Markup.** Right after `<p class="footnote" id="cutStyleHint" hidden>Corners need a gap between cards.</p>` add:

```html
          <p class="footnote warning-text" id="safeMarginNote" role="status" hidden>The cards come within 4 mm of the edge, so most printers will cut some of them off.</p>
```

If the app has no `.warning-text` style, use the existing `.footnote` class plus `style="color:#b45309"`, with a dark-theme rule `:root[data-theme="dark"] #safeMarginNote { color: #fbbf24; }`.

- [ ] **Step 4: JS.** Add next to `refreshCutStyleChoices`:

```js
    // Most home printers can't print the outer few millimetres of the sheet.
    const SAFE_MARGIN_IN = 4 / MM_PER_IN;

    // The smallest distance from the cards (bleed included) to any edge of the paper, in inches, with
    // the printer offsets at 0: offsets correct the printer's own shift, so they never make a choice
    // unavailable. Negative when the cards don't fit at all.
    function safeMarginOf(s){
      const L = computeLayout(Object.assign({}, s, { offsetYIn: 0, leftIn: 0, backOffsetXIn: 0, backOffsetYIn: 0 }));
      return Math.min((L.page.w - L.grid.w) / 2, (L.page.h - L.grid.h) / 2);
    }

    function describeCombination(s){
      const parts = [];
      if (s.gapMm > 0) parts.push(s.gapMm + ' mm gap');
      if (s.bleedMm > 0) parts.push(s.bleedMm + ' mm bleed');
      return (s.paper === 'a4' ? 'A4' : 'Letter') + (parts.length ? ' with ' + (parts.length === 2 ? 'a ' + parts[0] + ' and ' + parts[1] : (s.gapMm > 0 ? 'a ' : '') + parts[0]) : '');
    }

    // Disables each paper / gap / bleed choice that, with the rest of the draft, would put the cards
    // within SAFE_MARGIN_IN of an edge. The checked choice is never disabled; if the draft itself is
    // too close, a note says so.
    function refreshSafeChoices(){
      const draft = readTuneDraft();
      if (![draft.cardWIn, draft.cardHIn].every(isFinite)) return;
      const fieldOf = { paper: 'paper', gap: 'gapMm', bleed: 'bleedMm' };
      Object.keys(fieldOf).forEach(function(name){
        tuneModal.querySelectorAll('input[name="' + name + '"]').forEach(function(r){
          const label = r.closest('label');
          if (r.checked){ r.disabled = false; label.removeAttribute('title'); return; }
          const s = Object.assign({}, draft);
          s[fieldOf[name]] = name === 'paper' ? r.value : Number(r.value);
          const m = safeMarginOf(s);
          const unsafe = m < SAFE_MARGIN_IN - 1e-9;
          r.disabled = unsafe;
          if (unsafe){
            label.title = 'Doesn\'t fit on ' + describeCombination(s) + ': ' +
              (m < 0 ? 'the cards would run off the page.' : 'the cards would be ' + (m * MM_PER_IN).toFixed(1) + ' mm from the edge (4 mm needed).');
          } else label.removeAttribute('title');
        });
      });
      document.getElementById('safeMarginNote').hidden = safeMarginOf(draft) >= SAFE_MARGIN_IN - 1e-9;
    }
```

Wire it in:
- **`openTune`:** call `refreshSafeChoices();` right after `refreshCutStyleChoices();`.
- **`tuneModal` listeners:** in the `change` listener, call it after `refreshCutStyleChoices` (for every change). In the `input` listener, call it before `renderTunePreview()`.
- **Reset handler:** call it after `refreshCutStyleChoices();`.

Two things to check before wiring:
- The `.seg` disabled styling (`input:disabled + span`) already shows greyed choices. Confirm it does.
- The cut-style labels have their own `title`s, and `refreshSafeChoices` only touches the paper, gap and bleed labels. Confirm those three label sets have no other `title` that this would overwrite.

- [ ] **Step 5: Run `tests-safe-options.js` — expect all PASS (20).** Run `tests-advanced.js` (39), `tests-centering.js` (20), `tests-print-settings.js` (19) and the regression runner. Take screenshots of the dialog on Letter with a 3 mm gap: hover a greyed bleed choice to show its tooltip, in both light and dark themes.

- [ ] **Step 6: Commit** — `feat: grey out paper, gap and bleed choices that would put cards within 4 mm of the edge`.

---

### Task 3: Prove the shift, then replace the reference prints

**Files:**
- Create: `.claude/tests/compare-shifted.py`
- Modify: `.claude/tests/print-baseline/*` (regenerated), `.claude/tests/print-harness.mjs` (drop the legacy onload mode once the new baseline is captured with the app's own handlers)

- [ ] **Step 1: Write `compare-shifted.py`:**

```python
"""Prove a print is an older print moved down by a whole number of CSS pixels and nothing else.

usage: .venv/Scripts/python compare-shifted.py <old.pdf> <new.pdf> --shift-css-px 5 [--dpi 384]

Renders both at a DPI that is a multiple of 96 (so one CSS pixel is a whole number of pixels), shifts
the old render down, and counts pixels that differ by more than 24 levels (anti-aliasing). Fails when
more than 0.05% of any page differs, writing <new>-p<N>-shiftdiff.png.
"""
import sys, os
import pymupdf
from PIL import Image, ImageChops

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda name, default: (sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default)
old_path, new_path = args[0], args[1]
dpi = int(opt('--dpi', 384)); shift = int(opt('--shift-css-px', 5)) * dpi // 96
a, b = pymupdf.open(old_path), pymupdf.open(new_path)
fail = 0
if a.page_count != b.page_count:
    print(f'FAIL pages {a.page_count} vs {b.page_count}'); sys.exit(1)
for i in range(a.page_count):
    pa = a[i].get_pixmap(dpi=dpi, alpha=False); pb = b[i].get_pixmap(dpi=dpi, alpha=False)
    ia = Image.frombytes('RGB', (pa.width, pa.height), pa.samples)
    ib = Image.frombytes('RGB', (pb.width, pb.height), pb.samples)
    moved = Image.new('RGB', ia.size, 'white'); moved.paste(ia.crop((0, 0, ia.width, ia.height - shift)), (0, shift))
    diff = ImageChops.difference(moved, ib).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(diff.histogram()[255:]); total = ia.width * ia.height
    if n > total * 0.0005:
        diff.save(os.path.splitext(new_path)[0] + f'-p{i+1}-shiftdiff.png'); fail += 1
        print(f'FAIL p{i+1}: {n} of {total} pixels differ ({100*n/total:.3f}%) after a {shift}px shift')
    else:
        print(f'PASS p{i+1}: {n} pixels differ after a {shift}px shift')
sys.exit(1 if fail else 0)
```

- [ ] **Step 2: Prove the shift.**
  1. Run the default scenarios in legacy mode (no `--geometry`, so card 11 of `two-pages-cuts` keeps the baseline's old artifact) into `.claude/tests/print-out`.
  2. Check the calculated shift first. The grid moves from 0.25″ to 0.3025″, which is 24 to 29.04 CSS px. Fronts snap to whole CSS px, so the printed shift should be 5 CSS px. Confirm this with the harness json: compare cell 0's `y` in `printed` between the old commit and this one, or reason from `MEASURE`.
  3. Run `compare-shifted.py print-baseline/one-page-plain.pdf print-out/one-page-plain.pdf --shift-css-px 5` and the same for `two-pages-cuts.pdf`.
  4. Expect PASS on every page. If a page fails, look at the diff image and explain each difference before going on. Cut marks that sit partly on transforms may land on a half pixel; that is acceptable only if the difference stays within the 0.05% tolerance.
  5. `tuned-full-size` must pass the ordinary `compare-prints.py` unchanged (488).
  6. Paste every output line into your report.

- [ ] **Step 3: Replace the reference prints.** Only after Step 2 passes:
  1. In `print-harness.mjs`, remove the legacy branch that overwrites the app's image `onload` in non-geometry runs. Every run now uses the app's own handlers, as a real print does.
  2. Regenerate the baseline: `node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-baseline` (the three default scenarios).
  3. Write `.claude/tests/print-baseline/README.txt` recording:
     - the commit it was captured from;
     - the date;
     - "default grid centred vertically (spec 2026-10-08); captured with the app's own image handlers";
     - the `compare-shifted.py` results from Step 2.
  4. Run the gate twice into fresh dirs. Both runs must give 0 px on every page against the new baseline.
  5. In `.claude/tests/tests-layout.js`, set `BASELINE_SHIFT = 0` (it compares against the reference data, which is now captured with the centred grid) and confirm the suite still passes 39/39.

- [ ] **Step 4: Full matrix.** Run all of the following; all must PASS:
  - every in-page suite;
  - the geometry plus PDF matrix from Task 1 Step 9;
  - `check-pdf-boxes.py`, `pdf-check.py` and `compare-pdf-print.py` on each scenario;
  - the dark, preview, modal and deck-panel comparisons: `two-pages-cuts-dark`, `-preview`, `-modal` and `-deck` against a normal `two-pages-cuts` run, expecting 0 px.

  Delete the output dirs.

- [ ] **Step 5: Memory and conventions.** In `C:\Users\cmull\.claude\projects\D--Claude-Projects-MTG-Proxy-Maker\memory\print-correctness-first.md`, replace "captured from main `d3348fd`" with the new commit and date. Add: "default grid is centred vertically since 2026-10-08; reference re-captured with app handlers; legacy harness mode removed; gate expects 0 px on every page". Also update the conventions in both earlier plans (`2026-10-06-batch1-print-pipeline.md` and `2026-10-07-batch2-deck-tools.md`): the expected gate numbers become all 0.

- [ ] **Step 6: Commit** — `test: reference prints re-captured for the centred grid` (commits only the docs/plan changes; `.claude/` is git-excluded, so the baseline itself is not in git — say so in the commit body).
