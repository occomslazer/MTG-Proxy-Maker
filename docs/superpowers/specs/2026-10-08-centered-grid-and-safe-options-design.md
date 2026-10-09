# Centred card grid and greyed-out options that won't print

Follow-up to `2026-10-06-print-pipeline-and-deck-tools-design.md` after the user's paper test: Letter
with a 3 mm gap lost about 1 mm at the bottom. The grid started 0.25″ from the top, leaving only
0.12″ (3.0 mm) at the bottom, inside the printer's unprintable edge.

## 1. Vertical centring

- The grid is centred vertically, as it already is horizontally:
  `y0 = (page.h − gridH) / 2 + offsetY` (the horizontal rule is unchanged:
  `x0 = (page.w − gridW) / 2 + offsetX`).
- Printer fine-tuning: **Top margin** is replaced by **Vertical offset (in)**: default 0.00, positive
  moves the cards down, step 0.01, rounded to 0.01″ like the horizontal offset. Reset sets it to 0.
- Saved settings: a saved `topIn` is converted once, on load, to the offset that keeps the grid at
  the same place for the saved paper, gap, bleed and card size:
  `offsetY = topIn − (page.h − gridH) / 2`. A saved `topIn` of exactly 0.25 (the old default, which
  Save stored even when untouched) converts to 0 (centred). After conversion only the offset is
  saved; `topIn` is no longer written.
- Imported files that carry `topIn` are converted the same way when their settings are used.
- The fit rule for Save and loading is unchanged in spirit: the whole grid (front and back, with
  offsets) must be on the page. The old "top margin ≥ 0" check becomes "top edge ≥ 0" and
  "bottom edge ≤ page height".
- Back pages keep `y_back = y_front + backOffsetY`.
- Screen, print, PDF and back pages all follow, because all of them draw from `computeLayout`.
- Default effect: Letter, no gap: the grid moves down 0.0525″ (1.3 mm); margins become 7.7 mm top
  and bottom (previously 6.4 / 9.0 mm). Letter, 3 mm gap: the grid moves up 1.7 mm, to 4.7 / 4.7 mm
  (previously 6.4 / 3.0 mm). A4 has more spare height, so its default print moves down about 10 mm
  (0.399″), to 16.5 mm top and bottom.

## 2. Greying out choices that won't print

- **Safe margin:** 4 mm (`SAFE_MARGIN_IN = 4 / 25.4`) on every edge.
- In Print settings, each **Paper**, **Gap** and **Bleed** choice is disabled when selecting it, with
  the rest of the current draft (paper, gap, bleed, card size), would put the grid closer than the
  safe margin to any edge. The check uses offsets of 0 (offsets correct the printer's own shift, so
  they never make a choice unavailable).
- Re-evaluated live whenever any draft value changes (radios and card-size fields).
- A disabled choice's tooltip says why, e.g. "Doesn't fit on Letter with a 3 mm gap and 1 mm bleed: the
  cards would be 1.7 mm from the edge (4 mm needed)."
- The currently selected choice is never disabled. If the saved combination is already inside the
  safe margin, it stays selected and a note under the choices says: "The cards come within 4 mm of
  the edge, so most printers will cut some of them off."
- Cut-line styles keep their own rule (Corners needs a gap).
- At the default card size: Letter greys 2 and 3 mm bleed, and 1 mm bleed with any gap (and vice
  versa); A4 greys 3 mm bleed, and 2 mm bleed with any gap (and vice versa).

## 3. Verification

- This change moves default prints on purpose (approved by the user). Before the reference prints
  in `.claude/tests/print-baseline/` are replaced:
  1. Prove the new default print equals the old reference shifted down by exactly 0.0525″, with
     nothing else changed (rendered comparison at high DPI against the shifted old reference).
  2. Geometry, PDF box and PDF export checks pass for every scenario (Letter, A4, gaps, bleed,
     double-sided, preview, dark theme, panel open).
  3. Then regenerate the reference prints from the new build and record the commit.
- In-page tests: the calculator (centred y0; offset; migration of `topIn`, including the 0.25 rule;
  imports), the dialog (Vertical offset field, greyed choices and tooltips, the warning note, live
  re-evaluation), and all existing suites.
- The user repeats the Letter + 3 mm gap paper test.
