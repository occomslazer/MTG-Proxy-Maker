# MTG Proxy Maker

A single-file HTML app that pulls card images from [Scryfall](https://scryfall.com) and arranges them on a 3×3 grid for printing MTG proxies at card size (2.475″ × 3.465″ by default, 99% of the standard 2.5″ × 3.5″; adjustable).

## Features

- **Card search** — look up any Magic card by name via the Scryfall API
- **Deck panel** — a side panel listing every card with its count; paste a decklist, add or remove copies, change art and add tokens (see [Deck Panel](#deck-panel))
- **Double-faced cards** — automatically add missing DFC back faces
- **Drag & drop** — rearrange cards between cells, or drop image files directly onto the grid
- **Multiple pages** — add as many pages as you need; all pages print at once. New cards fill the first empty cell, and **Remove gaps** closes up empty cells left by deleting cards
- **Print-ready layout** — Letter or A4 pages with precise card sizing, optional gaps, bleed and cut lines
- **Double-sided printing** — card backs (the default or your own) printed behind each page, lined up for a long-edge flip
- **Printer calibration** — fine-tune margins, card dimensions, and image fit mode (cover/contain)
- **Dark mode** — toggle between light and dark themes
- **Export / Import** — save and restore deck layouts as `.mtgproxy` files (full or lightweight), or export a print-ready PDF
- **PWA support** — install as a standalone app; previously fetched cards work offline
- **Print preview** — see all pages as they will appear on paper before printing

## Getting Started

1. Keep `card-back.jpg` and the `vendor/` folder next to `MTG Proxy Maker.html`, then open it in any modern browser (Chrome, Firefox, Edge, Safari).
2. Search for a card by name, or open the **Deck** panel and click **Paste decklist…**.
3. Arrange cards as needed, then click **Print** (or press `P`).

No build step and no server required. Opened as a file, everything works except that a PDF export can't read the default card back: upload a card back in Print settings, or serve the folder (for example `python -m http.server`) and open it from there.

## Deck Panel

Click **Deck** in the toolbar to show a side panel with one row per card and its count.

- **Paste decklist…** — one card per line (e.g. `4 Lightning Bolt`). Add a set code like `[M11]` or `(M11)`, or paste an Arena/Moxfield export such as `1 Sol Ring (CMR) 472` for that exact printing. Switches skip basic lands and Snow-Covered basics.
- **+ / −** — **+** adds a copy right after the row's last copy; **−** removes the last copy. The cards after it move over to make room or close the gap, as far as the next empty cell.
- **Hover and click** — hovering a row outlines its copies on the page; clicking a name jumps to its first copy.
- **⇄ / Change printing…** — pick the art for each copy of a card, or use one printing for all copies. Right-click a card and choose **Change printing…** to start on that copy. Changes apply when you click **Done**.
- **Add tokens…** — lists the tokens and emblems your cards make, with a quantity for each; press Enter in a quantity field to add.

The panel never prints, and print preview hides it.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Arrow keys** | Move focus between cells |
| **1–9** | Jump to a specific cell |
| **C** | Copy focused cell (internal clipboard) |
| **X** | Cut focused cell (internal clipboard) |
| **V** | Paste into focused cell |
| **Escape** | Cancel cut/copy or close dialogs |
| **D + Drag** | Duplicate card to target cell |
| **Alt + Arrows** | Reorder (swap) focused cell |
| **Delete / Backspace** | Clear focused cell |
| **Ctrl/⌘ + C** | Copy cell image to system clipboard |
| **Ctrl/⌘ + V** | Paste image from system clipboard |
| **Ctrl/⌘ + Delete** | Clear current page |
| **Ctrl/⌘ + Shift + Delete** | Clear all pages |
| **Shift + Delete** | Remove current page |
| **N** | Add a new page |
| **[ / ]** | Previous / next page |
| **Ctrl/⌘ + ← / →** | Previous / next page |
| **Home / End** | First / last page |
| **P** | Print all pages |
| **G** | Toggle guides |
| **M** | Toggle cut marks |
| **? / H / F1** | Open help dialog |
| **Esc** | Close any open dialog |

## Print & Calibration

Cards default to 2.475″ × 3.465″ (99% of the standard 2.5″ × 3.5″). Press **?** to open Help, then click **Print settings** to choose:

- **Paper** — Letter or A4
- **Gap between cards** — 0–3 mm
- **Bleed** — 0–3 mm of border colour around each card, so slightly-off cuts don't show white
- **Cut lines** — Ticks (short marks in the margin), Full lines (for trimmers) or Corners (needs a gap)
- **Double-sided printing** — a back page after each page (see below)
- **Card back** — the default image, or **Upload…** your own; **Use default** goes back to the default

Nothing changes until you click **Save**; **Close** or Esc discards your changes. **Reset** returns gap, bleed, cut lines, margins, card size and back offsets to their defaults.

Cut lines print only when the **Cut marks** switch is on (or press **M**).

If prints appear clipped or misaligned, open **Printer fine-tuning** in the same dialog:

1. Adjust top margin, horizontal offset, or card dimensions
2. Leave **Keep 2.5×3.5 ratio** on to maintain the aspect ratio
3. Choose **Cover** (fill cell, may crop edges) or **Contain** (fit inside, may show margins)
4. With double-sided printing, use **Back offset X / Y** to line the backs up with the fronts

## Double-sided Printing

1. Turn on **Double-sided printing** in Print settings and click **Save**.
2. Print with the app's **Print** button (or `P`), not Ctrl+P: it waits for back images that are still loading, which Ctrl+P can't.
3. In the print dialog, choose two-sided printing and flip on the **long edge**.
4. If the backs sit off the fronts, adjust **Back offset X / Y** under Printer fine-tuning.

**Double-faced cards:** when you turn double-sided printing on with double-faced cards in the layout, the app asks whether to print their back faces on the reverse instead of the card back. If you say yes and the back faces are also placed as separate cards, it offers to remove those so they don't print twice.

## Export & Import

- **Export (Full)** — saves layout + card images as base64 in a `.mtgproxy` file. Larger file, works fully offline.
- **Export (Lightweight)** — saves layout + Scryfall URLs only. Small file, re-fetches images on import.
- **Export → PDF (ready to print)** — a PDF at the exact page size, with back pages when double-sided printing is on. Choose **High-quality JPEG** (smaller file) or **Original PNG** (exact pixels, larger file). Print it at **Actual size / 100%**, not "Fit to page".
- **Import** — open a `.mtgproxy` file to restore a saved layout. If its print settings differ from yours, you're asked whether to **Keep mine** or **Use the file's**.

## Browser Compatibility

Works in all modern browsers. Some features have limited support:

- **System clipboard** (Ctrl+C/V for images) — requires browser Clipboard API support; works best in the [desktop Electron app](https://github.com/occomslazer/MTG-Proxy-Maker-Desktop/releases)
- **PWA install** — supported in Chromium-based browsers (Chrome, Edge)
- **IndexedDB** — used for image storage; falls back to in-memory storage in private browsing

## API

Card data and images are fetched from the [Scryfall API](https://scryfall.com/docs/api). An internet connection is required for searching new cards. Previously fetched cards are cached locally.

## License

See repository for license information.
