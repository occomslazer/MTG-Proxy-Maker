# Gap-free Placement and "Remove gaps" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New cards fill the first empty cell from page 1 (or from an explicit cell/page anchor), the view never jumps, status names off-screen pages, and a "Remove gaps" command closes existing gaps.

**Architecture:** One placement object (`createPlacement(anchor)`) decides every new card's cell and records which pages it used; all add paths (search, decklist, DFC backs, files, URLs, paste, drops, duplicate) go through it, replacing four separate searches. `removeGaps()` re-flows card objects in reading order and drops trailing empty pages.

**Tech Stack:** Single file `MTG Proxy Maker.html` (vanilla JS, no build). Tests are JS snippets run in the page via the Browser pane against a local `python -m http.server`.

**Spec:** `docs/superpowers/specs/2026-10-06-gap-free-placement-design.md`

---

## Conventions for every task

- **Branch:** `feat/gap-free-placement` (already checked out; the spec is committed there).
- **The app file:** `D:\Claude Projects\MTG Proxy Maker\MTG Proxy Maker.html`. Line numbers below are approximate (they shift as you edit); locate code by the quoted text.
- **Editing gotcha:** the Edit/Write tools turn `\uXXXX` escapes into literal characters. None of the code in this plan needs `\u` escapes; don't add any.
- **Tests live in `.claude/tests/`** (git-excluded via `.git/info/exclude`; not committed). The local server serves them.
- **How to run a test file** (Browser pane tools):
  1. Make sure the server is running: `mcp__Claude_Browser__preview_start` with `name: "proxy-maker"` (config in `.claude/launch.json`, port 8765). It reuses a running server.
  2. Load fresh code: `mcp__Claude_Browser__navigate` to `http://localhost:8765/MTG%20Proxy%20Maker.html` (the service worker is network-first, so a plain load gets the new code).
  3. Run with `mcp__Claude_Browser__javascript_tool`:
     ```js
     await new Promise(r => setTimeout(r, 1000));
     await eval(await (await fetch('/.claude/tests/<FILE>.js', { cache: 'no-store' })).text())
     ```
  The result is a string of `PASS …` / `FAIL …` lines.
- **Commit messages** end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.

---

### Task 1: Placement core and the search / decklist / DFC-backs paths

**Files:**
- Create: `.claude/tests/tests-placement-core.js`
- Modify: `MTG Proxy Maker.html` — `showPage` (~line 1556), `appendPageSlot` (~line 2516), `addImageSrcToNextCell` (~line 3241), `addCardByName` (~line 3200), `importDecklist` (~line 3360), `addMissingDFCBacks` (~line 3515)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-placement-core.js`:

```js
// Gap-free placement: no-anchor paths (search box, decklist import, DFC backs).
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const fresh = (pageCount) => { window.confirm = () => true; if (previewActive) exitPreview(); clearAllPages(true); for (let i = 1; i < pageCount; i++) addPage(); showPage(0); };
  const card = (name) => createUrlItem('https://example.invalid/' + encodeURIComponent(name) + '.png', { name: name, back: null });
  const put = (page, index, name) => { pages[page].items[index] = card(name); renderCell(pages[page], index); };
  const lbl = (i) => i ? (i.name || decodeURIComponent(i.url.split('/').pop().replace(/\.png$/, ''))) : '.';
  const layout = () => pages.map(p => p.items.map(lbl).join(' ')).join(' | ');
  const status = () => new Promise(r => setTimeout(() => r(document.getElementById('status').textContent), 80));
  const addNamed = (placement, name) => addImageSrcToNextCell('https://example.invalid/' + name + '.png', { name: name, back: null }, placement);

  await run('fills earliest gap, view stays', async () => {
    fresh(2);
    'abcdefghi'.split('').forEach((n, i) => { if (i !== 2) put(0, i, n); });
    showPage(1);
    const placement = createPlacement();
    await addNamed(placement, 'X');
    ok('first empty cell from page 1 is used', layout().startsWith('a b X d e f g h i'), layout());
    ok('view stays on page 2', currentPage === 1, 'currentPage ' + currentPage);
    ok('pagesUsed records page index 0', placement.pagesUsed.has(0) && placement.pagesUsed.size === 1, JSON.stringify([...placement.pagesUsed]));
  });

  await run('12 cards keep reading order', async () => {
    fresh(2);
    'abcdefghi'.split('').forEach((n, i) => { if (i !== 4) put(0, i, n); });
    showPage(1);
    const placement = createPlacement();
    for (const n of 'ABCDEFGHIJKL'.split('')) await addNamed(placement, n);
    const want = 'a b c d A f g h i | B C D E F G H I J | K L . . . . . . .';
    ok('gap, then page 2, then a new page 3', layout() === want, layout());
    ok('view stays on page 2', currentPage === 1, 'currentPage ' + currentPage);
    ok('pager shows the new page count', pageBadge.textContent === 'Page 2 / 3', pageBadge.textContent);
    ok('− Page enabled with 3 pages', removePageBtn.disabled === false, '');
  });

  await run('no blank trailing page', async () => {
    fresh(1);
    const placement = createPlacement();
    for (const n of 'ABCDEFGHI'.split('')) await addNamed(placement, n);
    ok('9 cards -> exactly 1 page', pages.length === 1, pages.length + ' pages');
  });

  await run('describePlacedPages', async () => {
    fresh(3); showPage(1);
    const d = (arr) => describePlacedPages(new Set(arr));
    ok('only current page -> no suffix', d([1]) === '', JSON.stringify(d([1])));
    ok('one other page', d([0]) === ' (page 1)', JSON.stringify(d([0])));
    ok('contiguous range', d([0, 1, 2]) === ' (pages 1–3)', JSON.stringify(d([0, 1, 2])));
    ok('non-contiguous list', d([0, 2]) === ' (pages 1, 3)', JSON.stringify(d([0, 2])));
    ok('nothing placed -> no suffix', d([]) === '', JSON.stringify(d([])));
  });

  await run('status names the page (network)', async () => {
    fresh(3); showPage(2);
    await addCardByName('Opt');
    const s1 = await status();
    ok('search box: "Added Opt (page 1)"', s1 === 'Added Opt (page 1)', s1);
    ok('search box: view stays on page 3', currentPage === 2, 'currentPage ' + currentPage);
    fresh(3); showPage(2); ensureDeckModal();
    await importDecklist('1 Opt');
    const s2 = await status();
    ok('decklist: "Done (page 1)"', s2 === 'Done (page 1)', s2);
  });

  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it and confirm it fails**

