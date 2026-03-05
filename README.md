# MTG Proxy Maker

A single-file HTML app that pulls card images from [Scryfall](https://scryfall.com) and arranges them on a 3×3 grid for printing MTG proxies at standard card size (2.5″ × 3.5″).

## Features

- **Card search** — look up any Magic card by name via the Scryfall API
- **Decklist import** — paste a full decklist (e.g. `4 Lightning Bolt`) to auto-fill pages
- **Double-faced cards** — automatically add missing DFC back faces
- **Drag & drop** — rearrange cards between cells, or drop image files directly onto the grid
- **Multiple pages** — add as many pages as you need; all pages print at once
- **Print-ready layout** — 8.5″ × 11″ pages with precise card sizing and optional cut marks
- **Printer calibration** — fine-tune margins, card dimensions, and image fit mode (cover/contain)
- **Dark mode** — toggle between light and dark themes
- **Export / Import** — save and restore deck layouts as `.mtgproxy` files (full or lightweight)
- **PWA support** — install as a standalone app; previously fetched cards work offline
- **Print preview** — see all pages as they will appear on paper before printing

## Getting Started

1. Open `MTG Proxy Maker.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. Search for a card by name or paste a decklist.
3. Arrange cards as needed, then click **Print** (or press `P`).

No build step, no dependencies, no server required.

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

Cards are sized to standard MTG dimensions (2.5″ × 3.5″) by default. If prints appear clipped or misaligned:

1. Press **?** to open Help, then click **Advanced**
2. Adjust top margin, horizontal offset, or card dimensions
3. Enable **Scale lock** to maintain the 2.5 × 3.5 aspect ratio
4. Choose **Cover** (fill cell, may crop edges) or **Contain** (fit inside, may show margins)

## Export & Import

- **Export (Full)** — saves layout + card images as base64 in a `.mtgproxy` file. Larger file, works fully offline.
- **Export (Lightweight)** — saves layout + Scryfall URLs only. Small file, re-fetches images on import.
- **Import** — open a `.mtgproxy` file to restore a saved layout.

## Browser Compatibility

Works in all modern browsers. Some features have limited support:

- **System clipboard** (Ctrl+C/V for images) — requires browser Clipboard API support; works best in the [desktop Electron app](https://github.com/OccamIndustries/MTG-Proxy-Maker/releases)
- **PWA install** — supported in Chromium-based browsers (Chrome, Edge)
- **IndexedDB** — used for image storage; falls back to in-memory storage in private browsing

## API

Card data and images are fetched from the [Scryfall API](https://scryfall.com/docs/api). An internet connection is required for searching new cards. Previously fetched cards are cached locally.

## License

See repository for license information.
