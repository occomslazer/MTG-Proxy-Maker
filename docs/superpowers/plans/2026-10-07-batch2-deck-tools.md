# Batch 2 — Deck Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Deck side panel (rows grouped by card, counts, + / −, Paste decklist, Add tokens), an art picker that changes the printing of each copy of a card, and an Add tokens dialog — without changing how pages print.

**Architecture:** Cards gain optional metadata (`set`, `collectorNumber`; `copyOf` for copies of uploads). A pure function `deckRows()` groups the layout's cards in reading order; the panel renders those rows and reuses the batch 1 ripple helpers (`rippleInsert`, `rippleRemove`) for + / −. The art picker and tokens dialog are modals that talk to Scryfall only through the existing rate-limited `scryfallFetch` queue. Everything new is screen-only; the panel is hidden in preview and print.

**Tech Stack:** Single file `MTG Proxy Maker.html` (vanilla JS/CSS). Tests: in-page JS suites in `.claude/tests/` with a stubbed Scryfall `fetch`, plus the real-print harness from batch 1.

**Spec:** `docs/superpowers/specs/2026-10-06-print-pipeline-and-deck-tools-design.md`, Part 2 (sections 5–6) and 7.1.

---

## Conventions for every task

- **Branch:** `feat/deck-tools` (already created from `feat/print-pipeline`). Never push; never switch branches.
- **App file:** `D:\Claude Projects\MTG Proxy Maker\MTG Proxy Maker.html`. Locate code by the quoted text; line numbers drift.
- **Edit gotcha:** the Edit/Write tools turn `\uXXXX` escapes into literal characters. This plan uses literal characters (◐, ⇄, −, ·) on purpose; never write `\u` escapes. Keep the HTML's LF line endings.
- **Local server:** `mcp__Claude_Browser__preview_start` with `name: "proxy-maker"` (port 8765). Always `http://127.0.0.1:8765/...` — an unrelated server shadows `localhost:8765`. The Browser pane may be hidden: CSS transitions never advance and `requestAnimationFrame` never fires there.
- **Run an in-page suite:** navigate to `http://127.0.0.1:8765/MTG%20Proxy%20Maker.html`, then in `mcp__Claude_Browser__javascript_tool`:
  ```js
  await new Promise(r => setTimeout(r, 1000));
  await eval(await (await fetch('/.claude/tests/<FILE>.js', { cache: 'no-store' })).text())
  ```
- **Regression runner** (102 checks, must stay green after every task):
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
- **Batch 1 suites** (must stay green): `tests-toggles.js` 6, `tests-print-settings.js` 19, `tests-layout.js` 39, `tests-render.js` 7, `tests-bleed.js` 15, `tests-advanced.js` 39, `tests-ripple.js` 43, `tests-duplex.js` 135, `tests-pdf.js` 85.
- **Real-print gate** (Bash, from the repo root) — run after Tasks 3 and 7 (the only tasks touching page layout or print CSS):
  ```bash
  node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out
  .claude/tests/.venv/Scripts/python .claude/tests/compare-prints.py .claude/tests/print-baseline .claude/tests/print-out
  ```
  Expected: `one-page-plain p1 0`, `tuned-full-size p1 488`, `two-pages-cuts p1 599`, `p2 0`, exit 0. Never regenerate `print-baseline/`. Delete `print-out` afterwards.
- **Saved state:** save and restore the user's localStorage (`mtgProxyPages`, `mtgTuning`, `mtgThemeDark`, `mtgDeckPanelOpen`) around manual experiments.
- **Scryfall in tests:** never depend on the live API in new suites. Every new suite stubs `window.fetch` for `https://api.scryfall.com/` (code below) and restores it in `finally`. `scryfallFetch` calls the global `fetch`, so the stub is picked up; its rate-limit gaps (≈0.55 s for search/collection) still apply, so keep the number of calls per test small.
- **Commits:** one per task (plus review-fix commits), only tracked project files (`.claude/` is git-excluded). Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No TODO/FIXME comments.

### Shared test helpers (paste at the top of each new suite)

```js
const results = [];
const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + (e && e.stack || e)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Fake Scryfall card ids are valid-looking uuids so the app's image-URL patterns match them.
const fid = (n) => 'aaaaaaaa-0000-4000-8000-' + String(n).padStart(12, '0');
const fakeCard = (n, name, set, cn, extra) => Object.assign({
  object: 'card', id: fid(n), name, set, set_name: set.toUpperCase() + ' Set', collector_number: String(cn),
  released_at: (2000 + n) + '-01-01', type_line: 'Instant',
  image_uris: { png: 'https://cards.scryfall.io/png/front/a/a/' + fid(n) + '.png?1', small: 'https://cards.scryfall.io/small/front/a/a/' + fid(n) + '.jpg?1' }
}, extra || {});
const itemFor = (card) => createUrlItem(makeCardImages(card).front, makeCardImages(card));
// routes: [[RegExp, (url, init, match) => body | null]] — null answers 404.
const stubScryfall = (routes) => {
  const real = window.fetch, calls = [];
  window.fetch = async (u, o) => {
    const url = String(u);
    if (!url.startsWith('https://api.scryfall.com/')) return real(u, o);
    calls.push((o && o.method || 'GET') + ' ' + url.slice('https://api.scryfall.com'.length));
    for (const [re, fn] of routes){
      const m = url.match(re);
      if (!m) continue;
      const body = await fn(url, o, m);
      return body === null
        ? new Response(JSON.stringify({ object: 'error', status: 404 }), { status: 404, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ object: 'error', status: 404 }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, restore(){ window.fetch = real; } };
};
const fresh = () => { window.confirm = () => true; clearAllPages(true); };
const put = (p, item) => { while (totalPositions() <= p) appendPageSlot(); setItemAtPos(p, item); };
```

---

### Task 1: Card metadata (set, collector number, copyOf)