Run `tests-placement-core.js` as described in Conventions.
Expected: FAIL lines, including `threw: createPlacement is not defined` and `threw: describePlacedPages is not defined`.

- [ ] **Step 3: Add `updatePager` and use it in `showPage`**

Replace:

```js
    function showPage(idx){
      currentPage = Math.max(0, Math.min(idx, pages.length-1));
      pages.forEach((p,i)=>p.pageEl.classList.toggle('current', i===currentPage));
      pageBadge.textContent = 'Page ' + (currentPage+1) + ' / ' + pages.length;
      doUpdate();
      removePageBtn.disabled = (pages.length <= 1);
      saveState();
    }
```

with:

```js
    function updatePager(){
      pageBadge.textContent = 'Page ' + (currentPage+1) + ' / ' + pages.length;
      removePageBtn.disabled = (pages.length <= 1);
    }

    function showPage(idx){
      currentPage = Math.max(0, Math.min(idx, pages.length-1));
      pages.forEach((p,i)=>p.pageEl.classList.toggle('current', i===currentPage));
      updatePager();
      doUpdate();
      saveState();
    }
```

- [ ] **Step 4: Make `appendPageSlot` keep the view, and add `createPlacement` / `describePlacedPages`**

Replace:

```js
    // Callers search forward from where they are first; when that runs out, cards continue on a
    // new last page rather than wrapping back to gaps on earlier pages (which scrambled deck order).
    function appendPageSlot(){
      var m=createPage(); pages.push(m); syncCutMarksState(); showPage(pages.length-1); saveState();
      return {page: pages.length-1, index: 0};
    }
```

with:

```js
    // Adds a page at the end for placement without switching to it: the view never moves on its own.
    function appendPageSlot(){
      var m=createPage(); pages.push(m); syncCutMarksState(); updatePager(); saveState();
      return {page: pages.length-1, index: 0};
    }

    /* Where new cards go. Without an anchor, a card takes the first empty cell from page 1 in
       reading order. `anchor.replaceAt` puts the first card exactly there (replacing what's there);
       `anchor.from` fills empty cells from that point first. Either way the search then falls back
       to the first empty cell from page 1, then a new last page. Each slot is found only when its
       card is ready, so filling a page's last cell never leaves an empty page. pagesUsed feeds
       describePlacedPages(). */
    function createPlacement(anchor){
      let replaceAt = anchor && anchor.replaceAt ? anchor.replaceAt : null;
      let from = anchor && anchor.from ? anchor.from : null;
      const pagesUsed = new Set();
      function put(item){
        let slot;
        if (replaceAt && pages[replaceAt.page]) slot = replaceAt;
        else slot = (from && nextEmptySlotFrom(from)) || nextEmptySlotFrom({ page: 0, index: 0 }) || appendPageSlot();
        placeImage(pages[slot.page], slot.index, item);
        replaceAt = null;
        from = { page: slot.page, index: slot.index + 1 };
        pagesUsed.add(slot.page);
        return slot;
      }
      return { put: put, pagesUsed: pagesUsed };
    }

    // " (page 2)", " (pages 1–3)" or " (pages 1, 3)" when a card landed off the current page; '' otherwise.
    function describePlacedPages(pagesUsed){
      const used = Array.from(pagesUsed).sort(function(a, b){ return a - b; });
      if (!used.length || (used.length === 1 && used[0] === currentPage)) return '';
      const nums = used.map(function(p){ return p + 1; });
      if (nums.length === 1) return ' (page ' + nums[0] + ')';
      const contiguous = nums[nums.length - 1] - nums[0] === nums.length - 1;
      return ' (pages ' + (contiguous ? nums[0] + '–' + nums[nums.length - 1] : nums.join(', ')) + ')';
    }
```

- [ ] **Step 5: Route `addImageSrcToNextCell` through a placement**

Replace the whole function that starts `async function addImageSrcToNextCell(src, card){` (it ends with `console.error('Failed to add image to cell', err);` and two closing braces) with:

```js
    // Places one image in the next free cell (see createPlacement). Pass one placement for a run of
    // cards so they continue in order and their pages can be reported together.
    async function addImageSrcToNextCell(src, card, placement){
      placement = placement || createPlacement();
      try{
        const item = card ? createUrlItem(src, card) : await createItemFromSrc(src);
        if (!item) return null;
        return placement.put(item);
      }catch(err){
        console.error('Failed to add image to cell', err);
        return null;
      }
    }
```

- [ ] **Step 6: Report pages in the three callers**

In `addCardByName`, replace:

```js
        await addImageSrcToNextCell(images.front, images);
        setStatus(images.substituted ? 'Added (requested printing not found — used another)' : 'Added');
```

with:

```js
        const placement = createPlacement();
        await addImageSrcToNextCell(images.front, images, placement);
        const label = 'Added ' + (images.name || name) + (images.substituted ? ' (requested printing not found — used another)' : '');
        setStatus(label + describePlacedPages(placement.pagesUsed));
```

