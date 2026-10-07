# Print pipeline and deck tools

Date: 2026-10-06 · Status: approved design, awaiting spec review

Two groups of features, designed together and built in two batches, each with its own plan,
branch, reviews and push approval:

- **Part 1 — Print pipeline:** print settings, a layout calculator, gaps, bleed, cut-line styles,
  Letter/A4, double-sided printing with card backs, PDF export.
- **Part 2 — Deck tools:** a deck panel (replacing the Decklist button), an art picker, tokens.

The app stays a single HTML file (`MTG Proxy Maker.html`) plus static assets served alongside it.
Pages stay 3 × 3 (9 cards); saved layouts and exports keep that shape.

## 0. Print correctness comes first

The app exists to size and fit MTG cards onto a page so they print correctly. That works today and
must keep working; every other feature here is secondary to it. Concretely:

1. **Default output is unchanged.** With default settings (Letter, gap 0, bleed off, Ticks) and any
   existing saved printer tuning, printed output must be pixel-identical to today's (`main` at
   `d3348fd`): same number of sheets, same page size, same card positions and sizes, same cut marks.
2. **Existing users keep Letter.** The region-based paper default (section 1) applies only when no
   print settings are saved yet. Saved settings without a paper field mean Letter (today's
   behaviour), so nobody's printout changes unless they change the setting.
3. **Real-print regression tests**, not just on-screen checks. `.claude/tests/print-harness.mjs`
   drives headless Chrome over the DevTools protocol, builds deterministic layouts (745 × 1040
   numbered test images), measures every card and cut mark in the **print** layout, and saves
   Chrome's actual print output (`Page.printToPDF` honouring `@page`, i.e. what the print dialog
   produces at 100 %). `.claude/tests/compare-prints.py` (PyMuPDF in `.claude/tests/.venv`) checks
   sheet count and page size and compares the rendered pages pixel by pixel at 150 DPI (tolerance
   0.05 % of pixels for anti-aliasing), writing a diff image on failure.
   - Baseline captured from `main` at `d3348fd` in `.claude/tests/print-baseline/` before any
     change: `one-page-plain` (9 cards, cut marks off), `two-pages-cuts` (11 cards, cut marks on),
     `tuned-full-size` (top 0.4″, offset 0.1″, 2.5 × 3.5″ cards). Two independent runs of today's
     app produced 0 differing pixels; the comparison was confirmed to flag a real change.
   - Every task that touches layout, rendering or printing runs the comparison before it is
     considered done, and again in the final review.
4. **New settings are verified the same way.** For Letter and A4 × gap {0, 3 mm} × bleed {off, 3 mm}
   × double-sided on/off: measured print-layout boxes equal the calculator's within 0.001″; sheet
   count equals front pages (× 2 when double-sided); page size is exactly Letter or A4. PDF export
   is checked against the calculator by reading image and line positions back from the PDF.
5. **A real paper check before pushing batch 1.** The user prints a test sheet with default
   settings, A4, a 3 mm gap with bleed, and a double-sided page, and measures a card with a ruler
   (default 99 % size: 62.9 × 88.0 mm) and the front/back alignment.

## Decisions made with the user

| # | Decision |
|---|---|
| 1 | Support both trimmer and scissor cutting. Cutting-machine support is parked. |
| 2 | Bleed is a setting: Off (default) / 1 / 2 / 3 mm, filled with the card's border colour. |
| 3 | Paper: Letter and A4 only, always 3 × 3. Rotation gains nothing on either; larger paper is parked. |
| 4 | Cut-line styles: Ticks (today, default), Full lines, Corners. |
| 5 | All print settings live in the existing Advanced dialog (Help → Advanced). No new toolbar entry; paper defaults from the browser's region. |
| 6 | The "Cut marks" control stays in the controls bar as the on/off switch (and `M` key); Advanced picks the style. |
| 7 | Every checkbox in the app becomes a toggle switch. |
| 8 | Default card back: the user-supplied image (trimmed, see "Card back asset"). Players can upload their own. |
| 9 | Turning on double-sided printing with double-faced cards in the layout prompts whether to print DFC back faces on the reverse; if yes and back faces are also placed as separate cards, it offers to remove them. |
| 10 | PDF image quality is the player's choice: high-quality JPEG (default) or original PNG. |
| 11 | PDF is a third option in the existing Export dialog, not a new button. |
| 12 | Deck tools live in a side panel next to the page. |
| 13 | Panel **+** inserts right after the card's last copy, rippling following cards forward until the next empty cell. Panel **−** removes the last copy and ripples following cards back until the next empty cell. |
| 14 | Panel rows are grouped by card name regardless of printing. ⇄ opens an art picker to choose art per copy; changes apply on Done. Right-click "Change printing…" opens the same window. |
| 15 | Add tokens shows a dialog with a quantity per token (default 1). |
| 16 | The Decklist button is replaced by the Deck button; "Paste decklist…" is inside the panel. |
| 17 | Layout geometry comes from one calculator shared by screen, print and PDF. |