**Files:**
- Create: `.claude/tests/tests-deck-data.js`
- Modify: `MTG Proxy Maker.html` — `makeCardImages`, `normalizeCardImages`, `createUrlItem`, `createStoredItemFromKey`, `cloneItem`, `serializeItem`, `loadState`, `performImport` (item restore + `remapImageKey`), `backfillCardFaces`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-deck-data.js` (helpers block from the top of this plan first):

```js
// Card metadata: set + collector number for Scryfall cards, copyOf for copies of uploads; survives
// cloning, saving, loading and export/import (copyOf is remapped with the image keys).
(async () => {
  /* shared helpers here */
  const blackPng = () => { const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; cv.getContext('2d').fillRect(0, 0, 50, 70); return cv.toDataURL('image/png'); };
  try {
    await run('Scryfall card fields', async () => {
      const c = fakeCard(1, 'Lightning Bolt', 'm11', 149);
      const imgs = makeCardImages(c);
      ok('images carry set and number', imgs.set === 'm11' && imgs.collectorNumber === '149', JSON.stringify(imgs));
      const item = createUrlItem(imgs.front, imgs);
      ok('item keeps them', item.set === 'm11' && item.collectorNumber === '149' && item.name === 'Lightning Bolt' && item.back === null, JSON.stringify(item));
      const clone = await cloneItem(item);
      ok('clone keeps them', clone.set === 'm11' && clone.collectorNumber === '149' && clone.name === 'Lightning Bolt', JSON.stringify(clone));
      const s = serializeItem(item);
      ok('saved', s.set === 'm11' && s.collectorNumber === '149' && s.name === 'Lightning Bolt' && s.back === null, JSON.stringify(s));
      ok('normalize keeps them', normalizeCardImages(imgs).set === 'm11' && normalizeCardImages(imgs).collectorNumber === '149', '');
      const plain = createUrlItem('https://example.invalid/x.png');
      ok('other images get no fields', !('set' in plain) && !('collectorNumber' in plain) && !('set' in serializeItem(plain)), JSON.stringify(serializeItem(plain)));
    });
    await run('copies of an upload record their original', async () => {
      const orig = await createStoredItemFromDataUrl(blackPng());
      const a = await cloneItem(orig), b = await cloneItem(a);
      ok('copy points at original', a.copyOf === orig.key, a.copyOf + ' vs ' + orig.key);
      ok('copy of a copy points at original', b.copyOf === orig.key, b.copyOf);
      ok('original has no copyOf', !('copyOf' in orig) && !('copyOf' in serializeItem(orig)), '');
      ok('saved', serializeItem(a).copyOf === orig.key, JSON.stringify(serializeItem(a)));
      ok('restored from a key', createStoredItemFromKey('k1', 'image/png', 'k0').copyOf === 'k0' && !('copyOf' in createStoredItemFromKey('k1', 'image/png')), '');
      [orig, a, b].forEach(discardItem);
    });
    await run('save and load round trip', async () => {
      fresh();
      const orig = await createStoredItemFromDataUrl(blackPng());
      put(0, itemFor(fakeCard(1, 'Lightning Bolt', 'm11', 149)));
      put(1, orig); put(2, await cloneItem(orig));
      put(3, createUrlItem('https://example.invalid/old.png'));
      saveState();
      await loadState();
      const it = pages[0].items;
      ok('set restored', it[0].set === 'm11' && it[0].collectorNumber === '149', JSON.stringify(serializeItem(it[0])));
      ok('copyOf restored', it[2].copyOf === it[1].key, JSON.stringify(serializeItem(it[2])));
      ok('old items unchanged', JSON.stringify(serializeItem(it[3])) === JSON.stringify({ type: 'url', url: 'https://example.invalid/old.png' }), JSON.stringify(serializeItem(it[3])));
    });
    await run('export/import remaps copyOf', async () => {
      const oldKey = pages[0].items[1].key;
      const data = await buildExportData('full');
      await performImport(new File([JSON.stringify(data)], 'x.mtgproxy'));
      const it = pages[0].items;
      ok('original got a new key', it[1] && it[1].type === 'stored' && it[1].key !== oldKey, it[1] && it[1].key);
      ok('copy follows the new key', it[2] && it[2].copyOf === it[1].key, it[2] && it[2].copyOf);
      ok('set imported', it[0].set === 'm11' && it[0].collectorNumber === '149', JSON.stringify(serializeItem(it[0])));
    });
    await run('backfill fills set and number', async () => {
      const c = fakeCard(7, 'Delver of Secrets', 'isd', 51);
      const stub = stubScryfall([[/\/cards\/collection$/, () => ({ object: 'list', data: [c], not_found: [] })]]);
      try {
        const item = createUrlItem(c.image_uris.png);   // an old save: no name/back yet
        await backfillCardFaces([item]);
        ok('filled', item.name === 'Delver of Secrets' && item.set === 'isd' && item.collectorNumber === '51', JSON.stringify(item));
      } finally { stub.restore(); }
    });
  } finally { fresh(); }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`images carry set and number` etc.).

- [ ] **Step 3: Implement.**

In `makeCardImages(card)` replace the two return statements:

```js
    function makeCardImages(card){
      if(!card) return { front: null, back: null, name: null, set: null, collectorNumber: null };
      const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
      const front = pickImageFromUris(card) || pickImageFromUris(faces[0]) || null;
      const back = faces.length > 1 ? (pickImageFromUris(faces[1]) || null) : null;
      return { front, back, name: card.name || null, set: card.set || null, collectorNumber: card.collector_number != null ? String(card.collector_number) : null };
    }
```

In `normalizeCardImages(value)` replace `const out = { front: value.front || null, back: value.back || null, name: value.name || null };` with:

```js
      const out = { front: value.front || null, back: value.back || null, name: value.name || null, set: value.set || null, collectorNumber: value.collectorNumber || null };
```

Replace `createUrlItem`:

```js
    // `card` carries what Scryfall told us about the image: its name, back-face URL (null when the
    // card has no back), set and collector number. Items without `back` came from other sources or
    // older saves.
    function createUrlItem(url, card){
      const item = { type: 'url', url: url };
      if (card && card.back !== undefined){
        item.back = card.back || null;
        item.name = card.name || null;
      }
      if (card && typeof card.set === 'string' && card.set){
        item.set = card.set;
        item.collectorNumber = card.collectorNumber != null ? String(card.collectorNumber) : null;
      }
      return item;
    }
```

Replace `createStoredItemFromKey`:

```js
    // `copyOf`: the storage key of the upload this image is a copy of (copies share its deck row).
    function createStoredItemFromKey(key, mime, copyOf){
      const item = { type: 'stored', key: key, mime: mime || null, resolvedSrc: null, previewSrc: null };
      if (typeof copyOf === 'string' && copyOf) item.copyOf = copyOf;
      return item;
    }
```

In `cloneItem`, replace the stored branch's `return createStoredItemFromBlob(blob, item.mime || null);` with:

```js
          const copy = await createStoredItemFromBlob(blob, item.mime || null);
          copy.copyOf = item.copyOf || item.key;
          return copy;
```

Replace `serializeItem`:

```js
    function serializeItem(item){
      if (!item || typeof item !== 'object') return null;
      if (item.type === 'stored' && item.key){
        const out = { type: 'stored', key: item.key, mime: item.mime || null };
        if (item.copyOf) out.copyOf = item.copyOf;
        return out;
      }
      if (item.type === 'url' && item.url){
        const out = { type: 'url', url: item.url };
        if (item.back !== undefined){
          out.back = item.back;
          out.name = item.name || null;
        }
        if (item.set){
          out.set = item.set;
          out.collectorNumber = item.collectorNumber || null;
        }
        return out;
      }
      if (item.url){
        return { type: 'url', url: item.url };
      }
      return null;
    }
```

In **both** `loadState` and `performImport`, change `createStoredItemFromKey(entry.key, entry.mime || null)` to `createStoredItemFromKey(entry.key, entry.mime || null, entry.copyOf)`. (`createUrlItem(entry.url, entry)` already passes `set`/`collectorNumber` through.) Grep the file for every other place a saved entry becomes an item and do the same.

Replace `remapImageKey`:

```js
    function remapImageKey(pagesData, oldKey, newKey){
      for (const pageItems of pagesData){
        if (!Array.isArray(pageItems)) continue;
        for (let i = 0; i < pageItems.length; i++){
          const item = pageItems[i];
          if (!item || item.type !== 'stored') continue;
          if (item.key === oldKey) item.key = newKey;
          if (item.copyOf === oldKey) item.copyOf = newKey;
        }
      }
    }
```

In `backfillCardFaces`, replace `waiting.forEach(function(item){ item.back = images.back; item.name = images.name; });` with:

```js
          waiting.forEach(function(item){
            item.back = images.back; item.name = images.name;
            if (images.set){ item.set = images.set; item.collectorNumber = images.collectorNumber; }
          });
```

- [ ] **Step 4: Run `tests-deck-data.js` — expect all PASS (18).** Run the regression runner and all batch 1 suites.

- [ ] **Step 5: Commit** — `feat: cards remember set, collector number and the upload they copy (B2-T1)`.

---

### Task 2: Deck rows (grouping model)

**Files:**
- Create: `.claude/tests/tests-deck-rows.js`
- Modify: `MTG Proxy Maker.html` — new section `/* ===== Deck panel ===== */` inserted right before the line `/* ===== Export / Import ===== */`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-deck-rows.js`:

```js
// deckRows(): one row per card name (Scryfall), per original upload (copies join it), per linked
// image; reading order; counts; DFC mark; "N arts"; back faces placed as cards; totals.
(async () => {
  /* shared helpers here */
  const blackPng = () => { const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; cv.getContext('2d').fillRect(0, 0, 50, 70); return cv.toDataURL('image/png'); };
  try {
    await run('grouping and order', async () => {
      fresh();
      const boltA = fakeCard(1, 'Lightning Bolt', 'm11', 149), boltB = fakeCard(2, 'Lightning Bolt', '2xm', 129);
      const delver = fakeCard(3, 'Delver of Secrets // Insectile Aberration', 'isd', 51, { image_uris: undefined, card_faces: [
        { name: 'Delver of Secrets', image_uris: { png: 'https://cards.scryfall.io/png/front/a/a/' + fid(3) + '.png?1' } },
        { name: 'Insectile Aberration', image_uris: { png: 'https://cards.scryfall.io/png/back/a/a/' + fid(3) + '.png?1' } }] });
      const up = await createStoredItemFromDataUrl(blackPng());
      const up2 = await createStoredItemFromDataUrl(blackPng());
      put(0, itemFor(boltA)); put(1, itemFor(delver)); put(2, up); put(3, itemFor(boltB));
      put(4, createUrlItem('https://example.invalid/art/x.png'));
      put(5, await cloneItem(up)); put(6, up2);
      put(7, createUrlItem(makeCardImages(delver).back, { name: delver.name, back: null }));   // back face placed by "Add missing DFC backs" (carries the front's name)
      put(10, itemFor(boltA));                               // page 2
      const rows = deckRows();
      ok('row order', rows.map(r => r.label).join(' | ') === 'Lightning Bolt | Delver of Secrets // Insectile Aberration | Your image 1 | Image from example.invalid | Your image 2 | Back face of Delver of Secrets // Insectile Aberration', rows.map(r => r.label).join(' | '));
      const bolt = rows[0];
      ok('bolt count across pages', bolt.count === 3 && bolt.positions.join() === '0,3,10', bolt.count + ' @ ' + bolt.positions.join());
      ok('bolt has 2 arts', bolt.arts === 2, bolt.arts);
      ok('bolt can pick art', bolt.canPickArt === true && bolt.kind === 'card', JSON.stringify({ k: bolt.kind, c: bolt.canPickArt }));
      ok('delver is double-faced', rows[1].dfc === true && rows[0].dfc === false, '');
      ok('upload copy joins its original', rows[2].count === 2 && rows[2].positions.join() === '2,5', rows[2].positions.join());
      ok('uploads and links cannot pick art', !rows[2].canPickArt && !rows[3].canPickArt && !rows[5].canPickArt, '');
      ok('single art reported as 1', rows[1].arts === 1, rows[1].arts);
      ok('back face does not join the front row', rows[1].count === 1 && rows[1].canPickArt === true, rows[1].count + ' / ' + rows[1].canPickArt);
      const t = deckTotals();
      ok('totals', t.cards === 9 && t.pages === 2, JSON.stringify(t));
      ok('totals text', deckTotalsText() === '9 cards · 2 pages', deckTotalsText());
    });
    await run('old saves: Scryfall image without a name', async () => {
      fresh();
      put(0, createUrlItem(fakeCard(9, 'Counterspell', 'lea', 54).image_uris.png));
      const r = deckRows()[0];
      ok('grouped by card id, waiting for a name', r.kind === 'card' && r.needsName === true && r.label === 'Scryfall card' && !r.canPickArt, JSON.stringify(r, ['kind', 'needsName', 'label', 'canPickArt']));
    });
    await run('empty layout', async () => {
      fresh();
      ok('no rows', deckRows().length === 0, deckRows().length);
      ok('totals text', deckTotalsText() === '0 cards · 1 page', deckTotalsText());
    });
  } finally { fresh(); }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL** (`deckRows is not defined`).

- [ ] **Step 3: Implement** — insert right before `/* ===== Export / Import ===== */`:

```js
    /* ===== Deck panel =====
       Rows group the layout's cards: one per card name (Scryfall), one per original upload (copies
       made by + or duplicate join it through `copyOf`), one per linked image. Order is first
       appearance in reading order. */
    function scryfallIdOf(item){
      const m = item && item.type === 'url' && item.url ? SCRYFALL_FRONT_IMAGE_RE.exec(item.url) : null;
      return m ? m[1].toLowerCase() : null;
    }

    function hostOf(url){
      try { return new URL(url).host || 'another site'; } catch(_){ return 'another site'; }
    }

    const SCRYFALL_BACK_IMAGE_RE = /^https:\/\/cards\.scryfall\.io\/[a-z_]+\/back\//i;

    // The row a card belongs to. `backNames` maps placed DFCs' back-face URLs to the card's name.
    // Back faces are recognised before names: "Add missing DFC backs" gives them the front's name,
    // and they must not join (and disable ⇄ for) the front's row.
    function deckGroupOf(item, backNames){
      if (item.type === 'stored') return { key: 'upload:' + (item.copyOf || item.key), kind: 'upload', label: '' };
      const backOf = backNames.get(imageUrlKey(item.url)) || (SCRYFALL_BACK_IMAGE_RE.test(item.url) ? (item.name || 'a double-faced card') : null);
      if (backOf) return { key: 'back:' + foldName(backOf), kind: 'back', label: 'Back face of ' + backOf };
      if (item.name) return { key: 'card:' + foldName(item.name), kind: 'card', label: item.name };
      const id = scryfallIdOf(item);
      if (id) return { key: 'id:' + id, kind: 'card', label: 'Scryfall card', needsName: true };
      return { key: 'link:' + imageUrlKey(item.url), kind: 'link', label: 'Image from ' + hostOf(item.url) };
    }

    function deckRows(){
      const total = totalPositions();
      const backNames = new Map();
      for (let p = 0; p < total; p++){
        const it = itemAtPos(p);
        if (it && it.type === 'url' && typeof it.back === 'string' && it.back) backNames.set(imageUrlKey(it.back), it.name || 'a double-faced card');
      }
      const rows = new Map();
      let uploads = 0;
      for (let p = 0; p < total; p++){
        const it = itemAtPos(p);
        if (!it) continue;
        const g = deckGroupOf(it, backNames);
        let row = rows.get(g.key);
        if (!row){
          row = { key: g.key, kind: g.kind, label: g.kind === 'upload' ? 'Your image ' + (++uploads) : g.label,
                  needsName: !!g.needsName, positions: [], items: [], dfc: false };
          rows.set(g.key, row);
        }
        row.positions.push(p);
        row.items.push(it);
        if (typeof it.back === 'string' && it.back) row.dfc = true;
      }
      return Array.from(rows.values()).map(function(row){
        row.count = row.positions.length;
        row.arts = new Set(row.items.map(function(it){ return it.type === 'url' ? imageUrlKey(it.url) : (it.copyOf || it.key); })).size;
        row.canPickArt = row.kind === 'card' && !row.needsName && row.items.every(function(it){ return !!scryfallIdOf(it); });
        return row;
      });
    }

    function deckTotals(){
      let cards = 0;
      pages.forEach(function(m){ m.items.forEach(function(it){ if (it) cards++; }); });
      return { cards: cards, pages: pages.length };
    }

    function deckTotalsText(){
      const t = deckTotals();
      return countOf(t.cards, 'card', 'cards') + ' · ' + countOf(t.pages, 'page', 'pages');
    }
```

(`countOf`, `foldName`, `imageUrlKey`, `SCRYFALL_FRONT_IMAGE_RE`, `itemAtPos` and `totalPositions` already exist. `countOf` is a function declaration in the PDF section, so it's available here.)

- [ ] **Step 4: Run `tests-deck-rows.js` — expect all PASS (14).** Run the regression runner.

- [ ] **Step 5: Commit** — `feat: group the layout's cards into deck rows (B2-T2)`.

---

### Task 3: Deck panel (button, layout, rows, totals, hover, refresh)

**Files:**
- Create: `.claude/tests/tests-deck-panel.js`
- Modify: `MTG Proxy Maker.html` — controls markup (Decklist → Deck), `<main>` markup (panel), CSS, `updatePreviewScale`, `saveState` (refresh hook), the decklist button handler, deck panel section JS
- Modify: `.claude/tests/print-harness.mjs` — `deckPanel` scenario field and `two-pages-cuts-deck`

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-deck-panel.js`:

```js
// Deck panel: Deck button toggles it (remembered), rows rendered from deckRows(), totals, empty
// state, hover outlines copies on the visible page, clicking a name shows its first copy's page,
// refresh after changes, preview scale accounts for the panel, hidden in preview.
(async () => {
  /* shared helpers here */
  const keepOpen = localStorage.getItem('mtgDeckPanelOpen');
  const panel = () => document.getElementById('deckPanel');
  const rowEls = () => [...panel().querySelectorAll('.deck-row')];
  try {
    await run('Deck button replaces Decklist', async () => {
      ok('no Decklist button', !document.getElementById('decklistBtn'), '');
      const b = document.getElementById('deckBtn');
      ok('Deck button', b && b.textContent.trim() === 'Deck' && b.getAttribute('aria-controls') === 'deckPanel', b && b.outerHTML);
    });
    await run('toggle and remember', async () => {
      setDeckPanelOpen(false);
      ok('closed', panel().hidden && document.getElementById('deckBtn').getAttribute('aria-expanded') === 'false', '');
      const before = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-scale'));
      document.getElementById('deckBtn').click();
      ok('opened', !panel().hidden && document.getElementById('deckBtn').getAttribute('aria-expanded') === 'true', '');
      ok('remembered', localStorage.getItem('mtgDeckPanelOpen') === '1', localStorage.getItem('mtgDeckPanelOpen'));
      const pw = pages[currentPage].pageEl.getBoundingClientRect(), pr = panel().getBoundingClientRect();
      ok('panel sits right of the page', pr.left >= pw.right - 1, pr.left + ' vs ' + pw.right);
      const after = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-scale'));
      ok('page still fits beside the panel', pr.right <= window.innerWidth + 1 && after <= before + 1e-9, after + ' vs ' + before + ', panel right ' + pr.right);
    });
    await run('empty state', async () => {
      fresh(); renderDeckPanel();
      ok('empty message', !document.getElementById('deckEmpty').hidden && /Paste a decklist or add cards to get started/.test(panel().textContent), panel().textContent);
      ok('paste and tokens buttons', !!document.getElementById('deckPasteBtn') && !!document.getElementById('deckTokensBtn'), '');
      ok('totals', document.getElementById('deckTotals').textContent === '0 cards · 1 page', document.getElementById('deckTotals').textContent);
    });
    await run('rows', async () => {
      fresh();
      const bolt = fakeCard(1, 'Lightning Bolt', 'm11', 149), bolt2 = fakeCard(2, 'Lightning Bolt', '2xm', 129), cs = fakeCard(3, 'Counterspell', 'lea', 54);
      put(0, itemFor(bolt)); put(1, itemFor(cs)); put(2, itemFor(bolt2)); put(9, itemFor(bolt));
      renderDeckPanel();
      const rs = rowEls();
      ok('two rows', rs.length === 2, rs.length);
      ok('name, count, arts', rs[0].querySelector('.deck-name').textContent.includes('Lightning Bolt') && rs[0].querySelector('.deck-count').textContent === '3' && rs[0].querySelector('.deck-arts').textContent === '2 arts', rs[0].textContent);
      ok('no arts note for one art', rs[1].querySelector('.deck-arts').textContent === '', rs[1].querySelector('.deck-arts').textContent);
      ok('buttons labelled', rs[0].querySelector('.deck-plus').getAttribute('aria-label') === 'Add a copy of Lightning Bolt' && rs[0].querySelector('.deck-minus').getAttribute('aria-label') === 'Remove a copy of Lightning Bolt', '');
      ok('totals', document.getElementById('deckTotals').textContent === '4 cards · 2 pages', document.getElementById('deckTotals').textContent);
    });
    await run('hover outlines copies on the visible page', async () => {
      showPage(0);
      const r = rowEls()[0];
      r.dispatchEvent(new MouseEvent('mouseenter'));
      const lit = pages[0].cells.map((c, i) => c.classList.contains('deck-highlight') ? i : -1).filter(i => i >= 0);
      ok('cells 0 and 2 outlined', lit.join() === '0,2', lit.join());
      r.dispatchEvent(new MouseEvent('mouseleave'));
      ok('cleared', !document.querySelector('.cell.deck-highlight'), '');
      r.querySelector('.deck-plus').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      ok('focus outlines too', pages[0].cells[0].classList.contains('deck-highlight'), '');
      r.querySelector('.deck-plus').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await run('clicking a name shows its first copy', async () => {
      showPage(0);
      rowEls()[0].querySelector('.deck-name').click();
      ok('still page 1 (first copy is there)', currentPage === 0, currentPage);
      showPage(1);
      rowEls()[1].querySelector('.deck-name').click();
      ok('jumped to page 1 for Counterspell', currentPage === 0 && document.activeElement === pages[0].cells[1], currentPage);
    });
    await run('refreshes after a change', async () => {
      setItemAtPos(3, itemFor(fakeCard(4, 'Brainstorm', 'ice', 61))); saveState();
      await sleep(300);
      ok('new row appears', rowEls().some(r => r.textContent.includes('Brainstorm')), rowEls().map(r => r.textContent).join(' | '));
    });
    await run('hidden in preview', async () => {
      enterPreview();
      ok('hidden', getComputedStyle(panel()).display === 'none', getComputedStyle(panel()).display);
      exitPreview();
      ok('back after preview', getComputedStyle(panel()).display !== 'none', '');
    });
    await run('Paste decklist opens the decklist dialog', async () => {
      document.getElementById('deckPasteBtn').click();
      const m = document.getElementById('deckModal');
      ok('open', m && m.classList.contains('open') && document.activeElement === document.getElementById('deckText'), '');
      closeModal(m);
    });
  } finally {
    fresh();
    if (keepOpen === null) localStorage.removeItem('mtgDeckPanelOpen'); else localStorage.setItem('mtgDeckPanelOpen', keepOpen);
    setDeckPanelOpen(keepOpen === '1');
  }
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Markup.** Replace the line `<button id="decklistBtn" class="secondary" title="Paste a decklist to auto-fill">Decklist</button>` with:

```html
          <button id="deckBtn" class="secondary" aria-expanded="false" aria-controls="deckPanel" title="Show your deck: counts, copies, art and tokens">Deck</button>
```

Replace `<main>` … `</main>`:

```html
    <main>
      <div id="pageWrap" class="page-wrap"></div>
      <aside id="deckPanel" class="deck-panel screen-only" aria-label="Deck" hidden>
        <div class="deck-actions">
          <button id="deckPasteBtn" class="secondary" type="button">Paste decklist…</button>
          <button id="deckTokensBtn" class="secondary" type="button" disabled title="Available once tokens are supported">Add tokens…</button>
        </div>
        <div id="deckTotals" class="deck-totals"></div>
        <p id="deckEmpty" class="deck-empty" hidden>Paste a decklist or add cards to get started.</p>
        <ul id="deckList" class="deck-list"></ul>
      </aside>
    </main>
```

(Task 6 enables `#deckTokensBtn` and removes its `disabled`/`title`.)

In the JS, replace `var decklistBtn = document.getElementById('decklistBtn');` with `var deckBtn = document.getElementById('deckBtn');`.

- [ ] **Step 4: CSS.** Add before the line `:root[data-theme="dark"] body { background:#0b0d10; color:#e5e7eb; }`:

```css
    main { gap: 16px; }
    .deck-panel { flex: none; width: 300px; align-self: stretch; max-height: 100%; overflow: auto; box-sizing: border-box;
      padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; background: #fff; display: flex; flex-direction: column; gap: 10px; }
    .deck-panel[hidden] { display: none; }
    .deck-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .deck-totals { font-size: 13px; color: #4b5563; }
    .deck-empty { margin: 8px 0; font-size: 14px; color: #4b5563; }
    .deck-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .deck-row { display: grid; grid-template-columns: 1fr auto auto auto auto auto; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; }
    .deck-row:hover, .deck-row:focus-within { background: #eff6ff; }
    .deck-name { all: unset; cursor: pointer; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .deck-name:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; border-radius: 3px; }
    .deck-arts { font-size: 12px; color: #6b7280; }
    .deck-count { font-variant-numeric: tabular-nums; min-width: 2ch; text-align: right; font-weight: 600; }
    .deck-row button.deck-step, .deck-row button.deck-art { padding: 2px 8px; font-size: 14px; line-height: 1.2; }
    .cell.deck-highlight { outline: 3px solid #2563eb !important; outline-offset: -3px; }
    .preview-mode .deck-panel { display: none !important; }
    :root[data-theme="dark"] .deck-panel { background: #111827; border-color: #374151; }
    :root[data-theme="dark"] .deck-totals, :root[data-theme="dark"] .deck-empty, :root[data-theme="dark"] .deck-arts { color: #9ca3af; }
    :root[data-theme="dark"] .deck-row:hover, :root[data-theme="dark"] .deck-row:focus-within { background: #1f2937; }
```

Check that `.preview-mode` is set on an ancestor of `<main>` (grep `classList.add('preview-mode')`); if it's set elsewhere, adjust the selector. The print CSS already hides `.screen-only`; also add inside the existing `@media print { … }` block: `.deck-panel { display: none !important; }`.

- [ ] **Step 5: Preview scale.** In `updatePreviewScale`, replace `var availW=Math.max(0, window.innerWidth);` with:

```js
      var availW=Math.max(0, window.innerWidth - deckPanelSpace());
```

and add (in the Deck panel section):

```js
    // Width the open panel takes from the page area (panel plus the gap before it).
    function deckPanelSpace(){
      const el = document.getElementById('deckPanel');
      if (!el || el.hidden || getComputedStyle(el).display === 'none') return 0;
      const gap = parseFloat(getComputedStyle(el.parentElement).columnGap) || 0;
      return el.getBoundingClientRect().width + gap;
    }
```

- [ ] **Step 6: Panel JS.** Append to the Deck panel section:

```js
    var deckPanelOpen = false;
    var deckPanelTimer = null;

    function setDeckPanelOpen(open){
      deckPanelOpen = !!open;
      const el = document.getElementById('deckPanel');
      if (el) el.hidden = !deckPanelOpen;
      if (deckBtn) deckBtn.setAttribute('aria-expanded', deckPanelOpen ? 'true' : 'false');
      try { localStorage.setItem('mtgDeckPanelOpen', deckPanelOpen ? '1' : '0'); } catch(_){}
      if (deckPanelOpen) renderDeckPanel(); else clearDeckHighlight();
      updatePreviewScale();
    }

    // Called by saveState() after every layout change; a function declaration (and `var` timer)
    // because saveState can run before this part of the script has executed.
    function scheduleDeckPanel(){
      if (!deckPanelOpen) return;
      clearTimeout(deckPanelTimer);
      deckPanelTimer = setTimeout(renderDeckPanel, 100);
    }

    function clearDeckHighlight(){
      document.querySelectorAll('.cell.deck-highlight').forEach(function(c){ c.classList.remove('deck-highlight'); });
    }

    function highlightDeckRow(row){
      clearDeckHighlight();
      if (!row) return;
      row.positions.forEach(function(p){
        const s = posToSlot(p);
        if (s.page === currentPage && pages[s.page]) pages[s.page].cells[s.index].classList.add('deck-highlight');
      });
    }

    function showDeckRowFirstCopy(row){
      if (!row || !row.positions.length) return;
      const s = posToSlot(row.positions[0]);
      showPage(s.page);
      const cell = pages[s.page] && pages[s.page].cells[s.index];
      if (cell && typeof cell.focus === 'function') cell.focus();
    }

    var deckRowsShown = [];
    var deckNameLookupTried = false;

    function renderDeckPanel(){
      clearTimeout(deckPanelTimer);
      if (!deckPanelOpen) return;
      const list = document.getElementById('deckList');
      if (!list) return;
      // Keep keyboard focus on the same control of the same row across re-renders.
      const active = document.activeElement;
      const activeRow = active && active.closest ? active.closest('.deck-row') : null;
      const focusKey = activeRow ? activeRow.dataset.key : null;
      const focusClass = activeRow ? ['deck-name', 'deck-minus', 'deck-plus', 'deck-art'].find(function(c){ return active.classList.contains(c); }) : null;

      const rows = deckRows();
      deckRowsShown = rows;
      document.getElementById('deckTotals').textContent = deckTotalsText();
      document.getElementById('deckEmpty').hidden = rows.length > 0;
      list.innerHTML = '';
      rows.forEach(function(row){
        const li = document.createElement('li');
        li.className = 'deck-row';
        li.dataset.key = row.key;
        const name = document.createElement('button');
        name.type = 'button'; name.className = 'deck-name';
        name.textContent = (row.dfc ? '◐ ' : '') + row.label;
        name.title = row.dfc ? row.label + ' (double-faced) — show its first copy' : row.label + ' — show its first copy';
        const arts = document.createElement('span');
        arts.className = 'deck-arts';
        arts.textContent = row.kind === 'card' && row.arts > 1 ? row.arts + ' arts' : '';
        const count = document.createElement('span');
        count.className = 'deck-count';
        count.textContent = String(row.count);
        count.setAttribute('aria-label', countOf(row.count, 'copy', 'copies'));
        li.append(name, arts, count);
        name.addEventListener('click', function(){ showDeckRowFirstCopy(row); });
        li.addEventListener('mouseenter', function(){ highlightDeckRow(row); });
        li.addEventListener('mouseleave', clearDeckHighlight);
        li.addEventListener('focusin', function(){ highlightDeckRow(row); });
        li.addEventListener('focusout', function(e){ if (!li.contains(e.relatedTarget)) clearDeckHighlight(); });
        decorateDeckRow(li, row);
        list.appendChild(li);
      });
      if (focusKey){
        const li = Array.from(list.children).find(function(el){ return el.dataset.key === focusKey; });
        const target = li && (li.querySelector('.' + focusClass) || li.querySelector('.deck-name'));
        if (target) target.focus();
      }
      // Cards saved before names were recorded are looked up once (by Scryfall card id).
      if (!deckNameLookupTried && rows.some(function(r){ return r.needsName; })){
        deckNameLookupTried = true;
        lookUpCardFaces(placedUrlItems()).then(function(failed){ if (failed < placedUrlItems().length) saveState(); });
      }
    }

    // Row controls added by later features (+ / −, art picker). Without them a row is name + count.
    function decorateDeckRow(li, row){}

    if (deckBtn){
      deckBtn.addEventListener('click', function(){ setDeckPanelOpen(!deckPanelOpen); });
    }
    const deckPasteBtn = document.getElementById('deckPasteBtn');
    if (deckPasteBtn){
      deckPasteBtn.addEventListener('click', function(){
        const modal = ensureDeckModal();
        openModal(modal);
        if (deckText){ deckText.focus(); }
      });
    }
```

Delete the old block:

```js
    if (decklistBtn){
      decklistBtn.addEventListener('click', function(){
        var modal = ensureDeckModal();
        openModal(modal);
        if (deckText){ deckText.focus(); }
      });
    }
```

In `saveState()`, after `scheduleBackPages();` add `scheduleDeckPanel();`.

In the `init` IIFE, after `loadTuning();` (and before the first `doUpdate`/`showPage` if any follow) add:

```js
      try { setDeckPanelOpen(localStorage.getItem('mtgDeckPanelOpen') === '1'); } catch(_){ setDeckPanelOpen(false); }
```

Also re-render rows when the visible page changes (so hover outlines follow): `showPage` calls `saveState`, which schedules the panel — check this and, if `showPage` doesn't save, call `scheduleDeckPanel()` at its end.

`decorateDeckRow` is the extension point Tasks 4 and 5 fill in (replace its body there). Keep the empty function now so Task 3 works on its own.

- [ ] **Step 7: Harness — panel open must not change prints.** In `.claude/tests/print-harness.mjs`, add a scenario field `deckPanel: true` that runs `setDeckPanelOpen(true)` in SETUP after the layout is built (and `setDeckPanelOpen(false)` is the default otherwise — call it explicitly at the start of SETUP so scenarios don't leak). Add `'two-pages-cuts-deck': { cards: 11, cutMarks: true, deckPanel: true }`. Run it **without** `--geometry` (legacy mode, like the baseline) into a temp dir, rename its PDF to `two-pages-cuts.pdf`, and compare with `compare-prints.py` against `print-baseline` → must equal the gate numbers (599 / 0). Run the full gate.

- [ ] **Step 8: Run `tests-deck-panel.js` — expect all PASS (24).** (As built: the + / − label check moved to Task 4's suite; a count-label check replaced it.) Run `tests-deck-rows.js`, `tests-deck-data.js`, the regression runner and all batch 1 suites. Screenshot the app with the panel open (light and dark) at ~1280×800 and check it looks tidy.

- [ ] **Step 9: Commit** — `feat: Deck side panel with rows, totals and copy outlines (B2-T3)`.

---

### Task 4: + and − on deck rows

**Files:**
- Create: `.claude/tests/tests-deck-plusminus.js`
- Modify: `MTG Proxy Maker.html` — Deck panel section (`deckAddCopy`, `deckRemoveCopy`, `decorateDeckRow`)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-deck-plusminus.js`:

```js
// + clones a row's last copy (same art) and ripple-inserts it right after; − ripple-removes the last
// copy; a row at 0 disappears; uploads clone their image and join the row.
(async () => {
  /* shared helpers here */
  const keepOpen = localStorage.getItem('mtgDeckPanelOpen');
  const blackPng = () => { const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; cv.getContext('2d').fillRect(0, 0, 50, 70); return cv.toDataURL('image/png'); };
  const names = () => pages.map(m => m.items.map(i => !i ? '.' : i.type === 'stored' ? '#' : (i.name || '?')[0]).join('')).join('|');
  const row = (label) => [...document.querySelectorAll('#deckList .deck-row')].find(r => r.querySelector('.deck-name').textContent.includes(label));
  try {
    setDeckPanelOpen(true);
    await run('+ inserts after the last copy and ripples to the next gap', async () => {
      fresh();
      const A = fakeCard(1, 'Abrade', 'x', 1), A2 = fakeCard(2, 'Abrade', 'y', 2), B = fakeCard(3, 'Brainstorm', 'x', 3), C = fakeCard(4, 'Counterspell', 'x', 4);
      put(0, itemFor(A)); put(1, itemFor(B)); put(2, itemFor(A2)); put(3, itemFor(C)); put(5, itemFor(B));
      renderDeckPanel();
      await deckAddCopy('card:abrade');
      ok('layout', names() === 'ABAAC.B..', names());
      ok('same art as the last copy', pages[0].items[3].url === pages[0].items[2].url && pages[0].items[3] !== pages[0].items[2], '');
      await sleep(250);
      ok('count updated', row('Abrade').querySelector('.deck-count').textContent === '3', row('Abrade').textContent);
    });
    await run('− removes the last copy and ripples back', async () => {
      await deckRemoveCopy('card:brainstorm');
      ok('layout', names() === 'ABAAC....', names());
      await deckRemoveCopy('card:brainstorm');
      await sleep(250);
      ok('row gone at 0', !row('Brainstorm') && names() === 'AAAC.....', names());
    });
    await run('+ with no gap spills to a new page', async () => {
      fresh();
      for (let i = 0; i < 9; i++) put(i, itemFor(fakeCard(10 + i, 'Card ' + i, 'x', i)));
      renderDeckPanel();
      await deckAddCopy('card:' + foldName('Card 4'));
      ok('spilled', pages.length === 2 && names() === 'CCCCCCCCC|C........' && pages[0].items[5].name === 'Card 4', names());
    });
    await run('uploads: + clones the image and joins the row', async () => {
      fresh();
      const up = await createStoredItemFromDataUrl(blackPng());
      put(0, up); renderDeckPanel();
      await deckAddCopy('upload:' + up.key);
      const c = pages[0].items[1];
      ok('cloned with its own key', c && c.type === 'stored' && c.key !== up.key && c.copyOf === up.key, JSON.stringify(serializeItem(c)));
      ok('one row with 2', deckRows().length === 1 && deckRows()[0].count === 2, JSON.stringify(deckRows().map(r => r.count)));
      await deckRemoveCopy('upload:' + up.key);
      let gone = false; try { await imageStore.getBlob(c.key); } catch (_) { gone = true; }
      ok('removed copy\'s image deleted, original kept', gone && pages[0].items[0] === up, '');
    });
    await run('buttons', async () => {
      fresh(); put(0, itemFor(fakeCard(1, 'Abrade', 'x', 1))); renderDeckPanel();
      row('Abrade').querySelector('.deck-plus').click();
      await sleep(50);
      ok('buttons labelled', row('Abrade').querySelector('.deck-plus').getAttribute('aria-label') === 'Add a copy of Abrade' && row('Abrade').querySelector('.deck-minus').getAttribute('aria-label') === 'Remove a copy of Abrade', row('Abrade').innerHTML);
      ok('+ button adds', deckRows()[0].count === 2, deckRows()[0].count);
      await sleep(250);
      row('Abrade').querySelector('.deck-minus').focus();
      row('Abrade').querySelector('.deck-minus').click();
      await sleep(250);
      ok('− button removes', deckRows()[0].count === 1, deckRows()[0].count);
      ok('focus stays on − after refresh', document.activeElement && document.activeElement.classList.contains('deck-minus'), document.activeElement && document.activeElement.className);
      ok('status', /Removed a copy of Abrade/.test(document.getElementById('status').textContent), document.getElementById('status').textContent);
    });
  } finally {
    fresh();
    if (keepOpen === null) localStorage.removeItem('mtgDeckPanelOpen'); else localStorage.setItem('mtgDeckPanelOpen', keepOpen);
    setDeckPanelOpen(keepOpen === '1');
  }
  return results.join('\n');
})()
```

(The status bar updates 16 ms after `setStatus`; the `sleep(250)` before checking covers it.)

- [ ] **Step 2: Run it — expect FAIL** (`deckAddCopy is not defined`).

- [ ] **Step 3: Implement** — add to the Deck panel section and replace the empty `decorateDeckRow`:

```js
    var deckBusy = false;

    function deckRowByKey(key){ return deckRows().find(function(r){ return r.key === key; }) || null; }

    // + : a copy of the row's last card (same art), right after it; following cards shift forward
    // up to the next empty cell (rippleInsert).
    async function deckAddCopy(key){
      if (deckBusy) return false;
      const row = deckRowByKey(key);
      if (!row) return false;
      deckBusy = true;
      try{
        const source = row.items[row.items.length - 1];
        const copy = await cloneItem(source);
        if (!copy){ setStatus('Could not add a copy of ' + row.label); return false; }
        // Cloning an upload is async: find the row's last copy again in case the layout changed.
        const now = deckRowByKey(key);
        if (!now){ discardItem(copy); return false; }
        const slot = rippleInsert(now.positions[now.positions.length - 1] + 1, copy);
        setStatus('Added a copy of ' + row.label + describePlacedPages(new Set([slot.page])));
        return true;
      } finally { deckBusy = false; }
    }

    // − : removes the row's last copy; following cards shift back up to the next empty cell.
    async function deckRemoveCopy(key){
      if (deckBusy) return false;
      const row = deckRowByKey(key);
      if (!row) return false;
      rippleRemove(row.positions[row.positions.length - 1]);
      setStatus('Removed a copy of ' + row.label);
      return true;
    }

    function decorateDeckRow(li, row){
      const minus = document.createElement('button');
      minus.type = 'button'; minus.className = 'secondary deck-step deck-minus'; minus.textContent = '−';
      minus.setAttribute('aria-label', 'Remove a copy of ' + row.label);
      minus.addEventListener('click', function(){ deckRemoveCopy(row.key); });
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'secondary deck-step deck-plus'; plus.textContent = '+';
      plus.setAttribute('aria-label', 'Add a copy of ' + row.label);
      plus.addEventListener('click', function(){ deckAddCopy(row.key); });
      li.append(minus, plus);
    }
```

(`rippleRemove` discards the removed card — for an upload copy that deletes its stored image — and shows/saves the page; `rippleInsert` saves. Both cancel a pending internal C/X.)

- [ ] **Step 4: Run `tests-deck-plusminus.js` — expect all PASS (14).** Run `tests-deck-panel.js` (its row checks still pass with the new buttons: the grid has room for them), `tests-ripple.js`, the regression runner.

- [ ] **Step 5: Commit** — `feat: + and − on deck rows ripple copies in and out (B2-T4)`.

---

### Task 5: Art picker (⇄ and "Change printing…")

**Files:**
- Create: `.claude/tests/tests-art-picker.js`
- Modify: `MTG Proxy Maker.html` — CSS, art picker section JS (after the Deck panel section), `decorateDeckRow` (⇄ button), `buildCellMenu` ("Change printing…")

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-art-picker.js`:

```js
// Art picker: copies strip + printings (newest first, 175/page, Load more); click a copy then a
// printing; Use for all copies; Done applies, Cancel doesn't; tokens fall back to include_extras;
// opened from ⇄ and from the cell menu.
(async () => {
  /* shared helpers here */
  const keepOpen = localStorage.getItem('mtgDeckPanelOpen');
  const P = [fakeCard(1, 'Lightning Bolt', 'm11', 149), fakeCard(2, 'Lightning Bolt', '2xm', 129), fakeCard(3, 'Lightning Bolt', 'lea', 161)];
  const P2 = [fakeCard(4, 'Lightning Bolt', 'sld', 9)];
  const searchRoute = [/\/cards\/search\?/, (url) => {
    const u = new URL(url);
    if (u.searchParams.get('page') === '2') return { object: 'list', has_more: false, data: P2 };
    if (/Goblin/.test(u.searchParams.get('q'))) return u.searchParams.get('include_extras') === 'true' ? { object: 'list', has_more: false, data: [fakeCard(9, 'Goblin', 'tm11', 1, { type_line: 'Token Creature — Goblin' })] } : null;
    return { object: 'list', has_more: true, next_page: 'https://api.scryfall.com/cards/search?q=x&page=2', data: P };
  }];
  const m = () => document.getElementById('artModal');
  const waitFor = async (fn) => { for (let i = 0; i < 80; i++){ if (fn()) return true; await sleep(50); } return false; };
  const prints = () => [...m().querySelectorAll('.art-print')];
  const copies = () => [...m().querySelectorAll('.art-copy')];
  let stub;
  try {
    stub = stubScryfall([searchRoute]);
    await run('opens with copies and printings', async () => {
      fresh();
      put(0, itemFor(P[0])); put(4, itemFor(P[0])); put(10, itemFor(P[2]));
      openArtPicker('Lightning Bolt');
      ok('loaded', await waitFor(() => prints().length === 3), prints().length);
      ok('3 copies, first selected', copies().length === 3 && copies()[0].getAttribute('aria-selected') === 'true', copies().map(c => c.getAttribute('aria-selected')).join());
      ok('copy captions show page', /page 1/.test(copies()[0].textContent) && /page 2/.test(copies()[2].textContent), copies().map(c => c.textContent).join(' | '));
      ok('query', /q=%21%22Lightning\+Bolt%22|q=!%22Lightning%20Bolt%22|q=%21%22Lightning%20Bolt%22/.test(stub.calls[0]) && /unique=prints/.test(stub.calls[0]) && /order=released/.test(stub.calls[0]) && /dir=desc/.test(stub.calls[0]) && !/include_extras/.test(stub.calls[0]), stub.calls[0]);
      ok('captions', /M11 #149/.test(prints()[0].textContent) && /M11 Set/.test(prints()[0].textContent) && /2001/.test(prints()[0].textContent), prints()[0].textContent);
      ok('current printing outlined', prints()[0].classList.contains('current') && !prints()[1].classList.contains('current'), prints().map(p => p.className).join(' | '));
      ok('Load more shown', !document.getElementById('artMoreBtn').hidden, '');
    });
    await run('Load more appends', async () => {
      document.getElementById('artMoreBtn').click();
      ok('4 printings', await waitFor(() => prints().length === 4), prints().length);
      ok('no more', document.getElementById('artMoreBtn').hidden, '');
    });
    await run('assign one copy, then Done', async () => {
      copies()[1].click();
      ok('second copy selected', copies()[1].getAttribute('aria-selected') === 'true', '');
      prints()[1].click();
      ok('assigned outline', prints()[1].classList.contains('current'), '');
      document.getElementById('artDoneBtn').click();
      ok('closed', !m().classList.contains('open'), '');
      const it = pages[0].items[4];
      ok('copy 2 changed', it.url === P[1].image_uris.png && it.set === '2xm' && it.collectorNumber === '129' && it.name === 'Lightning Bolt' && it.back === null, JSON.stringify(serializeItem(it)));
      ok('others unchanged', pages[0].items[0].url === P[0].image_uris.png && pages[1].items[1].url === P[2].image_uris.png, '');
      await sleep(50);
      ok('status', document.getElementById('status').textContent === 'Changed art for 1 of 3 Lightning Bolt', document.getElementById('status').textContent);
    });
    await run('Use for all copies', async () => {
      openArtPicker('Lightning Bolt');
      await waitFor(() => prints().length === 3);
      prints()[2].click();
      document.getElementById('artAllBtn').click();
      document.getElementById('artDoneBtn').click();
      ok('all three are LEA', [pages[0].items[0], pages[0].items[4], pages[1].items[1]].every(i => i.set === 'lea'), [pages[0].items[0], pages[0].items[4], pages[1].items[1]].map(i => i.set).join());
      await sleep(50);
      ok('status counts only changes', document.getElementById('status').textContent === 'Changed art for 2 of 3 Lightning Bolt', document.getElementById('status').textContent);
    });
    await run('Cancel changes nothing', async () => {
      openArtPicker('Lightning Bolt');
      await waitFor(() => prints().length === 3);
      prints()[0].click(); document.getElementById('artAllBtn').click();
      document.getElementById('artCancelBtn').click();
      ok('unchanged', pages[0].items[0].set === 'lea', pages[0].items[0].set);
      openArtPicker('Lightning Bolt'); await waitFor(() => prints().length === 3);
      prints()[0].click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ok('Esc cancels', !m().classList.contains('open') && pages[0].items[0].set === 'lea', '');
    });
    await run('arrow keys move through printings', async () => {
      openArtPicker('Lightning Bolt'); await waitFor(() => prints().length === 3);
      prints()[0].focus();
      prints()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      ok('right', document.activeElement === prints()[1], document.activeElement && document.activeElement.className);
      prints()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      ok('left', document.activeElement === prints()[0], '');
      closeModal(m());
    });
    await run('tokens retry with extras', async () => {
      fresh(); put(0, itemFor(fakeCard(9, 'Goblin', 'tm11', 1)));
      openArtPicker('Goblin');
      ok('token printings found', await waitFor(() => prints().length === 1), prints().length + ' ' + stub.calls.slice(-2).join(' ; '));
      ok('second call had include_extras', /include_extras=true/.test(stub.calls[stub.calls.length - 1]), stub.calls[stub.calls.length - 1]);
      closeModal(m());
    });
    await run('entry points', async () => {
      fresh(); put(0, itemFor(P[0])); put(1, createUrlItem('https://example.invalid/x.png'));
      setDeckPanelOpen(true); renderDeckPanel();
      const art = document.querySelector('#deckList .deck-row .deck-art');
      ok('⇄ on card rows', art && art.getAttribute('aria-label') === 'Choose art for Lightning Bolt', art && art.outerHTML);
      ok('no ⇄ on linked images', document.querySelectorAll('#deckList .deck-art').length === 1, document.querySelectorAll('#deckList .deck-art').length);
      art.click();
      ok('⇄ opens the picker', m().classList.contains('open'), '');
      closeModal(m());
      const menu = document.createElement('div'); buildCellMenu(pages[0], 0, menu);
      const item = [...menu.querySelectorAll('.ctx-item')].find(x => /Change printing…/.test(x.textContent));
      ok('cell menu item enabled', item && !item.classList.contains('disabled') && item.getAttribute('aria-disabled') !== 'true', item && item.outerHTML);
      const menu2 = document.createElement('div'); buildCellMenu(pages[0], 1, menu2);
      const item2 = [...menu2.querySelectorAll('.ctx-item')].find(x => /Change printing…/.test(x.textContent));
      ok('disabled for linked images', !item2 || item2.classList.contains('disabled') || item2.getAttribute('aria-disabled') === 'true', item2 && item2.outerHTML);
    });
  } finally {
    if (stub) stub.restore();
    if (m() && m().classList.contains('open')) closeModal(m());
    fresh();
    if (keepOpen === null) localStorage.removeItem('mtgDeckPanelOpen'); else localStorage.setItem('mtgDeckPanelOpen', keepOpen);
    setDeckPanelOpen(keepOpen === '1');
  }
  return results.join('\n');
})()
```

Before relying on the `disabled` checks, read `ctxItem` to see how it marks a disabled item (class or `aria-disabled`) and keep whichever the test accepts.

- [ ] **Step 2: Run it — expect FAIL** (`openArtPicker is not defined`).

- [ ] **Step 3: CSS** — add after the Deck panel CSS from Task 3:

```css
    .art-sheet { width: min(900px, 94vw); max-height: 90vh; display: flex; flex-direction: column; gap: 10px; }
    .art-copies { display: flex; gap: 8px; overflow-x: auto; padding: 4px; }
    .art-copy { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12px; padding: 4px; border-radius: 6px; border: 2px solid transparent; }
    .art-copy img { width: 60px; height: 84px; object-fit: cover; border-radius: 4px; background: #e5e7eb; }
    .art-copy[aria-selected="true"] { border-color: #2563eb; }
    .art-copy:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; overflow-y: auto; padding: 4px; min-height: 200px; }
    .art-print { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 3px; font-size: 12px; line-height: 1.3; padding: 4px; border-radius: 8px; border: 2px solid transparent; }
    .art-print img { width: 100%; aspect-ratio: 146 / 204; object-fit: cover; border-radius: 5px; background: #e5e7eb; }
    .art-print.current { border-color: #2563eb; }
    .art-print:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .art-print .art-set { font-weight: 600; }
    .art-print .art-meta { color: #6b7280; }
    :root[data-theme="dark"] .art-copy img, :root[data-theme="dark"] .art-print img { background: #1f2937; }
    :root[data-theme="dark"] .art-print .art-meta { color: #9ca3af; }
```

- [ ] **Step 4: JS** — add a section after the Deck panel section:

```js
    /* ===== Art picker =====
       One window per card name: every copy in the layout across the top, every printing below
       (Scryfall, newest first). Click a copy, then a printing; Done applies all choices at once. */
    var artModal = null;
    var artState = null;

    function ensureArtModal(){
      if (artModal) return artModal;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div id="artModal" class="modal">
          <div class="sheet art-sheet" role="dialog" aria-modal="true" aria-labelledby="artTitle">
            <h2 id="artTitle" style="margin:0">Choose art</h2>
            <div class="art-copies" role="listbox" aria-label="Copies in your layout"></div>
            <p class="footnote" style="margin:0">Pick a copy, then a printing. ◐ marks double-faced printings.</p>
            <div class="art-grid" role="listbox" aria-label="Printings"></div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="artMoreBtn" class="secondary" type="button" hidden>Load more</button>
              <span id="artStatus" class="footnote" role="status"></span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="artAllBtn" class="secondary" type="button" disabled>Use for all copies</button>
              <div class="right"></div>
              <button id="artCancelBtn" class="secondary" type="button">Cancel</button>
              <button id="artDoneBtn" type="button">Done</button>
            </div>
          </div>
        </div>`;
      artModal = wrap.firstElementChild;
      document.body.appendChild(artModal);
      setupModalBackdrop(artModal);
      artModal.querySelector('#artCancelBtn').addEventListener('click', function(){ closeModal(artModal); });
      artModal.querySelector('#artDoneBtn').addEventListener('click', applyArtChoices);
      artModal.querySelector('#artAllBtn').addEventListener('click', function(){
        if (!artState || !artState.picked) return;
        artState.copies.forEach(function(c){ c.assigned = artState.picked; });
        renderArtCopies(); renderArtPrintings();
      });
      artModal.querySelector('#artMoreBtn').addEventListener('click', function(){ loadArtPrintings(artState && artState.next); });
      artModal.querySelector('.art-grid').addEventListener('keydown', onArtGridKey);
      artModal.addEventListener('modalclose', function(){ artState = null; });
      return artModal;
    }

    function cardSmallImage(card){
      return (card.image_uris && card.image_uris.small) || (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris && card.card_faces[0].image_uris.small) || '';
    }

    function printingsSearchUrl(name, extras){
      const q = '!"' + String(name).replace(/"/g, '') + '"';
      return 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=released&dir=desc' + (extras ? '&include_extras=true' : '');
    }

    function openArtPicker(name){
      const modal = ensureArtModal();
      const want = foldName(name);
      const copies = [];
      for (let p = 0; p < totalPositions(); p++){
        const it = itemAtPos(p);
        if (it && it.type === 'url' && it.name && foldName(it.name) === want && scryfallIdOf(it)) copies.push({ item: it, assigned: null });
      }
      if (!copies.length){ setStatus('No copies of ' + name + ' to change'); return; }
      artState = { name: copies[0].item.name, copies: copies, selected: 0, picked: null, printings: [], next: null, token: {} };
      modal.querySelector('#artTitle').textContent = 'Choose art — ' + artState.name;
      modal.querySelector('.art-grid').innerHTML = '';
      modal.querySelector('#artAllBtn').disabled = true;
      renderArtCopies();
      openModal(modal);
      const first = modal.querySelector('.art-copy');
      if (first) first.focus();
      startArtSearch();
    }

    async function startArtSearch(){
      const state = artState;
      const status = artModal.querySelector('#artStatus');
      status.textContent = 'Loading printings…';
      // Tokens and other extras only show up with include_extras; a full double-faced name may need
      // its front face name.
      const names = [state.name];
      if (state.name.indexOf(' // ') !== -1) names.push(state.name.split(' // ')[0]);
      for (const n of names){
        for (const extras of [false, true]){
          let page;
          try { page = await fetchScryfallJson(printingsSearchUrl(n, extras)); }
          catch(err){ if (artState === state) status.textContent = 'Couldn\'t load printings (' + err.message + ')'; return; }
          if (artState !== state) return;
          if (page && Array.isArray(page.data) && page.data.length){ addArtPrintings(page); return; }
        }
      }
      status.textContent = 'No printings found';
    }

    async function loadArtPrintings(url){
      if (!url || !artState) return;
      const state = artState;
      const btn = artModal.querySelector('#artMoreBtn');
      btn.disabled = true;
      artModal.querySelector('#artStatus').textContent = 'Loading more…';
      try{
        const page = await fetchScryfallJson(url);
        if (artState !== state) return;
        if (page) addArtPrintings(page);
      }catch(err){
        if (artState === state) artModal.querySelector('#artStatus').textContent = 'Couldn\'t load more (' + err.message + ')';
      }finally{ btn.disabled = false; }
    }

    function addArtPrintings(page){
      artState.printings = artState.printings.concat(page.data || []);
      artState.next = page.has_more ? page.next_page : null;
      artModal.querySelector('#artMoreBtn').hidden = !artState.next;
      artModal.querySelector('#artStatus').textContent = countOf(artState.printings.length, 'printing', 'printings');
      renderArtPrintings();
    }

    function effectiveArtId(copy){ return copy.assigned ? String(copy.assigned.id).toLowerCase() : scryfallIdOf(copy.item); }

    function renderArtCopies(){
      const strip = artModal.querySelector('.art-copies');
      strip.innerHTML = '';
      artState.copies.forEach(function(c, i){
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'art-copy';
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', i === artState.selected ? 'true' : 'false');
        const img = document.createElement('img');
        img.alt = '';
        img.src = c.assigned ? cardSmallImage(c.assigned) : c.item.url;
        const p = positionOfItem(c.item);
        const cap = document.createElement('span');
        cap.textContent = 'Copy ' + (i + 1) + (p >= 0 ? ' · page ' + (posToSlot(p).page + 1) : '') + (c.assigned ? ' · changed' : '');
        b.append(img, cap);
        b.addEventListener('click', function(){ artState.selected = i; renderArtCopies(); renderArtPrintings(); strip.children[i].focus(); });
        strip.appendChild(b);
      });
    }

    function renderArtPrintings(){
      const grid = artModal.querySelector('.art-grid');
      const focusedIndex = Array.prototype.indexOf.call(grid.children, document.activeElement);
      grid.innerHTML = '';
      const current = effectiveArtId(artState.copies[artState.selected]);
      artState.printings.forEach(function(card){
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'art-print' + (String(card.id).toLowerCase() === current ? ' current' : '');
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(card.id).toLowerCase() === current ? 'true' : 'false');
        const img = document.createElement('img');
        img.alt = ''; img.loading = 'lazy'; img.src = cardSmallImage(card);
        const dfc = Array.isArray(card.card_faces) && card.card_faces.length > 1 && !card.image_uris;
        const set = document.createElement('span'); set.className = 'art-set';
        set.textContent = (dfc ? '◐ ' : '') + (card.set_name || card.set || '');
        const meta = document.createElement('span'); meta.className = 'art-meta';
        meta.textContent = String(card.set || '').toUpperCase() + ' #' + card.collector_number + (card.released_at ? ' · ' + card.released_at.slice(0, 4) : '');
        b.append(img, set, meta);
        b.setAttribute('aria-label', (card.set_name || card.set) + ', ' + String(card.set || '').toUpperCase() + ' number ' + card.collector_number + (card.released_at ? ', ' + card.released_at.slice(0, 4) : '') + (dfc ? ', double-faced' : ''));
        b.addEventListener('click', function(){
          artState.picked = card;
          artState.copies[artState.selected].assigned = card;
          artModal.querySelector('#artAllBtn').disabled = false;
          renderArtCopies(); renderArtPrintings();
        });
        grid.appendChild(b);
      });
      if (focusedIndex >= 0 && grid.children[focusedIndex]) grid.children[focusedIndex].focus();
    }

    // Arrow keys move through the grid (Up/Down by a row); Enter/Space press the button natively.
    function onArtGridKey(e){
      const items = Array.from(artModal.querySelectorAll('.art-print'));
      const i = items.indexOf(document.activeElement);
      if (i === -1) return;
      const top = items[0].offsetTop;
      let cols = items.findIndex(function(el){ return el.offsetTop !== top; });
      if (cols <= 0) cols = items.length;
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (!step) return;
      e.preventDefault();
      const next = items[Math.min(items.length - 1, Math.max(0, i + step))];
      if (next) next.focus();
    }

    function positionOfItem(item){
      for (let p = 0; p < totalPositions(); p++) if (itemAtPos(p) === item) return p;
      return -1;
    }

    // Done: every copy with a new printing gets a fresh card in the same cell.
    function applyArtChoices(){
      if (!artState) { closeModal(artModal); return; }
      const state = artState;
      let changed = 0;
      state.copies.forEach(function(c){
        if (!c.assigned || effectiveArtId({ item: c.item }) === String(c.assigned.id).toLowerCase()) return;
        const p = positionOfItem(c.item);
        if (p === -1) return;
        const images = makeCardImages(c.assigned);
        if (!images.front) return;
        discardItem(c.item);
        setItemAtPos(p, createUrlItem(images.front, images));
        changed++;
      });
      if (changed){ clearInternalClipboard(); saveState(); }
      closeModal(artModal);
      setStatus('Changed art for ' + changed + ' of ' + state.copies.length + ' ' + state.name);
    }
```

Check: does `closeModal` dispatch a `modalclose` event (batch 1 added one for the Print settings draft)? If it does, the listener above clears the state; if the event has another name, use it. Esc is handled by the global Esc handler (topmost modal) and must behave like Cancel.

- [ ] **Step 5: ⇄ and the cell menu.** In `decorateDeckRow` (Task 4's version), append before the end:

```js
      if (row.canPickArt){
        const art = document.createElement('button');
        art.type = 'button'; art.className = 'secondary deck-art'; art.textContent = '⇄';
        art.setAttribute('aria-label', 'Choose art for ' + row.label);
        art.title = 'Choose art for each copy';
        art.addEventListener('click', function(){ openArtPicker(row.items[0].name); });
        li.appendChild(art);
      }
```

In `buildCellMenu`, after the "Duplicate to next empty cell" item, add:

```js
      const cellItem = model.items[index];
      const canChangePrinting = !!(cellItem && cellItem.type === 'url' && cellItem.name && scryfallIdOf(cellItem));
      cellSection.appendChild(ctxItem('Change printing…', function(){
        if (model.items[index] && model.items[index].name) openArtPicker(model.items[index].name);
      }, { disabled: !canChangePrinting }));
```

- [ ] **Step 6: Run `tests-art-picker.js` — expect all PASS (28).** Run `tests-deck-panel.js`, `tests-deck-plusminus.js`, the regression runner. Then one live smoke check (network): open the app, add "Lightning Bolt" with the Add box, right-click it → Change printing…, confirm real printings load with thumbnails and captions, pick one, Done, and the cell shows the new art. Screenshot the picker (light and dark).

- [ ] **Step 7: Commit** — `feat: art picker changes the printing of each copy (B2-T5)`.

---

### Task 6: Add tokens

**Files:**
- Create: `.claude/tests/tests-tokens.js`
- Modify: `MTG Proxy Maker.html` — tokens section JS (after the Art picker section), CSS, `#deckTokensBtn` markup and handler

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-tokens.js`:

```js
// Add tokens: look up the layout's cards (75 per collection call), take all_parts tokens/emblems,
// de-duplicate by name + type line, "already in layout" defaults to 0, Add places them with the
// standard placement; nothing found → status only.
(async () => {
  /* shared helpers here */
  const keepOpen = localStorage.getItem('mtgDeckPanelOpen');
  const tok = (n, name, type) => ({ object: 'related_card', id: fid(n), component: 'token', name, type_line: type, uri: 'https://api.scryfall.com/cards/' + fid(n) });
  const goblin = fakeCard(101, 'Goblin', 'tm11', 1, { type_line: 'Token Creature — Goblin' });
  const emblem = fakeCard(102, 'Chandra Emblem', 'tm11', 2, { type_line: 'Emblem — Chandra' });
  const krenko = fakeCard(1, 'Krenko, Mob Boss', 'm13', 139, { all_parts: [
    { object: 'related_card', id: fid(1), component: 'combo_piece', name: 'Krenko, Mob Boss', type_line: 'Legendary Creature — Goblin Warrior' },
    tok(101, 'Goblin', 'Token Creature — Goblin')] });
  const muxus = fakeCard(2, 'Muxus, Goblin Grandee', 'jmp', 1, { all_parts: [tok(101, 'Goblin', 'Token Creature — Goblin')] });
  const chandra = fakeCard(3, 'Chandra, Torch of Defiance', 'kld', 110, { all_parts: [tok(102, 'Chandra Emblem', 'Emblem — Chandra')] });
  const byId = new Map([krenko, muxus, chandra, goblin, emblem].map(c => [c.id, c]));
  const collection = [/\/cards\/collection$/, (url, init) => {
    const ids = JSON.parse(init.body).identifiers.map(x => x.id);
    return { object: 'list', data: ids.map(id => byId.get(id)).filter(Boolean), not_found: [] };
  }];
  const m = () => document.getElementById('tokensModal');
  const waitFor = async (fn) => { for (let i = 0; i < 80; i++){ if (fn()) return true; await sleep(50); } return false; };
  const rowsOf = () => [...m().querySelectorAll('.token-row')];
  let stub;
  try {
    stub = stubScryfall([collection]);
    await run('finds, de-duplicates and describes tokens', async () => {
      fresh();
      put(0, itemFor(krenko)); put(1, itemFor(muxus)); put(2, itemFor(chandra)); put(3, createUrlItem('https://example.invalid/x.png'));
      const found = await findLayoutTokens();
      ok('two tokens', found.tokens.length === 2, JSON.stringify(found.tokens.map(t => t.name)));
      const g = found.tokens.find(t => t.name === 'Goblin');
      ok('made by both', g && g.makers.join(', ') === 'Krenko, Mob Boss, Muxus, Goblin Grandee', g && g.makers.join(', '));
      ok('emblems count as tokens', found.tokens.some(t => t.name === 'Chandra Emblem'), '');
      ok('one collection call for 3 cards', stub.calls.filter(c => /collection/.test(c)).length === 1, stub.calls.join(' ; '));
    });
    await run('dialog: quantities and already in layout', async () => {
      put(4, itemFor(goblin));
      stub.calls.length = 0;
      await openTokensDialog();
      ok('open', m().classList.contains('open') && rowsOf().length === 2, rowsOf().length);
      const gRow = rowsOf().find(r => /Goblin/.test(r.textContent) && !/Emblem/.test(r.textContent));
      ok('already in layout, quantity 0', /already in layout/.test(gRow.textContent) && gRow.querySelector('input').value === '0', gRow.textContent + ' / ' + gRow.querySelector('input').value);
      const eRow = rowsOf().find(r => /Chandra Emblem/.test(r.textContent));
      ok('default 1, type line, makers', eRow.querySelector('input').value === '1' && /Emblem — Chandra/.test(eRow.textContent) && /made by Chandra, Torch of Defiance/.test(eRow.textContent), eRow.textContent);
      eRow.querySelector('input').value = '2';
      gRow.querySelector('input').value = '1';
      document.getElementById('tokensAddBtn').click();
      ok('placed', await waitFor(() => !m().classList.contains('open')), '');
      const added = pages[0].items.slice(5, 9).map(i => i ? i.name : '.').join('|');
      ok('3 tokens added after the cards', added === 'Goblin|Chandra Emblem|Chandra Emblem|.', added);
      await sleep(50);
      ok('status', /^Added 3 tokens/.test(document.getElementById('status').textContent), document.getElementById('status').textContent);
      const e = pages.flatMap(p => p.items).find(i => i && i.name === 'Chandra Emblem');
      ok('token items carry set', e.set === 'tm11' && e.collectorNumber === '2' && e.back === null, JSON.stringify(serializeItem(e)));
    });
    await run('nothing found', async () => {
      fresh(); put(0, itemFor(fakeCard(50, 'Lightning Bolt', 'm11', 149)));
      byId.set(fid(50), fakeCard(50, 'Lightning Bolt', 'm11', 149));
      await openTokensDialog();
      await sleep(50);
      ok('no dialog, status', !m() || !m().classList.contains('open'), '');
      ok('status text', document.getElementById('status').textContent === 'No tokens found for the cards in this layout', document.getElementById('status').textContent);
    });
    await run('panel button', async () => {
      setDeckPanelOpen(true);
      const b = document.getElementById('deckTokensBtn');
      ok('enabled', b && !b.disabled, b && b.outerHTML);
    });
  } finally {
    if (stub) stub.restore();
    if (m() && m().classList.contains('open')) closeModal(m());
    fresh();
    if (keepOpen === null) localStorage.removeItem('mtgDeckPanelOpen'); else localStorage.setItem('mtgDeckPanelOpen', keepOpen);
    setDeckPanelOpen(keepOpen === '1');
  }
  return results.join('\n');
})()
```

(Tokens are added in the dialog's order — Goblin, then the emblem — into the first empty cells from page 1: cells 5, 6, 7.)

- [ ] **Step 2: Run it — expect FAIL** (`findLayoutTokens is not defined`).

- [ ] **Step 3: Markup.** Change the tokens button to `<button id="deckTokensBtn" class="secondary" type="button">Add tokens…</button>` (no `disabled`, no placeholder title).

- [ ] **Step 4: CSS** — add after the art picker CSS:

```css
    .tokens-sheet { width: min(620px, 94vw); max-height: 85vh; display: flex; flex-direction: column; gap: 10px; }
    .tokens-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .token-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; padding: 6px 8px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .token-row .token-name { font-weight: 600; }
    .token-row .token-meta { grid-column: 1; font-size: 12px; color: #6b7280; }
    .token-row input { width: 64px; grid-row: 1 / span 2; grid-column: 2; }
    :root[data-theme="dark"] .token-row { border-color: #374151; }
    :root[data-theme="dark"] .token-row .token-meta { color: #9ca3af; }
```

- [ ] **Step 5: JS** — add a section after the Art picker section:

```js
    /* ===== Add tokens =====
       Tokens and emblems the layout's cards make (Scryfall all_parts), each with a quantity. */
    var tokensModal = null;
    var tokensFound = [];

    // Looks up the layout's Scryfall cards (75 per request) and collects the tokens they make,
    // de-duplicated by name + type line. Resolves { tokens: [{ id, name, typeLine, makers[], inLayout }], failed }.
    async function findLayoutTokens(){
      const ids = [];
      const seen = new Set();
      const layoutNames = new Set();
      for (let p = 0; p < totalPositions(); p++){
        const it = itemAtPos(p);
        if (!it || it.type !== 'url') continue;
        if (it.name){
          layoutNames.add(foldName(it.name));
          it.name.split(' // ').forEach(function(n){ layoutNames.add(foldName(n)); });
        }
        const id = scryfallIdOf(it);
        if (id && !seen.has(id)){ seen.add(id); ids.push(id); }
      }
      const byKey = new Map();
      let failed = 0;
      for (let i = 0; i < ids.length; i += 75){
        const chunk = ids.slice(i, i + 75);
        let cards;
        try { cards = await postCollection(chunk.map(function(id){ return { id: id }; })); }
        catch(err){ console.warn('Token lookup failed', err); failed += chunk.length; continue; }
        cards.forEach(function(card){
          (Array.isArray(card.all_parts) ? card.all_parts : []).forEach(function(part){
            if (part.component !== 'token' || String(part.id).toLowerCase() === String(card.id).toLowerCase()) return;
            const key = foldName(part.name) + '|' + foldName(part.type_line || '');
            let t = byKey.get(key);
            if (!t){
              t = { id: String(part.id).toLowerCase(), name: part.name, typeLine: part.type_line || '', makers: [], inLayout: layoutNames.has(foldName(part.name)) };
              byKey.set(key, t);
            }
            if (t.makers.indexOf(card.name) === -1) t.makers.push(card.name);
          });
        });
      }
      return { tokens: Array.from(byKey.values()), failed: failed };
    }

    function ensureTokensModal(){
      if (tokensModal) return tokensModal;
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div id="tokensModal" class="modal">
          <div class="sheet tokens-sheet" role="dialog" aria-modal="true" aria-labelledby="tokensTitle">
            <h2 id="tokensTitle" style="margin:0">Add tokens</h2>
            <p class="footnote" style="margin:0">Tokens and emblems your cards make. Set a quantity for each (0 skips it).</p>
            <ul class="tokens-list"></ul>
            <div id="tokensNote" class="footnote" role="status"></div>
            <div style="display:flex;gap:8px;align-items:center;">
              <div class="right"></div>
              <button id="tokensCancelBtn" class="secondary" type="button">Cancel</button>
              <button id="tokensAddBtn" type="button">Add</button>
            </div>
          </div>
        </div>`;
      tokensModal = wrap.firstElementChild;
      document.body.appendChild(tokensModal);
      setupModalBackdrop(tokensModal);
      tokensModal.querySelector('#tokensCancelBtn').addEventListener('click', function(){ closeModal(tokensModal); });
      tokensModal.querySelector('#tokensAddBtn').addEventListener('click', addChosenTokens);
      return tokensModal;
    }

    async function openTokensDialog(){
      const btn = document.getElementById('deckTokensBtn');
      if (btn) btn.disabled = true;
      setStatus('Looking for tokens…');
      try{
        const found = await findLayoutTokens();
        if (!found.tokens.length){
          setStatus(found.failed ? 'Couldn\'t look up tokens (Scryfall unavailable — try again shortly)' : 'No tokens found for the cards in this layout');
          return;
        }
        tokensFound = found.tokens;
        const modal = ensureTokensModal();
        const list = modal.querySelector('.tokens-list');
        list.innerHTML = '';
        found.tokens.forEach(function(t, i){
          const li = document.createElement('li');
          li.className = 'token-row';
          const name = document.createElement('span'); name.className = 'token-name'; name.id = 'tokenName' + i;
          name.textContent = t.name + (t.inLayout ? ' (already in layout)' : '');
          const meta = document.createElement('span'); meta.className = 'token-meta';
          meta.textContent = t.typeLine + ' · made by ' + t.makers.join(', ');
          const qty = document.createElement('input');
          qty.type = 'number'; qty.min = '0'; qty.max = '99'; qty.step = '1';
          qty.value = t.inLayout ? '0' : '1';
          qty.setAttribute('aria-labelledby', name.id);
          li.append(name, meta, qty);
          list.appendChild(li);
        });
        modal.querySelector('#tokensNote').textContent = found.failed ? countOf(found.failed, 'card', 'cards') + ' couldn\'t be checked (Scryfall unavailable).' : '';
        setStatus('Ready');
        openModal(modal);
        const first = list.querySelector('input'); if (first) first.focus();
      } finally { if (btn) btn.disabled = false; }
    }

    async function addChosenTokens(){
      const inputs = Array.from(tokensModal.querySelectorAll('.token-row input'));
      const wanted = [];
      inputs.forEach(function(input, i){
        const n = Math.max(0, Math.min(99, Math.floor(Number(input.value) || 0)));
        if (n > 0) wanted.push({ token: tokensFound[i], count: n });
      });
      if (!wanted.length){ closeModal(tokensModal); setStatus('No tokens added'); return; }
      const addBtn = tokensModal.querySelector('#tokensAddBtn');
      addBtn.disabled = true;
      tokensModal.querySelector('#tokensNote').textContent = 'Adding tokens…';
      try{
        const cards = new Map();
        const ids = wanted.map(function(w){ return w.token.id; });
        for (let i = 0; i < ids.length; i += 75){
          const chunk = ids.slice(i, i + 75);
          (await postCollection(chunk.map(function(id){ return { id: id }; }))).forEach(function(c){ cards.set(String(c.id).toLowerCase(), c); });
        }
        const placement = createPlacement();
        let added = 0, missing = 0;
        wanted.forEach(function(w){
          const images = makeCardImages(cards.get(w.token.id));
          if (!images.front){ missing += w.count; return; }
          for (let k = 0; k < w.count; k++){ placement.put(createUrlItem(images.front, images)); added++; }
        });
        closeModal(tokensModal);
        setStatus('Added ' + countOf(added, 'token', 'tokens') + (missing ? ' (' + missing + ' couldn\'t be found)' : '') + describePlacedPages(placement.pagesUsed));
      }catch(err){
        console.warn('Adding tokens failed', err);
        tokensModal.querySelector('#tokensNote').textContent = 'Couldn\'t add tokens (Scryfall unavailable — try again shortly).';
      }finally{ addBtn.disabled = false; }
    }

    const deckTokensBtn = document.getElementById('deckTokensBtn');
    if (deckTokensBtn) deckTokensBtn.addEventListener('click', openTokensDialog);
```

(`createPlacement().put` places in the first empty cell from page 1, then new pages; each `put` saves through `placeImage`. Check `placeImage` saves; if not, call `saveState()` once after the loop.)

- [ ] **Step 6: Run `tests-tokens.js` — expect all PASS (14).** Run the deck suites, the regression runner. Live smoke check (network): add "Krenko, Mob Boss" and "Chandra, Torch of Defiance", open Deck → Add tokens…, confirm Goblin and the Chandra emblem are listed with real type lines, add them, and they appear. Screenshot the dialog.

- [ ] **Step 7: Commit** — `feat: Add tokens dialog in the Deck panel (B2-T6)`.

---

### Task 7: Help, README and final verification

**Files:**
- Modify: `MTG Proxy Maker.html` — help modal text (the "Decklist importer" section), `README.md`, the spec if anything drifted

- [ ] **Step 1: Help text.** In `ensureHelpModal`, replace the "Decklist importer" heading and list with:

```html
                <h3 style="margin:12px 0 4px;">Deck panel</h3>
                <ul class="help-list">
                  <li>Click <b>Deck</b> to show the side panel: one row per card with its count. <b>+</b> adds a copy right after the last one and <b>−</b> removes the last copy; following cards shift up to the next empty cell. Hover a row to outline its copies on the page; click a name to jump to its first copy.</li>
                  <li><b>⇄</b> (or right-click a card → <b>Change printing…</b>) picks the art for each copy; <b>Use for all copies</b> applies one printing to every copy. Changes apply when you click <b>Done</b>.</li>
                  <li><b>Add tokens…</b> lists the tokens and emblems your cards make, with a quantity for each.</li>
                  <li><b>Paste decklist…</b>: one card per line (e.g., <code>4 Lightning Bolt</code>). You can include a set code like <code>[M11]</code> or <code>(M11)</code>, and Arena/Moxfield exports (<code>1 Sol Ring (CMR) 472</code>) get that exact printing. Lines starting with <code>//</code> or <code>#</code> are ignored. Use the switches to skip basics and Snow-Covered basics.</li>
                  <li>Double-faced cards use the front face; click <b>Add missing DFC backs</b> to add the reverse sides, or print them on the back with double-sided printing.</li>
                </ul>
```

Grep the whole file for any other user-facing "Decklist" wording that refers to the old button and update it.

- [ ] **Step 2: README.** Read `README.md` (LF line endings). Replace the feature bullet(s) about the decklist with a short **Deck panel** section in the README's existing style: Deck button and side panel, rows with counts, + / −, hover/click, ⇄ art picker and Change printing…, Add tokens…, Paste decklist… inside the panel. Keep it concise.

- [ ] **Step 3: Final verification** (fresh page load for each suite):
  - New suites: `tests-deck-data.js` (20), `tests-deck-rows.js` (18), `tests-deck-panel.js` (37), `tests-deck-plusminus.js` (14), `tests-art-picker.js` (28), `tests-tokens.js` (14).
  - Regression runner (102) and every batch 1 suite.
  - Console: no `TypeError`/`ReferenceError`.
  - Real-print gate (0 / 488 / 599 / 0) and the panel-open comparison from Task 3 Step 7.
  - Geometry matrix:
    ```bash
    node .claude/tests/print-harness.mjs "http://127.0.0.1:8765/MTG%20Proxy%20Maker.html" .claude/tests/print-out --geometry --pdf one-page-plain two-pages-cuts tuned-full-size letter-gap2-full a4-plain a4-gap2-corners letter-bleed3 a4-gap2-bleed1 letter-duplex a4-duplex-tuned
    ```
    all PASS; delete `print-out`.
  - Live smoke (network): paste a 60-card decklist, open the panel, check counts, + / − a row, change one card's art, add tokens, print preview (panel hidden), export Full and import it back (rows and arts survive).

- [ ] **Step 4: Commit** — `docs: help and README describe the Deck panel (B2-T7)`.