In `importDecklist`, replace:

```js
      let placed = 0, missing = 0, substituted = 0, failed = 0;
```

with:

```js
      let placed = 0, missing = 0, substituted = 0, failed = 0;
      const placement = createPlacement();
```

then replace (same function):

```js
        await addImageSrcToNextCell(images.front, images);
```

with:

```js
        await addImageSrcToNextCell(images.front, images, placement);
```

then replace (same function):

```js
      setStatus(notes.length ? `Done — ${notes.join(', ')}` : 'Done');
```

with:

```js
      setStatus((notes.length ? `Done — ${notes.join(', ')}` : 'Done') + describePlacedPages(placement.pagesUsed));
```

In `addMissingDFCBacks`, replace:

```js
      let placed = 0;
      for (const entry of toAdd){
        // A placed back face has no further face to add.
        await addImageSrcToNextCell(entry.backUrl, { name: entry.name, back: null });
```

with:

```js
      let placed = 0;
      const placement = createPlacement();
      for (const entry of toAdd){
        // A placed back face has no further face to add.
        await addImageSrcToNextCell(entry.backUrl, { name: entry.name, back: null }, placement);
```

then replace (same function):

```js
      setStatus('Added ' + toAdd.length + ' DFC back face(s)' + failureNote);
```

with:

```js
      setStatus('Added ' + toAdd.length + ' DFC back face(s)' + describePlacedPages(placement.pagesUsed) + failureNote);
```

- [ ] **Step 7: Run the test and confirm it passes**

Run `tests-placement-core.js`. Expected: every line starts with `PASS` (16 checks).

- [ ] **Step 8: Commit**

```bash
git add "MTG Proxy Maker.html"
git commit -m "feat: new cards fill the first empty cell from page 1; view stays put

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Files, URLs, drops and paste use the placement (cell and page anchors)

**Files:**
- Create: `.claude/tests/tests-placement-anchors.js`
- Modify: `MTG Proxy Maker.html` — `processDroppedImageData` / `handleDropEvent` (~line 1591), cell/grid drop handlers in `wireGridEvents` (~line 1873, ~1904), `fileInput` change handler (~line 2077), `pageWrap` drop handler (~line 2135), `preferredSlotForPage` / `pasteImageFromClipboard` (~line 2312), document `paste` handler (~line 2359), `assignFileToIndex` / `nextEmptySlot` / `createPlacementState` / `handleFilesIntoCell` / `handleFiles` / `handleImageUrls` (~lines 2493–2651)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-placement-anchors.js`:

```js
// Gap-free placement: cell anchors, page anchors, drops.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const fresh = (pageCount) => { window.confirm = () => true; if (previewActive) exitPreview(); clearAllPages(true); for (let i = 1; i < pageCount; i++) addPage(); showPage(0); };
  const card = (name) => createUrlItem('https://example.invalid/' + encodeURIComponent(name) + '.png', { name: name, back: null });
  const put = (page, index, name) => { pages[page].items[index] = card(name); renderCell(pages[page], index); };
  const lbl = (i) => i ? (i.name || decodeURIComponent(i.url.split('/').pop().replace(/\.png$/, ''))) : '.';
  const layout = () => pages.map(p => p.items.map(lbl).join(' ')).join(' | ');
  const status = () => new Promise(r => setTimeout(() => r(document.getElementById('status').textContent), 80));
  const urls = (names) => names.map(n => 'https://example.invalid/' + n + '.png');
  const pngFile = async (i) => { const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; const g = cv.getContext('2d'); g.fillStyle = 'hsl(' + (i * 40) + ',70%,50%)'; g.fillRect(0, 0, 50, 70);
    const b = await new Promise(r => cv.toBlob(r, 'image/png')); return new File([b], 'c' + i + '.png', { type: 'image/png' }); };

  await run('cell anchor (URLs)', async () => {
    fresh(2);
    ['a', null, 'b', 'X', 'c', null, 'd', 'e', 'f'].forEach((n, i) => { if (n) put(0, i, n); });
    put(1, 0, 'Z');
    const placement = createPlacement(cellAnchor(pages[0], 3));
    const n = await handleImageUrls(urls(['A', 'B', 'C', 'D']), placement);
    const want = 'a . b A c B d e f | Z C D . . . . . .';
    ok('replaces target, fills forward across pages before earlier gaps', n === 4 && layout() === want, n + ' / ' + layout());
  });

  await run('page anchor (URLs)', async () => {
    fresh(2);
    ['a', 'b', null, 'c', 'd', 'e', 'f', 'g', 'h'].forEach((n, i) => { if (n) put(0, i, n); });
    put(1, 0, 'y'); put(1, 2, 'z');
    await handleImageUrls(urls(['A', 'B']), createPlacement(pageAnchor(1)));
    ok("that page's gaps first", layout() === 'a b . c d e f g h | y A z B . . . . .', layout());
    fresh(2);
    ['a', 'b', null, 'c', 'd', 'e', 'f', 'g', 'h'].forEach((n, i) => { if (n) put(0, i, n); });
    'ijklmnopq'.split('').forEach((n, i) => put(1, i, n));
    await handleImageUrls(urls(['A']), createPlacement(pageAnchor(1)));
    ok('full page -> earliest gap from page 1', layout().startsWith('a b A c'), layout());
  });

  await run('files: cell anchor and no anchor', async () => {
    const files = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8].map(pngFile));
    fresh(1);
    'abcdefgh'.split('').forEach((n, i) => put(0, i + 1, n));   // cells 2-9 = a-h
    pages[0].items[1] = null; renderCell(pages[0], 1);           // gaps at cells 1-2 (1-based); b-h fill cells 3-9
    const placement = createPlacement(cellAnchor(pages[0], 5));
    await handleFiles(files.slice(0, 3), placement);
    const kinds = () => pages.map(p => p.items.map(i => !i ? '.' : i.type === 'stored' ? '#' : lbl(i)).join(' ')).join(' | ');
    ok('first file replaces target; rest go to earliest gaps', kinds() === '# # b c d # f g h', kinds());
    fresh(1);
    await handleFiles(files, createPlacement());
    ok('9 files on an empty page -> 1 page', pages.length === 1 && pages[0].items.every(Boolean), pages.length + ' pages');
  });

  await run('drop on a hidden page names it', async () => {
    fresh(2); showPage(1);
    const dt = new DataTransfer(); dt.items.add(await pngFile(1));
    pages[0].gridEl.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 600));
    const s = await status();
    ok('status "Added image from drop (page 1)"', s === 'Added image from drop (page 1)', s);
    ok('view stays on page 2', currentPage === 1, 'currentPage ' + currentPage);
  });

  await run('old helpers removed', async () => {
    ok('handleFilesIntoCell / createPlacementState / nextEmptySlot / preferredSlotForPage gone',
      typeof handleFilesIntoCell === 'undefined' && typeof createPlacementState === 'undefined' &&
      typeof nextEmptySlot === 'undefined' && typeof preferredSlotForPage === 'undefined', '');
  });

  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it and confirm it fails**

Run `tests-placement-anchors.js`. Expected: FAIL lines including `threw: cellAnchor is not defined`, `threw: pageAnchor is not defined`, and the "old helpers removed" check.

- [ ] **Step 3: Replace the placement helpers and the two add handlers**

Four edits in the block between `async function assignFileToIndex` and `/* ===== Pager & Clear helpers ===== */`. Leave `nextEmptySlotFrom`, `appendPageSlot`, `createPlacement` and `describePlacedPages` (Task 1) as they are.

(a) Delete the one-line function:

```js
    function nextEmptySlot(startPage){ if(startPage==null) startPage=0; for(var p=startPage;p<pages.length;p++){ var model=pages[p]; var idx=model.items.findIndex(x=>x==null); if(idx!==-1) return {page:p, index: idx}; } return null; }