**Card back image — risk accepted by the user.** The default back is the official Magic card back
design with the logo and "Deckmaster" text removed. Claude flagged that it is Wizards of the Coast's
design (copyright / trade dress; possible takedown of the public repo or site) and that real-looking
backs move proxies toward counterfeits. The user chose to ship it anyway, noting that many proxy
sites use it.

## Parked (not in this work)

- Mobile and touch support, including the toolbar overflowing narrow screens (reproduced at
  744 px: the toolbar's 966 px minimum width widens the whole app and pushes Print off-screen).
- Cutting-machine registration marks.
- Larger paper (A3/Tabloid/Legal) with more cards per page and rotated cards.

---

# Part 1 — Print pipeline

## 1. Settings and controls

The Advanced dialog becomes the home of every print setting. Contents, top to bottom:

| Setting | Options | Default |
|---|---|---|
| Paper | Letter · A4 | From the browser region (first of `navigator.languages` with a region): Letter for US, CA, MX, PH, CL, CO, VE, GT, CR, PA, DO, SV, NI, HN, PR, and when no region is known; A4 otherwise. Only when no print settings are saved yet; saved settings without a paper field mean Letter (section 0) |
| Gap between cards | 0 · 1 · 2 · 3 mm | 0 |
| Bleed | Off · 1 · 2 · 3 mm | Off |
| Cut-line style | Ticks · Full lines · Corners | Ticks; Corners is disabled with a hint when the gap is 0 |
| Double-sided printing | toggle | Off |
| Card back | default image, or **Upload…**; **Reset** returns to the default | Default image |
| ▸ Fine-tuning (collapsed) | Top margin, horizontal offset, card width/height, ratio lock, image fit (all as today), back-side offset X/Y (new, inches, default 0) | Today's values |

- A live mini preview of one sheet reflects the current settings.
- Save validates that everything fits (see 2.3) and explains what doesn't, as today.
- Nothing in the dialog takes effect until Save, double-sided printing, the card back and the back
  offsets included; Close, Esc and the backdrop discard the draft (decided with the user). An
  uploaded back is stored at once so it can be shown, and deleted again unless saved. Reset returns
  gap, bleed, cut style, printer tuning and back offsets to their defaults; paper, double-sided and
  the card back stay.
- Gap and bleed are in millimetres; existing tuning fields stay in inches.
- The controls-bar "Cut marks" switch toggles cut lines on/off in the chosen style.
- All checkboxes (Show guides, Cut marks, decklist "Ignore basic lands" / "Ignore snow-covered
  basics", ratio lock, double-sided) are restyled as toggle switches with CSS; they remain
  `<input type="checkbox">` so keyboard and screen-reader behaviour is unchanged.
- Settings persist in the browser with today's tuning (`mtgTuning`, extended) and are included in
  exports. A Full export also embeds an uploaded back image.

## 2. Layout calculator and front pages

### 2.1 Calculator

`computeLayout(settings)` returns, in inches:

- `page: { w, h }` — Letter 8.5 × 11, A4 8.2677 × 11.6929.
- `cards[9]`: `{ trim: {x, y, w, h}, bleed: {x, y, w, h} }` for front pages, in reading order.
- `backCards[9]`: the same boxes mirrored for back pages (see 3.1).
- `cutMarks`: thin rectangles `{ x, y, w, h }` (line thickness included) for the chosen style,
  clipped to the page so nothing can spill onto an extra sheet.
- `problem`: '' when everything fits, else a sentence explaining what doesn't.

Geometry (w, h = card size; b = bleed; g = gap; all inches):

- Bleed box size: `bw = w + 2b`, `bh = h + 2b`. Grid size: `gridW = 3·bw + 2g`, `gridH = 3·bh + 2g`.
- First bleed box: `x0 = (page.w − gridW) / 2 + offsetX`, `y0 = topMargin`.
- Cell (col c, row r): bleed box at `(x0 + c·(bw + g), y0 + r·(bh + g))`; trim box = bleed box
  inset by `b` on every side.
- Fit: `3·bw + 2g + 2·|offsetX| ≤ page.w` and `topMargin + 3·bh + 2g ≤ page.h`; and always (back
  offsets take effect the moment double-sided printing is switched on) `|offsetX + backOffsetX| ≤ (page.w − gridW)/2` and the back grid's top/bottom
  (`topMargin + backOffsetY`) inside the page. Otherwise `problem` names what doesn't fit.
- Loading saved or imported settings that don't fit resets the culprit: gap, bleed and back
  offsets when those are the cause, otherwise the printer tuning.

### 2.2 Rendering

- Screen and print place each cell absolutely at the calculator's boxes (replacing the CSS grid).
  The preview scale-to-fit is unchanged. `@page { size }` follows the paper setting.
- Bleed off: identical to today's output.
- Bleed on: the bleed box is filled with the card's border colour; the image is drawn untouched at
  the trim box on top (image fit Cover/Contain applies inside the trim box). Rounded transparent
  corners therefore show the border colour, and so do Contain's letterbox areas (one continuous
  frame). A card remembers its sampled colour, so moving it never shows another card's colour.
- Guides (dashed outlines) mark trim boxes.

### 2.3 Border-colour sampling

- Sample the outer border: a band 0.5–2 % inside each image edge, skipping pixels with alpha < 200.
  Group colours into 16 levels per channel and use the average of the most common group (a
  per-channel median, the first design, could invent colours not on the card and read into the art
  on thin borders). Cache by image URL. Fall back to black if the image can't be read (e.g. a
  non-CORS image from another site).
