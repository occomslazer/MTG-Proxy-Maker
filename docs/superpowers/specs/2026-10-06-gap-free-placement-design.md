# Gap-free card placement and "Remove gaps"

Date: 2026-10-06 · Status: approved design, awaiting spec review

## Problem

Since commit `f441055`, new cards fill empty cells from the page being viewed forward and then
start a new page. That fixed deck imports landing out of order, but gaps on earlier pages (left by
deleting, clearing or dragging cards off) are never filled. The user wants no gaps on earlier pages
and a way to close gaps that already exist.

Deck order broke because the search started midway and then wrapped back to page 1, not because
earlier gaps were filled. Searching from page 1 in reading order fills gaps and keeps order.

## Decisions (made with the user)

1. New cards fill the first empty cell from page 1 (option 1), plus a manual "Remove gaps"
   command (option 2). Gaps are not closed automatically on delete.
2. The view never moves on its own; the status bar names the page(s) cards landed on.
3. "Remove gaps" tidies the whole layout and removes empty pages left at the end.
4. "Remove gaps" is a toolbar button and a page right-click menu entry, and runs without a
   confirmation dialog.

## Placement rule

One function decides where each new card goes; every add path uses it. It replaces the four
separate searches in `addImageSrcToNextCell`, `createPlacementState`, `handleFilesIntoCell` and
`duplicateToNextEmpty`.

A placement has an optional **anchor**:

| How the user adds | Anchor | Order of search |
|---|---|---|
| Search box, decklist import, Add Images button, Add missing DFC backs, paste or URL drop with nothing targeted | none | first empty cell from page 1 → new last page |
| Drop or paste onto a cell, double-click replace | that cell | the cell itself (replaced) for the first image, then empty cells after it → first empty cell from page 1 → new last page |
| "Duplicate to next empty cell" | the cell after the original | empty cells from the anchor → first empty cell from page 1 → new last page |
| Drop on a page's background, "Paste image(s) onto this page" | start of that page | empty cells from the anchor → first empty cell from page 1 → new last page |
| Dragging cards (move, swap, D+drag duplicate) | — | unchanged |

- Each subsequent card in a multi-card add continues from just after the previous card's cell,
  using the same search order.
- A slot is found only when its card is ready to place (no reservation ahead of time), so filling
  a page's last cell never creates an empty page.
- Creating a page does not switch the view. The pager ("Page 1 / N") and the "− Page" button
  state update without changing the current page.

## Status messages

When any placed card lands on a page other than the one being viewed, the message names the
page(s): "Added Lightning Bolt (page 1)", "Added 3 images (pages 1–2)",
"Done — 1 not found (pages 1–3)". When cards land only on the current page there is no page
suffix. The search box now names the card it added ("Added Opt") instead of just "Added".

## Remove gaps

- Toolbar button "Remove gaps" next to "Add missing DFC backs"; entry "Remove gaps" in the page
  section of the right-click page menu. Not available in print preview (read-only).
- Collects every card in reading order (page 1 cell 1 … last page cell 9) and refills the cells
  from the start, so order is kept. Card objects are moved, never cloned, discarded or deleted;
  stored images stay in IndexedDB.
- Pages left empty at the end are removed; at least one page always remains. The current page is
  kept if it still exists, otherwise the last page is shown.
- A pending internal C/X copy or cut is cancelled, since positions change.
- Saves state. Status: "Moved N card(s); removed M empty page(s)", leaving out whichever part is
  zero ("Removed 1 empty page(s)" when no card moves), or "No gaps to remove" when nothing would
  change.

## Testing

Browser tests in `.claude/tests/` (git-excluded, run in the page against the local server):

- No anchor: gaps on page 1 are filled first, in reading order; a 12-card import with a gap on
  page 1 keeps deck order in reading order; overflow creates new pages.
- Cell anchor: first image replaces the target; following images fill forward, then earlier gaps,
  then a new page.
- Page anchor: that page's gaps first, then earlier gaps.
- Duplicate: copy lands after the original when possible, else in the earliest gap.
- View: viewing page 3 while cards land on page 1 leaves the current page at 3; status names
  page 1; pager count updates when a page is created.
- No empty trailing page after filling a page exactly.
- Remove gaps: order preserved; trailing empty pages removed; one page minimum; "No gaps to
  remove" changes nothing; stored (uploaded) images still render after moving; internal
  clipboard cleared.
- The existing 50 tests still pass.