```

(b) Delete the whole `function createPlacementState(opts){ … }` (from `function createPlacementState(opts){` through its closing `return { claimSlot };` and `}`).

(c) Replace `async function handleFilesIntoCell(model, targetIdx, fileList){ … }`, `async function handleFiles(fileList, opts){ … }` and `async function handleImageUrls(urlList, opts){ … }` (all three, which are consecutive) with:

```js
    // Anchors for createPlacement: a cell to put the first card in, or a page to fill first.
    function cellAnchor(model, index){
      const p = pages.indexOf(model);
      return p === -1 ? null : { replaceAt: { page: p, index: index } };
    }

    function pageAnchor(pageIdx){
      return (typeof pageIdx === 'number' && pageIdx >= 0 && pageIdx < pages.length) ? { from: { page: pageIdx, index: 0 } } : null;
    }

    // Adds image files through `placement` (default: next free cells from page 1). Returns how
    // many were placed; placement.pagesUsed says where.
    async function handleFiles(fileList, placement){
      const files = filterImageFiles(fileList);
      if(!files.length) return 0;
      await imageStoreReady;
      placement = placement || createPlacement();
      let placed = 0;
      await processImageFilesInBatches(files, async (_, dataUrl) => {
        try{
          const item = await createStoredItemFromDataUrl(dataUrl);
          if(!item) return;
          placement.put(item);
          placed++;
        }catch(err){
          console.error('Failed to store added image', err);
        }
      });
      return placed;
    }

    async function handleImageUrls(urlList, placement){
      const urls = Array.from(urlList || []).map(function(u){
        return typeof u === 'string' ? u.trim() : '';
      }).filter(isProbablyImageUrl);
      if(!urls.length) return 0;
      placement = placement || createPlacement();
      let placed = 0;
      for (const src of urls){
        try{
          const item = await createItemFromSrc(src);
          if(!item) continue;
          placement.put(item);
          placed++;
        }catch(err){
          console.error('Failed to handle image URL', err);
        }
      }
      return placed;
    }
```

(d) Replace:

```js
    async function assignFileToIndex(file, pageIdx, cellIdx){
      if(!looksLikeImageFile(file)) return 0;
      const model = pages[pageIdx];
      if(!model) return 0;
      return handleFilesIntoCell(model, cellIdx, [file]);
    }
```

with:

```js
    async function assignFileToIndex(file, pageIdx, cellIdx){
      if(!looksLikeImageFile(file)) return 0;
      if(!pages[pageIdx]) return 0;
      return handleFiles([file], createPlacement({ replaceAt: { page: pageIdx, index: cellIdx } }));
    }