- Scryfall images are already loaded with CORS; uploaded images are same-origin blobs.

### 2.4 Cut lines

Thickness and colour as today.

- **Ticks:** exactly today's marks, so default prints stay pixel-identical (section 0): for each
  trim-edge line, a 0.18″ mark centred on the line that starts 0.13″ outside the grid's outer
  edge and ends 0.05″ inside it (today's `--cut-mark-length` 0.18″ and `--cut-mark-inset` 0.05″).
  That last 0.05″ touches the outermost cards' borders (or bleed), as it does today.
- **Full lines:** along each trim edge across the whole page, interrupted wherever the line
  (including its thickness) would overlap a bleed box, so they run through gaps and margins only and
  never touch a card.
- **Corners:** at each trim corner, two arms continuing the trim lines outward from the bleed box,
  each `min(3 mm, 0.4 · g)` long, leaving a visible break between neighbouring cards' marks.
  Requires `g > 0`; with no gap the style falls back to Ticks (enforced when settings are loaded or
  saved).

## 3. Card backs (double-sided printing)

### 3.1 Back pages

- With double-sided printing on, print, preview and PDF emit: front 1, back 1, front 2, back 2, …
- Back boxes mirror the front for a long-edge flip, keeping the horizontal printer offset in the
  back page's own frame (the printer shifts both sides the same way):
  `x_back = page.w − x_front − width + 2·offsetX + backOffsetX`, `y_back = y_front + backOffsetY`
  (applied to both trim and bleed boxes). Corrected during review: plain mirroring would have
  displaced the backs by twice the horizontal offset.
- Back pages have no cut marks.
- Back boxes print exactly at the calculator's positions: Chrome snaps untransformed boxes (and the
  size of transformed ones) to whole CSS pixels when printing, so each back box is laid out at a
  whole-pixel size and moved and scaled into place by a transform. Fronts keep today's snapping
  (section 0.1), so a back is never further from its front than that front's own rounding.
- Preview labels each back page "Back of page N".

### 3.2 What prints on the back

- A double-faced card's own back face, when the player accepted the DFC prompt (uses the item's
  stored `back`; items without that information are looked up by Scryfall card ID, as
  "Add missing DFC backs" does).
- Otherwise the deck back image, with bleed handled as on fronts.
- Empty cells: nothing.

### 3.3 Card back asset

- `card-back.jpg` in the repo root: the user-supplied large scan trimmed to exactly 2.5 : 3.5 —
  frame 953 × 1367 px plus an even 41 px black border = 1035 × 1449 px (≈ 418 DPI at card size).
  Re-encode to keep it reasonably small (target ≤ 300 KB) without visible loss.
- Uploaded backs are stored in the browser's image store like other uploads; the settings keep
  their storage key. Reset returns to `card-back.jpg`.

