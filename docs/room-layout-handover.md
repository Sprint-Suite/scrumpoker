# Handover: Poker Room Layout Rework

**Status:** Ready for build
**Scope:** Front end only (`public/index.html`, `public/css/poker.css`). No server, WebSocket or JS logic changes.
**Mockup:** https://claude.ai/artifact/ELJroYgzCW4hLfA4M9Zrkx (approved target layout)

---

## 1. Problem

`.room-grid` is a 2-column CSS grid with **implicit rows**:

| Row | Col 1 | Col 2 |
|---|---|---|
| 1 | `.vote-panel` | `.participants-panel` |
| 2 | `.result-card` | (empty) |
| 3 | `.grouped-results` (spans both, `grid-column:1 / -1`) | |

Row 1 is as tall as its tallest item. As people join, `.participants-panel` grows, row 1 grows, and everything below it (results, grouped results) gets pushed down. `.facilitator-controls` sits **outside** `.room-grid`, so the buttons are pushed down too. The result is a big empty gap under the vote deck, which never changes height.

## 2. Target layout

```
+-------------------------------+  +-------------------+
| .vote-panel (Cast your vote)  |  | .participants-    |
+-------------------------------+  |  panel            |
| .facilitator-controls         |  |                   |
+-------------------------------+  |  grows with the   |
| #vote-summary .result-card    |  |  number of people |
+-------------------------------+  |  and affects      |
| #ordered-votes                |  |  nothing on the   |
|  .grouped-results             |  |  left             |
+-------------------------------+  +-------------------+
```

Requirements:

1. **Buttons** (`#facilitator-controls`) sit directly under `.vote-panel`.
2. **Vote summary** (`#vote-summary .result-card`) sits under the buttons, same width as `.vote-panel`.
3. **Grouped results** (`#ordered-votes .grouped-results`) sits under the vote summary, same width as `#vote-summary`. It no longer spans both columns.
4. **Participants** (`.participants-panel`) grows as tall as needed without moving anything in the left column.

## 3. Approach (decided)

Wrap the left-hand sections in a new column container, `.room-main`. The grid then has exactly **two items in one row**: `.room-main` and `.participants-panel`. With `align-items:start` (already set), each column sizes to its own content, so neither can push the other.

**Why this over pure CSS grid placement:** spanning `.participants-panel` across explicit rows (`grid-row:1 / span N`) still distributes its height into the spanned rows and can open gaps on the left. A wrapper column is simpler, robust, and has zero JS impact.

**JS impact check (done):** `public/js/app.js` gets every element by `id` (`facilitator-controls`, `vote-summary`, `ordered-votes`, etc.). Nothing queries by DOM position or `.room-grid >` child selectors. Moving `#facilitator-controls` inside the grid is safe.

## 4. Changes

### 4.1 `public/index.html`

Inside `<div class="room-grid">`, restructure to:

```html
<div class="room-grid">
    <div class="room-main">
        <section class="room-card vote-panel" aria-labelledby="vote-panel-title">
            ... unchanged ...
        </section>

        <div id="facilitator-controls" class="facilitator-controls hidden">
            ... unchanged buttons (show-votes, start-next-round, reset-votes) ...
        </div>

        <section id="vote-summary" class="room-card result-card hidden" aria-labelledby="results-title">
            ... unchanged ...
        </section>

        <section id="ordered-votes" class="room-card grouped-results hidden" aria-labelledby="grouped-results-title">
            ... unchanged ...
        </section>
    </div>

    <section class="room-card participants-panel" aria-labelledby="participants-title">
        ... unchanged ...
    </section>
</div>
```

Rules:

- **Move** the existing `#facilitator-controls` block from after `.room-grid` into `.room-main`. Do not duplicate it. Keep its `hidden` class (security relevant, see `poker.css` note on `.hidden`).
- Keep every `id`, `class` and `aria-*` attribute exactly as it is.
- DOM order inside `.room-main`: vote panel, controls, vote summary, grouped results.
- `.participants-panel` comes **after** `.room-main` in the DOM (this gives the mobile order in 4.3).

### 4.2 `public/css/poker.css`

In the **Room content grid** section, add:

```css
.ins .room-main{display:flex; flex-direction:column; gap:1rem; min-width:0;}
```

`min-width:0` stops long names in grouped results from blowing out the column.

Remove the grid placement rules that no longer apply (the items are no longer direct grid children):

```css
.ins .result-card{grid-column:1;}          /* delete this line only; keep the other .result-card rules */
.ins .grouped-results{grid-column:1 / -1;} /* delete */
```

In **Facilitator controls**, drop the top margin (the flex `gap` now handles spacing):

```css
.ins .facilitator-controls{display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;}
```

In the `@media (max-width:820px)` block, delete the now-redundant override:

```css
.ins .result-card,
.ins .grouped-results{grid-column:auto;}
```

Leave `.ins .room-grid` as is (`grid-template-columns:minmax(0,1.45fr) minmax(280px,0.85fr); gap:1rem; align-items:start;`). The `align-items:start` is what lets each column keep its own height. Do not change it to `stretch`.

### 4.3 Mobile (<= 820px)

The grid already collapses to one column. With the new DOM order, mobile shows:

1. Cast your vote
2. Buttons (facilitator only)
3. Vote results
4. Grouped results
5. Participants

This is intentional: the actions and results a voter needs stay at the top; the participant list (the part that grows) goes last.

## 5. Out of scope

- No max-height or internal scroll on `.participants-panel`. It should simply grow. (Possible follow-up if rooms of 20+ get unwieldy.)
- No visual restyling of cards, buttons or tokens.
- No changes to `app.js`, server code or WebSocket messages.

## 6. Acceptance criteria

- [ ] With 2 participants, layout matches the mockup: buttons directly under the deck, results then grouped results beneath, participants on the right.
- [ ] With 12+ participants, the left column's position and spacing are **identical** to the 2-participant case. Only the right column gets taller.
- [ ] Grouped results is the same width as the vote summary and vote panel (left column only).
- [ ] Before reveal: vote summary and grouped results are hidden; buttons still sit directly under the deck with no gap left behind.
- [ ] Non-facilitator view: `#facilitator-controls` remains hidden and leaves no empty gap.
- [ ] Observer view: observer note still shows inside the vote panel.
- [ ] At <= 820px the order is vote, buttons, results, grouped, participants.
- [ ] Show Votes, Next Round and Reset Votes all still work (event listeners bound by id).
- [ ] No console errors.

## 7. Verification

1. Run the existing test suites and confirm they pass:
   - `npm test`
   - `npx playwright test` (especially `tests/e2e/multi-user-room.spec.js` and `scrum-poker-smoke.spec.js`)
2. Grep the tests for anything that depends on `#facilitator-controls` being outside `.room-grid` or on `.grouped-results` spanning the grid, and update only if a selector genuinely relies on the old structure:
   - `grep -rn "room-grid\|facilitator-controls\|grouped-results" tests/`
3. Manual check in the browser: open the room with several browser profiles (or the multi-user e2e helper) to get 6+ participants, reveal votes, and confirm the left column does not move.
4. Hard refresh after deploy. `poker.css` is linked without a cache-busting query (`/css/poker.css`), so consider adding `?v=2` to the `<link>` so returning users get the new layout.

## 8. Session log

Add an entry to `docs/session-log.md` summarising the change once complete.