```

- [ ] **Step 4: Drops**

Replace `processDroppedImageData` and the first part of `handleDropEvent`:

```js
    async function processDroppedImageData(dt, opts){
      if (!dt) return 0;
      const files = dt.files ? filterImageFiles(dt.files) : [];
      if (files.length){
        if (opts && opts.targetCell && opts.targetCell.model){
          return handleFilesIntoCell(opts.targetCell.model, opts.targetCell.index, files);
        }
        const fileOpts = {};
        if (opts && typeof opts.startPage === 'number') fileOpts.startPage = opts.startPage;
        if (opts && opts.preferredSlot) fileOpts.preferredSlot = opts.preferredSlot;
        if (opts && opts.allowOverwrite) fileOpts.allowOverwrite = true;
        return handleFiles(files, fileOpts);
      }

      const urls = extractUrlsFromDataTransfer(dt);
      if (urls.length){
        const urlOpts = {};
        if (opts && typeof opts.startPage === 'number') urlOpts.startPage = opts.startPage;
        if (opts && opts.preferredSlot) urlOpts.preferredSlot = opts.preferredSlot;
        if (opts && opts.allowOverwrite) urlOpts.allowOverwrite = true;
        return handleImageUrls(urls, urlOpts);
      }
      return 0;
    }

    async function handleDropEvent(e, opts){
      const dt = e.dataTransfer || null;
      if (!dataTransferHasImage(dt)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const placed = await processDroppedImageData(dt, opts);
        if (placed > 0){
          setStatus(placed === 1 ? 'Added image from drop' : `Added ${placed} images from drop`);
```

with:

```js
    async function processDroppedImageData(dt, placement){
      if (!dt) return 0;
      const files = dt.files ? filterImageFiles(dt.files) : [];
      if (files.length) return handleFiles(files, placement);
      const urls = extractUrlsFromDataTransfer(dt);
      if (urls.length) return handleImageUrls(urls, placement);
      return 0;
    }

    // anchor: cellAnchor(...), pageAnchor(...) or null
    async function handleDropEvent(e, anchor){
      const dt = e.dataTransfer || null;
      if (!dataTransferHasImage(dt)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const placement = createPlacement(anchor);
        const placed = await processDroppedImageData(dt, placement);
        if (placed > 0){
          setStatus((placed === 1 ? 'Added image from drop' : `Added ${placed} images from drop`) + describePlacedPages(placement.pagesUsed));
```

In `wireGridEvents`, replace the cell drop listener body:

```js
        cell.addEventListener('drop', async (e) => {
          cell.classList.remove('drop-target');
          const pageIdx = pages.indexOf(model);
          const preferredSlot = pageIdx === -1 ? null : { page: pageIdx, index: idx };
          await handleDropEvent(e, {
            targetCell: { model, index: idx },
            preferredSlot,
            startPage: pageIdx >= 0 ? pageIdx : undefined,
            allowOverwrite: true
          });
        });
```

with:

```js
        cell.addEventListener('drop', async (e) => {
          cell.classList.remove('drop-target');
          await handleDropEvent(e, cellAnchor(model, idx));
        });
```

and in the grid's `['dragleave','drop']` listener replace:

```js
            const pageIdx = pages.indexOf(model);
            await handleDropEvent(e, { startPage: pageIdx >= 0 ? pageIdx : undefined });
```

with:

```js
            await handleDropEvent(e, pageAnchor(pages.indexOf(model)));
```

In the `pageWrap` `['dragleave','drop']` listener replace:

```js
          await handleDropEvent(e, { startPage: pageIdx >= 0 ? pageIdx : undefined });
```

with:

```js
          await handleDropEvent(e, pageAnchor(pageIdx));
```

- [ ] **Step 5: Add Images button**

In the `fileInput` change handler replace:

```js
      handleFiles(selected)
        .then(function(count){
          if(count){
            setStatus(count === 1 ? 'Added 1 image' : `Added ${count} images`);
```

with:

```js
      const placement = createPlacement();
      handleFiles(selected, placement)
        .then(function(count){
          if(count){
            setStatus((count === 1 ? 'Added 1 image' : `Added ${count} images`) + describePlacedPages(placement.pagesUsed));
```

- [ ] **Step 6: Paste**

Delete `function preferredSlotForPage(pageIdx){ … }` (7 lines, ends `return empty !== -1 ? { page: pageIdx, index: empty } : null;` and `}`).

In `pasteImageFromClipboard`, replace:

```js
        let placed = 0;
        if(target && target.model && typeof target.index === 'number'){
          placed = await handleFilesIntoCell(target.model, target.index, files);
        } else if(target && typeof target.pageIndex === 'number'){
          const preferred = preferredSlotForPage(target.pageIndex);
          placed = await handleFiles(files, {
            startPage: target.pageIndex,
            preferredSlot: preferred,
            allowOverwrite: !!target.allowOverwrite
          });
        } else {
          placed = await handleFiles(files);
        }
        if(placed > 0){
          setStatus(placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`);
          return true;
        }
```

with:

```js
        const anchor = (target && target.model && typeof target.index === 'number') ? cellAnchor(target.model, target.index)
          : (target && typeof target.pageIndex === 'number') ? pageAnchor(target.pageIndex)
          : null;
        const placement = createPlacement(anchor);
        const placed = await handleFiles(files, placement);
        if(placed > 0){
          setStatus((placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`) + describePlacedPages(placement.pagesUsed));
          return true;
        }
```

In the document `paste` listener, replace:

```js
        const resolved = focusedCell ? resolveModelFromCellEl(focusedCell) : null;
        const resolvedPageIdx = resolved ? pages.indexOf(resolved.model) : -1;
```

with:

```js
        const resolved = focusedCell ? resolveModelFromCellEl(focusedCell) : null;
        const anchor = resolved && resolved.model ? cellAnchor(resolved.model, resolved.index) : null;
```

then replace:

```js
            let placed = 0;
            if(resolved && resolved.model){
              placed = await handleFilesIntoCell(resolved.model, resolved.index, files);
            } else {
              placed = await handleFiles(files);
            }
            setStatus(placed ? (placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`) : 'Clipboard does not contain image data');
```

with:

```js
            const placement = createPlacement(anchor);
            const placed = await handleFiles(files, placement);
            setStatus(placed ? (placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`) + describePlacedPages(placement.pagesUsed) : 'Clipboard does not contain image data');
```

then replace:

```js
            let placed = 0;
            if(resolved && resolved.model){
              placed = await handleImageUrls(urls, {
                preferredSlot: resolvedPageIdx === -1 ? null : { page: resolvedPageIdx, index: resolved.index },
                startPage: resolvedPageIdx,
                allowOverwrite: true
              });
            } else {
              placed = await handleImageUrls(urls, { startPage: currentPage });
            }
            setStatus(placed ? (placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`) : 'Clipboard does not contain image data');
```

with:

```js
            const placement = createPlacement(anchor);
            const placed = await handleImageUrls(urls, placement);
            setStatus(placed ? (placed === 1 ? 'Pasted image from clipboard' : `Pasted ${placed} images from clipboard`) + describePlacedPages(placement.pagesUsed) : 'Clipboard does not contain image data');
```

then replace:

```js
          const target = resolved && resolved.model
            ? { model: resolved.model, index: resolved.index, pageIndex: resolvedPageIdx, allowOverwrite: true }
            : { pageIndex: currentPage };
          await pasteImageFromClipboard(target);
```

with:

```js
          await pasteImageFromClipboard(resolved && resolved.model ? { model: resolved.model, index: resolved.index } : null);
```

- [ ] **Step 7: Check nothing still uses the removed helpers**

Run: `grep -n "handleFilesIntoCell\|createPlacementState\|preferredSlotForPage\|nextEmptySlot(\|resolvedPageIdx\|startPage:" "MTG Proxy Maker.html"`
Expected: no output.

- [ ] **Step 8: Run the tests and confirm they pass**

Run `tests-placement-anchors.js` — expected all `PASS` (8 checks). Then run `tests-placement-core.js` — still all `PASS`.

- [ ] **Step 9: Commit**

```bash
git add "MTG Proxy Maker.html"
git commit -m "feat: files, URLs, drops and paste use the shared placement rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: "Duplicate to next empty cell" uses the placement

**Files:**
- Create: `.claude/tests/tests-duplicate.js`
- Modify: `MTG Proxy Maker.html` — `duplicateToNextEmpty` (~line 4299)

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-duplicate.js`:

```js
// "Duplicate to next empty cell": after the original when possible, else the earliest gap, else a new page.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const fresh = (pageCount) => { window.confirm = () => true; if (previewActive) exitPreview(); clearAllPages(true); for (let i = 1; i < pageCount; i++) addPage(); showPage(0); };
  const card = (name) => createUrlItem('https://example.invalid/' + encodeURIComponent(name) + '.png', { name: name, back: null });
  const put = (page, index, name) => { pages[page].items[index] = card(name); renderCell(pages[page], index); };
  const lbl = (i) => i ? (i.name || '?') : '.';
  const layout = () => pages.map(p => p.items.map(lbl).join(' ')).join(' | ');
  const status = () => new Promise(r => setTimeout(() => r(document.getElementById('status').textContent), 80));
  const row = ['A', null, 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  await run('after the original, across pages', async () => {
    fresh(2); row.forEach((n, i) => { if (n) put(0, i, n); });
    await duplicateToNextEmpty(pages[0], 3);
    ok('copy of C on page 2 cell 1', layout() === 'A . B C D E F G H | C . . . . . . . .', layout());
  });

  await run('else the earliest gap', async () => {
    fresh(1); row.forEach((n, i) => { if (n) put(0, i, n); });
    await duplicateToNextEmpty(pages[0], 3);
    ok('copy of C fills cell 2', layout() === 'A C B C D E F G H', layout());
  });

  await run('else a new page, view stays', async () => {
    fresh(1); 'ABCDEFGHI'.split('').forEach((n, i) => put(0, i, n));
    await duplicateToNextEmpty(pages[0], 0);
    ok('new page 2 holds the copy', pages.length === 2 && lbl(pages[1].items[0]) === 'A', layout());
    ok('view stays on page 1', currentPage === 0, 'currentPage ' + currentPage);
    const s = await status();
    ok('status "Duplicated card (page 2)"', s === 'Duplicated card (page 2)', s);
  });

  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it and confirm it fails**

Run `tests-duplicate.js`. Expected: FAIL on "else the earliest gap" (current code appends a page instead) and on the status check.

- [ ] **Step 3: Implement**

Replace the whole `async function duplicateToNextEmpty(model, index){ … }` with:

```js
    async function duplicateToNextEmpty(model, index){
      if (!model || !model.items[index]) return null;
      const pageIdx = pages.indexOf(model);
      if (pageIdx === -1) return null;
      try{
        const clone = await cloneItem(model.items[index]);
        if (!clone) return null;
        const placement = createPlacement({ from: { page: pageIdx, index: index + 1 } });
        const slot = placement.put(clone);
        setStatus('Duplicated card' + describePlacedPages(placement.pagesUsed));
        return slot;
      }catch(err){
        console.error('Failed to duplicate image', err);
        return null;
      }
    }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run `tests-duplicate.js`. Expected: all `PASS` (5 checks).

- [ ] **Step 5: Commit**

```bash
git add "MTG Proxy Maker.html"
git commit -m "feat: duplicate fills after the original, then the earliest gap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: "Remove gaps" command

**Files:**
- Create: `.claude/tests/tests-remove-gaps.js`
- Modify: `MTG Proxy Maker.html` — controls panel markup (~line 469), `addDFCBacksBtn` listener block (~line 3536), `buildPageMenu` (~line 4411), help text (~line 1181)
- Modify: `README.md` — Features list

- [ ] **Step 1: Write the failing test** — create `.claude/tests/tests-remove-gaps.js`:

```js
// "Remove gaps": re-flow cards in reading order, drop trailing empty pages, keep one page.
(async () => {
  const results = [];
  const ok = (label, cond, detail) => results.push((cond ? 'PASS ' : 'FAIL ') + label + (cond ? '' : '\n   ' + detail));
  const run = async (label, fn) => { try { await fn(); } catch (e) { results.push('FAIL ' + label + '\n   threw: ' + e.message); } };
  const fresh = (pageCount) => { window.confirm = () => true; if (previewActive) exitPreview(); clearAllPages(true); for (let i = 1; i < pageCount; i++) addPage(); showPage(0); };
  const card = (name) => createUrlItem('https://example.invalid/' + encodeURIComponent(name) + '.png', { name: name, back: null });
  const put = (page, index, name) => { pages[page].items[index] = card(name); renderCell(pages[page], index); };
  const lbl = (i) => !i ? '.' : i.type === 'stored' ? '#' : (i.name || '?');
  const layout = () => pages.map(p => p.items.map(lbl).join(' ')).join(' | ');
  const status = () => new Promise(r => setTimeout(() => r(document.getElementById('status').textContent), 80));

  await run('closes gaps across pages', async () => {
    fresh(3);
    put(0, 0, 'A'); put(0, 2, 'B'); put(0, 5, 'C'); put(2, 0, 'D'); put(2, 8, 'E');
    removeGaps();
    ok('order kept, trailing pages removed', layout() === 'A B C D E . . . .', layout());
    ok('status', (await status()) === 'Moved 4 card(s); removed 2 empty page(s)', await status());
    const saved = JSON.parse(localStorage.getItem('mtgProxyPages'));
    ok('saved', saved.pages.length === 1 && saved.pages[0].filter(Boolean).length === 5, JSON.stringify(saved.pages.map(p => p.filter(Boolean).length)));
  });

  await run('nothing to do', async () => {
    fresh(1); put(0, 0, 'A'); put(0, 1, 'B'); put(0, 2, 'C');
    removeGaps();
    ok('layout unchanged', layout() === 'A B C . . . . . .', layout());
    ok('status "No gaps to remove"', (await status()) === 'No gaps to remove', await status());
  });

  await run('only trailing empty pages', async () => {
    fresh(2); 'ABCDEFGHI'.split('').forEach((n, i) => put(0, i, n));
    removeGaps();
    ok('1 page left', pages.length === 1, pages.length + ' pages');
    ok('status "Removed 1 empty page(s)"', (await status()) === 'Removed 1 empty page(s)', await status());
  });

  await run('keeps one page', async () => {
    fresh(3);
    removeGaps();
    ok('1 empty page remains', pages.length === 1 && !pages[0].items.some(Boolean), pages.length + ' pages');
  });

  await run('current page clamped', async () => {
    fresh(3); put(0, 0, 'A'); showPage(2);
    removeGaps();
    ok('view on the remaining page', currentPage === 0 && pageBadge.textContent === 'Page 1 / 1', currentPage + ' / ' + pageBadge.textContent);
  });

  await run('uploaded image survives the move', async () => {
    fresh(2);
    const cv = document.createElement('canvas'); cv.width = 50; cv.height = 70; cv.getContext('2d').fillRect(0, 0, 50, 70);
    const stored = await createStoredItemFromDataUrl(cv.toDataURL('image/png'));
    pages[1].items[3] = stored; renderCell(pages[1], 3);
    removeGaps();
    await new Promise(r => setTimeout(r, 500));
    const img = pages[0].cells[0].querySelector('img');
    let blobOk = false; try { await imageStore.getBlob(stored.key); blobOk = true; } catch (_) {}
    ok('same stored item in cell 1, blob kept, image shown', pages[0].items[0] === stored && blobOk && img && img.naturalWidth > 0, layout() + ' blob ' + blobOk);
  });

  await run('internal cut cancelled', async () => {
    fresh(1); put(0, 2, 'A');
    internalCut(pages[0], 2);
    removeGaps();
    ok('internal clipboard cleared', internalClipboard === null, JSON.stringify(internalClipboard && internalClipboard.mode));
  });

  await run('button and menu', async () => {
    ok('toolbar button exists', !!document.getElementById('removeGapsBtn'), '');
    fresh(1); put(0, 0, 'A');
    const noGaps = document.createElement('div'); buildPageMenu(noGaps);
    const itemNo = [...noGaps.querySelectorAll('.ctx-item')].find(el => el.textContent.trim() === 'Remove gaps');
    put(0, 3, 'B');
    const gaps = document.createElement('div'); buildPageMenu(gaps);
    const itemYes = [...gaps.querySelectorAll('.ctx-item')].find(el => el.textContent.trim() === 'Remove gaps');
    ok('menu entry disabled without gaps, enabled with gaps',
      itemNo && itemNo.getAttribute('aria-disabled') === 'true' && itemYes && itemYes.getAttribute('aria-disabled') === 'false', '');
  });

  window.confirm = () => true; clearAllPages(true);
  return results.join('\n');
})()
```

- [ ] **Step 2: Run it and confirm it fails**

Run `tests-remove-gaps.js`. Expected: FAIL lines with `threw: removeGaps is not defined` and the button/menu check failing.

- [ ] **Step 3: Add the toolbar button**

Replace:

```html
        <div class="field">
          <button id="addDFCBacksBtn" class="secondary" title="Scan placed cards and add any missing DFC back faces">Add missing DFC backs</button>
        </div>
```

with:

```html
        <div class="field">
          <button id="addDFCBacksBtn" class="secondary" title="Scan placed cards and add any missing DFC back faces">Add missing DFC backs</button>
        </div>
        <div class="field">
          <button id="removeGapsBtn" class="secondary" title="Slide cards back to close empty cells and remove empty pages at the end">Remove gaps</button>
        </div>
```

- [ ] **Step 4: Implement `removeGaps` and wire the button**

Find the block:

```js
    if (addDFCBacksBtn){
      addDFCBacksBtn.addEventListener('click', function(){
        addMissingDFCBacks().catch(function(err){
          console.error('DFC back faces error:', err);
          setStatus('Error adding DFC backs: ' + err.message);
        });
      });
    }
```

and insert immediately after it:

```js

    /* ===== Remove gaps ===== */
    // What "Remove gaps" would do: every card in reading order, how many would change cell, and how
    // many pages would be left empty at the end (at least one page always stays).
    function planRemoveGaps(){
      const cards = [];
      let moved = 0;
      pages.forEach(function(m, p){
        m.items.forEach(function(item, i){
          if (!item) return;
          if (p * CELLS_PER_PAGE + i !== cards.length) moved++;
          cards.push(item);
        });
      });
      const keepPages = Math.max(1, Math.ceil(cards.length / CELLS_PER_PAGE));
      return { cards: cards, moved: moved, keepPages: keepPages, removedPages: pages.length - keepPages };
    }

    function layoutHasGaps(){
      const plan = planRemoveGaps();
      return plan.moved > 0 || plan.removedPages > 0;
    }

    // Slides every card back to close gaps, keeping reading order, and removes pages left empty at
    // the end. Card objects are moved, never cloned or deleted, so stored images are untouched.
    function removeGaps(){
      const plan = planRemoveGaps();
      if (!plan.moved && !plan.removedPages){
        setStatus('No gaps to remove');
        return;
      }
      clearInternalClipboard();
      while (pages.length > plan.keepPages){
        pages.pop().pageEl.remove();
      }
      pages.forEach(function(m, p){
        m.items = new Array(CELLS_PER_PAGE).fill(null);
        for (let i = 0; i < CELLS_PER_PAGE; i++){
          m.items[i] = plan.cards[p * CELLS_PER_PAGE + i] || null;
        }
        renderGrid(m);
      });
      syncCutMarksState();
      showPage(Math.min(currentPage, pages.length - 1));   // also saves state
      const parts = [];
      if (plan.moved) parts.push('moved ' + plan.moved + ' card(s)');
      if (plan.removedPages) parts.push('removed ' + plan.removedPages + ' empty page(s)');
      const msg = parts.join('; ');
      setStatus(msg.charAt(0).toUpperCase() + msg.slice(1));
    }

    var removeGapsBtn = document.getElementById('removeGapsBtn');
    if (removeGapsBtn){
      removeGapsBtn.addEventListener('click', removeGaps);
    }
```

- [ ] **Step 5: Page menu entry**

In `buildPageMenu`, replace:

```js
      pageSection.appendChild(ctxItem('Clear this page', function(){
        if (pageIdx !== currentPage) showPage(pageIdx);
        clearCurrentPage();
      }, { disabled: !hasContent, kbd: 'Ctrl+Del' }));
```

with:

```js
      pageSection.appendChild(ctxItem('Clear this page', function(){
        if (pageIdx !== currentPage) showPage(pageIdx);
        clearCurrentPage();
      }, { disabled: !hasContent, kbd: 'Ctrl+Del' }));
      pageSection.appendChild(ctxItem('Remove gaps', function(){ removeGaps(); }, { disabled: !layoutHasGaps() }));
```

- [ ] **Step 6: Help text and README**

In `ensureHelpModal`, replace:

```js
        'New pages are created automatically when needed.',
```

with:

```js
        'New cards fill the first empty cell from page 1; new pages are created when needed. <b>Remove gaps</b> slides cards back to close empty cells.',
```

In `README.md`, replace:

```markdown
- **Multiple pages** — add as many pages as you need; all pages print at once
```

with:

```markdown
- **Multiple pages** — add as many pages as you need; all pages print at once. New cards fill the first empty cell, and **Remove gaps** closes up empty cells left by deleting cards
```

- [ ] **Step 7: Run the test and confirm it passes**

Run `tests-remove-gaps.js`. Expected: all `PASS` (12 checks).

- [ ] **Step 8: Commit**

```bash
git add "MTG Proxy Maker.html" README.md
git commit -m "feat: Remove gaps command (toolbar button and page menu)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Full regression

**Files:** none modified unless a regression is found.

- [ ] **Step 1: Run every suite on a fresh page load**

Navigate to `http://localhost:8765/MTG%20Proxy%20Maker.html`, then run:

```js
await new Promise(r => setTimeout(r, 1000));
const out = [];
for (const f of ['tests-parse.js', 'tests-fetch.js', 'tests-ratelimit.js', 'tests-remaining.js',
                 'tests-placement-core.js', 'tests-placement-anchors.js', 'tests-duplicate.js', 'tests-remove-gaps.js']){
  const r = await eval(await (await fetch('/.claude/tests/' + f, { cache: 'no-store' })).text());
  const lines = String(r).split('\n').filter(l => /^(PASS|FAIL)/.test(l));
  const fails = String(r).split('\n').filter(l => !l.startsWith('PASS'));
  out.push(f + ': ' + (lines.length - lines.filter(l => l.startsWith('FAIL')).length) + '/' + lines.length + ' pass' + (fails.length ? '\n  ' + fails.join('\n  ') : ''));
}
out.join('\n')
```

Expected: every file reports all checks passing (50 existing + 41 new = 91).

- [ ] **Step 2: Check the console for new errors**

Use `mcp__Claude_Browser__read_console_messages` with `onlyErrors: true`. Expected: only 404s for `https://example.invalid/...` test images and Scryfall 404s for deliberately fake cards; no `TypeError`/`ReferenceError`.

- [ ] **Step 3: Visual check**

Take a screenshot (`mcp__Claude_Browser__computer` `screenshot`) after adding a few cards and confirm the "Remove gaps" button sits next to "Add missing DFC backs".

- [ ] **Step 4: Report** — do not push; the user approves pushes.