### 3.4 DFC prompt

When Save turns double-sided printing on (it was off) and the layout contains double-faced cards,
an in-app dialog (not `window.confirm`/`prompt`) opens over the print-settings dialog and asks:

1. "Print the back faces of your N double-faced cards on the reverse of their fronts?" Yes / No.
   The answer is saved and applies to DFCs added later.
2. If Yes and back faces are also placed as separate cards (an item whose image is another placed
   card's stored back): "Remove the N separately placed back faces? They'd print twice." Removal
   uses ripple-remove (5.4).

Closing the first question without an answer (Esc, backdrop) cancels the whole Save: nothing is
saved, no cards are removed and the print-settings dialog stays open. Closing the second keeps the
separately placed backs. Saving with double-sided printing already on asks nothing.

While DFC backs print on the reverse, "Add missing DFC backs" is disabled with an explanatory
tooltip.

## 4. PDF export

- The Export dialog gains a third option, **PDF (ready to print)**, next to Full and Lightweight.
  Choosing it reveals: image quality (High-quality JPEG — default — or Original PNG) with an
  estimated file size, and a reminder to print at "Actual size / 100%". The estimate sums the
  byte sizes of the distinct images (PNG), or a quarter of that (JPEG), shown rounded as "about N MB".
- Library: jsPDF (MIT), the latest stable release at implementation time, vendored as
  `vendor/jspdf.umd.min.js` with its licence and a `vendor/README.md` recording the exact version
  and source URL; loaded on first PDF export, precached by the service worker.
- Pages and order match printing (backs interleaved when double-sided). Page size exactly
  Letter (612 × 792 pt) or A4 (595.28 × 841.89 pt); positions are calculator inches × 72.
- Card images: Cover crops by clipping to the trim box, never by stretching; Contain letterboxes.
  Bleed boxes are filled rectangles; cut marks are vector lines.
- Image data: Scryfall images via fetch (served from the offline cache when present); uploads and
  the back image from the image store. JPEG mode re-encodes at source resolution, quality 0.92;
  PNG mode embeds the original bytes. Each distinct image is embedded once and reused.
- Progress in the status bar ("Building PDF: 12/40 images…"); the Export button is disabled while
  building. An image that can't be read leaves its cell empty; the status reports how many.
- File name `deck-layout-YYYY-MM-DD.pdf`.

---

# Part 2 — Deck tools

## 5. Deck panel

### 5.1 Opening and layout

- The controls-bar **Decklist** button is replaced by **Deck**, which toggles a side panel to the
  right of the page. The preview scale accounts for the panel's width. Open/closed is remembered.
  The panel is hidden in print preview and when printing.
- Top row: **Paste decklist…** (opens today's decklist dialog unchanged, including the "Ignore
  basics" switches and Ctrl+Enter) and **Add tokens…**.
- Header: totals, e.g. "32 cards · 4 pages".
- Empty layout: "Paste a decklist or add cards to get started", with Paste decklist prominent.

### 5.2 Rows

- One row per card name (Scryfall cards), in order of first appearance in reading order.
- Uploaded images: one row per original image; copies made by + or duplicate record `copyOf`
  (the original's storage key) and join their original's row. Rows read "Your image 1, 2…".
- Images linked from other sites: "Image from <host>".
- Items without a stored name (older saves) are looked up once by Scryfall card ID.
- Each row: name (◐ for double-faced cards), a "N arts" note when copies use different printings,
  count, **−** / **+**, **⇄** (Scryfall cards only).
- Hovering or focusing a row outlines its copies on the visible page. Clicking the name shows the
  page with its first copy (a user action, so the "view never moves on its own" rule holds).
- The panel refreshes after any layout change (adds, removals, drags, imports, Remove gaps,
  printing changes), debounced.

### 5.3 + and −

- **+** clones the row's last copy in reading order (same art) and ripple-inserts it right after
  that copy.
- **−** ripple-removes the row's last copy in reading order. A row reaching 0 disappears.

### 5.4 Ripple insert / remove (shared helpers)

Positions are reading order across all pages (page 1 cell 1 … last page cell 9).

- **Insert at p:** if p is empty, place there. Otherwise let e be the first empty position after p;
  move the cards at p…e−1 to p+1…e and place at p. If there is no empty position after p, append a
  page and use its first cell as e.
- **Remove at p:** clear p; let e be the first empty position after p (or the end of the layout);
  move the cards at p+1…e−1 back to p…e−2. If that empties the last page, that page is removed
  (at least one page remains); blank pages the user added earlier stay.
- Card objects are moved, never cloned or discarded (except the removed card), so stored images
  survive. A pending internal C/X copy or cut is cancelled.

## 6. Art picker and tokens

### 6.1 Art picker

- Opened by ⇄ on a panel row, or **Change printing…** in a card's right-click menu — the same
  window for that card name either way, with the first copy selected.
- Top: a strip of every copy of the card (current art, page). Below: every printing, newest first,
  from Scryfall `cards/search` with `q=!"<name>"`, `unique=prints`, `order=released`, `dir=desc`
  (`include_extras=true` for tokens), 175 per page with **Load more**, through the rate-limit queue.
  Thumbnails use Scryfall `small` images; captions show set name, set code + collector number, year.
  The selected copy's current printing is outlined; double-faced printings show ◐.
- Click a copy, then a printing, to assign that art; **Use for all copies** assigns the selected
  printing to every copy. Arrow keys / Enter navigate the grid; Esc cancels.
- **Done** applies all assignments at once: each affected cell keeps its position and gets a new
  item with the printing's PNG and its name, back face, set and collector number (so double-sided
  reverses follow). **Cancel** changes nothing.
- Status: "Changed art for 3 of 4 Lightning Bolt".

### 6.2 Add tokens

- Collect distinct Scryfall cards in the layout via the card ID in their image URLs; look them up
  in batches of 75 (`cards/collection` by id) through the queue.
- From each card's `all_parts`, take entries with `component: "token"` (Scryfall uses this for
  tokens and emblems), excluding the card itself. De-duplicate by name + type line.
- A token whose name matches a card already in the layout is listed as "already in layout" with
  quantity 0.
- Dialog: one row per token — name, type line, "made by Card A, Card B", quantity (default 1;
  0 skips). **Add** fetches the token cards by id and places them with the standard placement rule
  (first empty cell from page 1, then new pages). Status: "Added 5 tokens (pages 3–4)". With
  nothing to add: "No tokens found for the cards in this layout".

---

# Shared concerns

## 7.1 Data and compatibility

- Card items gain optional saved fields: `set`, `collectorNumber` (Scryfall cards) and `copyOf`
  (uploaded images). Older saves and exports load unchanged; older app versions ignore the fields.
- Print settings extend the saved tuning and are exported with it; an uploaded back image is
  embedded in Full exports. On import, if the file's print settings differ from the current ones
  (paper, gap, bleed, cut style, double-sided, back image, printer tuning), the app asks
  "Keep mine" / "Use the file's" (decided with the user: printer calibration is device-specific).
  Identical settings import silently. An imported back image that isn't used is discarded.
  Card backs compare by image content (an imported back is stored under a new key), and closing the
  question keeps mine.

## 7.2 Offline

The service worker precaches `card-back.jpg` and `vendor/jspdf.umd.min.js` with the app shell;
`SHELL_CACHE` is bumped.

## 7.3 Testing

Browser tests in `.claude/tests/` (test-first, as before):

- The real-print regression and geometry checks in section 0, run after every task that touches
  layout, rendering or printing.
- Calculator: exact boxes for Letter/A4 × gap {0, 3 mm} × bleed {off, 3 mm}; back mirroring with
  offsets; fit problems.
- Cut marks: Ticks equal today's geometry exactly; Full lines and Corners never overlap any bleed
  box.
- Border sampling: black, white and transparent-corner images; fallback for unreadable images.
- Ripple insert/remove: mid-page, across pages, with and without gaps, spilling to a new page,
  trailing-page removal, stored images survive.
- DFC prompt flows (Yes/No, removing separate backs).
- Deck panel grouping, counts, "N arts", + / −, rows for uploads and linked images.
- Art picker: per-copy assignment, Use for all copies, Done vs Cancel.
- Tokens: de-duplication, "already in layout", quantities, placement.
- PDF: page count and size, interleaved backs, each distinct image embedded once (checked by
  reading the generated file back).
- The existing 102 tests.
- One real double-sided print on the user's printer to confirm alignment (not automatable).

## 7.4 Delivery

1. **Batch 1 — Print pipeline:** sections 1–4, plus the toggle-switch restyle.
2. **Batch 2 — Deck tools:** sections 5–6.

Each batch: its own implementation plan, branch, task-by-task reviews, a final review, and the
user's approval before merging and pushing.
