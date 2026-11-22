# Murdoku Web: Specification

## 1. Context

`/home/tom/Dev/murdoku` is an empty directory. The goal is a browser-only website that **generates random Murdoku puzzles** and lets the user solve them interactively. There is no backend. It is built with **TypeScript + Vite**.

Version 1 scope:

- 9×9 grid, 9 people (8 suspects + 1 victim).
- Rooms and furniture: chairs, tables, plants, rugs, beds and so on.
- Location-based clues only. **No jobs or other hidden attributes yet.** The design leaves room to add them later.
- The solution is kept away from the UI as far as a browser-only app reasonably allows (see §7).

---

## 2. Game rules (as implemented)

1. The board is a 9×9 grid split into **rooms**. Rooms are contiguous groups of cells, drawn with thick walls.
2. Some cells contain **furniture**. Each furniture type is either:
   - **Occupiable**: a person may be on it (sitting on a chair, lying on a bed, standing on a rug).
   - **Blocking**: nobody may be on it (table, plant, bookshelf…).
3. All 9 people (8 suspects + victim) go on the grid:
   - exactly **one person per row** and **one person per column**;
   - at most one person per cell, and never on a blocking cell.
4. Each person has a **clue** (one or more facts combined into one sentence) about where they were.
5. **The murderer is the only suspect who was in the same room as the victim.** The generator guarantees exactly one such suspect.
6. Every generated puzzle has **exactly one valid placement** of all 9 people. It can also be solved by deduction alone, with no guessing (see §5.5).
7. The player wins by placing everyone correctly and **accusing** the right suspect.

"Beside" means **orthogonally adjacent** (up, down, left or right) **within the same room**: furniture on the other side of a wall does not count. Adjacency is a single constant in the engine, so it can be switched to 8-neighbour later.

---

## 3. Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Language / build | TypeScript (strict) + Vite | As requested |
| UI framework | **React 18** | Familiar, good TS support, and the board is a small grid, so a virtual DOM costs nothing noticeable |
| State | **Zustand** (+ `immer`) | Small store, easy undo/redo snapshots, readable from anywhere |
| Styling | Plain CSS with CSS variables (CSS Modules per component) | Light/dark themes, no heavy dependencies |
| Icons | Hand-made inline **SVG** components for furniture | Emoji render inconsistently across operating systems; SVG scales and can be themed |
| Heavy work | **Web Worker** (Vite `?worker` import) | Generation runs off the main thread, and the solution lives inside the worker (§7) |
| Tests | **Vitest** for the engine, **Cypress** for end-to-end tests (one suite per feature milestone) | |
| Lint / format | ESLint + Prettier | |
| Deploy | `vite build` → static `dist/` (deployed via Cloudflare Pages) | |

The engine (`src/engine`) is **pure TypeScript with no DOM or React imports**, so it can be unit-tested and run inside the worker.

---

## 4. Project structure

```
murdoku/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  src/
    main.tsx
    App.tsx
    engine/                 # pure, deterministic, tested
      rng.ts                # seeded PRNG (mulberry32 / sfc32) + helpers (shuffle, pick, weighted)
      types.ts              # Grid, Room, Furniture, Person, Clue, Puzzle, Solution
      constants.ts          # GRID_SIZE=9, PEOPLE=9, adjacency mode, generator version
      furniture.ts          # furniture catalogue (§5.2)
      rooms.ts              # room types + names + furniture palettes
      floorplan.ts          # room partition generator (§5.1)
      placement.ts          # solution placement (§5.3)
      decorate.ts           # furniture placement (§5.2)
      clues/
        types.ts            # clue AST
        facts.ts            # derive all true facts about a person from a solution
        evaluate.ts         # clue → set of allowed cells (given board)
        render.ts           # clue → English sentence
      solver/
        bruteforce.ts       # counts solutions (stop at 2) – uniqueness check
        logical.ts          # human-style deduction solver + difficulty grading (§5.5)
      generator.ts          # orchestrates everything (§5.4)
      names.ts              # suspect name pool (distinct initials)
      secure.ts             # solution hashing / encoding (§7)
    worker/
      engine.worker.ts      # owns the solution; answers generate/check/accuse messages
      client.ts             # typed promise wrapper around postMessage
    state/
      store.ts              # Zustand store: puzzle view, player marks, history, settings
      persistence.ts        # localStorage save/load (§8)
    ui/
      Board/Board.tsx, Cell.tsx, RoomWalls.tsx, FurnitureIcon.tsx
      People/PeoplePanel.tsx, PersonCard.tsx
      Toolbar/Toolbar.tsx   # mode, undo/redo, check, reset
      Tools/ToolPalette.tsx, LayersMenu.tsx, WhatIfBar.tsx
      Notes/RoomLegend.tsx, Scratchpad.tsx, LogicGrid.tsx
      Draw/PenLayer.tsx     # pointer-event canvas/SVG overlay
      print.css             # print / PDF stylesheet
      Dialogs/NewGame.tsx, Accuse.tsx, Win.tsx, Rules.tsx, Settings.tsx
      icons/*.tsx           # furniture SVGs
      theme.css
  tests/
    engine/*.test.ts
  cypress/e2e/*.cy.ts     # Cypress end-to-end specs
```

---

## 5. Puzzle generation

Everything is driven by a **seed** (a string → 32-bit hash → PRNG). The same seed and generator version always produce the same puzzle. That makes sharing (`?seed=…`), daily puzzles and reload-without-storing-the-solution possible.

### 5.1 Floor plan (rooms)

- Target **6–9 rooms**, each of size **4–18 cells**.
- Algorithm: randomised region growing.
  1. Scatter N seed cells, spaced apart.
  2. Grow regions breadth-first, picking frontier cells at random, until the grid is full.
  3. Reject and retry if any room is out of the size range or oddly shaped (bounding-box fill ratio < 0.4, to avoid long snakes).
- Assign each room a **type** without repeats where possible: Kitchen, Living Room, Dining Room, Bedroom, Bathroom, Study, Library, Hallway, Conservatory, Garage. Type is weighted by size (Hallway and Bathroom smaller; Living Room and Library larger).
- Each room has a distinct pastel colour and its name drawn as a label.

### 5.2 Furniture

Catalogue (`furniture.ts`). Each entry has `id`, `label`, `occupiable`, the room types it can appear in, and an icon:

| Furniture | Occupiable | Typical rooms |
|---|---|---|
| Chair | ✅ | Kitchen, Dining, Study, Library, Living |
| Armchair | ✅ | Living, Library, Study |
| Sofa | ✅ | Living |
| Bed | ✅ | Bedroom |
| Rug | ✅ | any |
| Table | ❌ | Kitchen, Dining, Study, Living |
| Plant | ❌ | any |
| Bookshelf | ❌ | Library, Study, Living |
| Wardrobe | ❌ | Bedroom |
| Television | ❌ | Living, Bedroom |
| Stove / Counter | ❌ | Kitchen |
| Bathtub | ❌ | Bathroom |
| Piano | ❌ | Living, Conservatory |
| Car | ❌ | Garage |

Placement (done **after** the solution placement, §5.3, so it can be shaped to it):

- **Blocking** furniture never goes on a person's cell. About 20–30% of non-person cells get blocking furniture. This is where much of the puzzle's difficulty comes from.
- **Occupiable** furniture goes under some people (so "sitting on a chair" clues are possible) and also in empty cells, as decoys.
- Chairs are placed beside tables where possible, so rooms look natural.
- Constraint: every row and column must keep at least one non-blocking cell (guaranteed anyway by the solution).

### 5.3 Solution placement

- Choose a random permutation `col = p[row]` with 9 entries.
- Assign each entry to a person: 8 suspects + 1 victim.
- **Murderer constraint**: the victim's room contains exactly one suspect (the murderer). Every other suspect is in a different room from the victim. Retry the permutation until this holds (cheap).
- Variety: at least some suspects share rooms and at least one is alone, so "with" and "alone" clues have something to say.

### 5.4 Clue generation

**Fact derivation** (`facts.ts`): for each person, list every true atomic fact:

| Atom | Example text |
|---|---|
| `InRoom(room)` | "…was in the Kitchen." |
| `NotInRoom(room)` | "…was not in the Library." |
| `OnFurniture(type)` | "…was sitting on a chair." / "lying on a bed" / "standing on a rug" |
| `BesideFurniture(type)` | "…was beside a plant." |
| `NotBesideFurniture(type)` | "…was not beside any table." |
| `InRow(n)` / `InColumn(n)` | "…was in the 3rd row." |
| `Alone` | "…was alone in the room." |
| `SameRoomAs(person)` | "…was in the same room as Beatrice." |
| `InCorner` | "…was in a corner of the room." (room-relative: walls or the board edge on two sides that meet) |
| `AgainstWall` | "…was against a wall of the room (not in a corner)." (room-relative: a wall on at least one side, corners excluded) |

A **clue** is a conjunction of 1–3 atoms per person, rendered as one sentence: *"Charles was sitting on a chair in the Study, beside a bookshelf."*

**Fairness rules**:

- No clue may name or imply the murderer directly.
- The victim gets **no** clue of their own: their card only restates the murder rule, "Was alone in the room with the murderer." Their cell has to be deduced from the suspects (once all 8 are placed, only one row/column crossing is left).
- `SameRoomAs(victim)` is not allowed, because it would give away the murderer.

**Selection algorithm**:

1. Start each suspect with one random "weak" fact. Bias towards furniture and room facts; row and column facts are rare and mostly used on Easy.
2. Loop: run the logical solver (§5.5).
   - If it stalls, find a person whose candidate cells are still ambiguous and add a fact that cuts their candidates the most (ties broken at random).
   - If it solves, go to step 3.
3. **Prune**: try removing each atom in random order. Keep the removal if the puzzle is still uniquely solvable *and* logically solvable at or below the target difficulty. Every suspect keeps at least one atom.
4. Final check: the brute-force solver confirms exactly one solution. Then grade difficulty.
5. If the grade does not match the requested difficulty, retry with a new sub-seed (bounded attempts; then accept the closest result).

**Performance target**: < 500 ms per puzzle on a mid-range laptop. Brute force over 9! permutations with pruning is fast. If the target is missed, generation shows a spinner (it runs in the worker, so the UI never freezes).

### 5.5 Solvers and difficulty

- **Brute force** (`bruteforce.ts`): backtracking row by row over allowed columns. Columns are tracked with a bitmask, and each person's candidate cell set is precomputed from their clue. Counting stops at 2. Used only to confirm uniqueness.
- **Logical solver** (`logical.ts`): keeps a candidate set of cells for each person and applies techniques in order of difficulty:
  1. **Clue filtering**: remove cells that break the person's static clue.
  2. **Single candidate**: a person has one cell left → place them; eliminate that row and column for everyone.
  3. **Hidden single**: a row or column has only one person able to fill it → place them.
  4. **Room logic**: alone / same-room / victim–murderer constraints narrow which rooms are possible.
  5. **Locked sets**: k people confined to k rows or k columns → eliminate those rows or columns for everyone else.
  6. *(Hard only)* **Trial elimination**: a short contradiction search, depth 1.
- **Difficulty** = the highest technique needed, plus the step count:
  - **Easy**: techniques 1–3.
  - **Medium**: up to technique 4.
  - **Hard**: up to technique 5–6.
- The logical solver also has `nextDeduction` for **hints**, which are currently removed from the game (§6.4).

---

## 6. User interface and interaction

### 6.1 Layout

The "Focus" layout keeps the board as the centre of attention and tucks everything else away; the page itself never scrolls.

- **Quick bar**: by default only **Place**, **Erase** and **Cross** are on the bar, then Undo/Redo (after a separator). Everything else is in the **tray**, which pops out from the bar's tray button. In Settings → *Quick bar* the player can pin any other tool, the Logic grid or What-if to the bar (Place is always there); the choice is saved in localStorage with the other settings. A tool's keyboard shortcut (and `G`, `W`) only works while it is on the bar; tray items do not advertise their key.
- **Desktop**: a slim header, the board, and a floating **dock** below it holding the quick bar. The tray opens upwards from the dock: the unpinned tools (two per row) above Reset, Layers, Clear, What-if, Logic grid and Print. Check and Accuse float beside the board. The **clue drawer** is always docked on the right, at every desktop width (it is never hidden); it is narrower on smaller screens so the board keeps its room.
- **Mobile (600 px and narrower)**: the board, with a fixed bottom area holding the quick bar (pinned tools, then Check after a divider, then a divider and undo/redo, tray button); an Accuse strip appears above the bar once all 9 people are placed (until then the clues use that space). With many tools pinned the tool row scrolls sideways rather than wrapping. The tray button opens a bottom sheet with the remaining tools and the menu items above. The clues are always shown, in their own section below the board with their own scrollbar, so scrolling the clues never moves the board. The layout works down to 360 px wide.
- The header shows the title, difficulty, timer and seed, with icon buttons for New game, Share, Statistics, Rules (?) and Settings. On mobile only New game stays on the header; the other four sit in a menu (hamburger) button that drops a list down from the top right. Share keeps the menu open so its "Link copied" feedback shows, Settings opens its controls inside the menu, and Statistics and Rules close the menu. The menu also closes on Escape or a tap outside it.
- There is no room legend above the board (room names are labelled in the board itself). The furniture legend is a collapsible **Furniture key** section at the foot of the clue drawer; hovering an entry highlights those cells and clicking one selects them.

### 6.2 Board

- Each 9×9 cell shows its room colour, any furniture icon, any placed person token (coloured circle with initial), and pencil marks. Tokens sit centred in the cell; furniture under a person shrinks to a corner badge. A small ✕ on a placed token (shown on hover, always on touch screens) takes that person off the board.
- Thick borders mark room walls. Room names appear as small labels in the first cell of each room.
- Row numbers 1–9 and column letters A–I run along the edges. They match the wording of row and column clues.
- Hovering over (or long-pressing) a furniture icon shows its name and whether it is occupiable.

### 6.3 People panel (clue drawer)

- 9 cards: the victim first (marked as victim, with the fixed text "Was alone in the room with the murderer." in place of a clue), then the 8 suspects. The cards are split into an **Unplaced** section and a collapsible **Placed** section (collapsed state is remembered; hidden while nobody is placed). A pencil (tentative) guess still counts as unplaced. When everyone is placed, the Unplaced section says so. The clue drawer heading shows the number of unplaced people.
- The `1`–`9` number keys keep their meaning: they address people by position in the full list (victim first), whichever section the card is in.
- Each card shows the token (colour + initial), name, clue sentence and status (unplaced / placed / ✓ when confirmed by a check). Once a person is placed, their name is struck through.
- Hovering (or focusing) a card lights up that person on the board: a solid ring where they are placed, a dashed ring where they are pencilled in (tentative), and a dotted ring on every cell holding their candidate initial.
- Clicking a card **selects** that person. Words in the clue that name a room or furniture type highlight the matching cells on the board while hovered.
- The player can strike through a clue they have finished using.

### 6.4 Actions

| Action | Behaviour |
|---|---|
| **Place** | With a person selected, a **quick tap/click** on a cell notes them there as a candidate initial (tap again to remove it); the person stays selected so several cells can be noted in a row. **Press and hold** (about half a second, mouse or touch; a ring fills while holding) places them. Holding on a person's own cell removes them. Tapping an occupied cell picks that occupant. Placing on (or noting) a blocking cell is refused with a shake animation. Keyboard: `Enter` places, `Space` notes. |
| **Mark / Note / Highlight / Draw** | All the paper-style annotation tools. See §6.5. |
| **Auto-cross** (setting, on by default) | After placing someone, faintly cross out the rest of their row and column. These automatic crosses look different from crosses the player draws, and they disappear if the person is removed. |
| **Conflict highlight** (setting) | Shows rule breaks in red: two people in one row/column, or a placement contradicting that person's clue. Rule checks only, so it never reveals the solution. |
| **Undo / Redo** | Covers every board change (Ctrl+Z / Ctrl+Shift+Z). |
| **Hint** | *Removed for now.* Hint explanations were misleading, so the Hint button, the `H` key and the worker's `hint` message are gone until the hint text is reworked. The logical solver (§5.5) still grades puzzles, and `nextDeduction` stays in the engine for that rework. |
| **Check** | Reports how many placements are correct or wrong, optionally highlighting wrong ones. Counted. |
| **Reset** | Clears the board after a confirmation prompt. |
| **Accuse** | Becomes available when all 9 are placed. There is no list to pick from: the victim was alone with the murderer, so the dialog names the one person the player has placed in the victim's room and asks "Are you sure?" (computed from the player's own placements, never the solution). If the victim's room holds nobody else, or more than one other person, the dialog says so and offers no accusation. On confirm the worker checks the placement and the murderer. A correct accusation opens the Win dialog (time, checks, a share link to the seed). A wrong one says the placement is not right yet, without giving away the answer. |
| **New game** | Dialog with difficulty (Easy/Medium/Hard) and an optional seed field. Shows "Generating…" while the worker runs. |

### 6.5 Solving aids: the "paper" toolkit

The aim is that anything a player would scribble on a printed Murdoku, they can do on screen, plus a few things paper can't do (undo, what-if branches). Everything here is **player-authored only**: none of it reads the solution. All of it is covered by undo/redo, saved with the game (§8), and can be shown or hidden layer by layer.

A **tool palette** (the dock on desktop, the bottom bar and More sheet on mobile) holds the active tool and colour. The tools are below.

#### 6.5.1 Cell marks

| Mark | Meaning / look | How to apply |
|---|---|---|
| **✗ Empty** | "Nobody is here." Bold cross. | `X` key, right-click, or the ✗ tool |
| **• Possible** | "Someone could be here." A small dot. | `.` key or the dot tool |
| **? Unsure** | A reminder to come back. Small question mark. | `?` key |
| **Candidate initials** | Up to 9 tiny initials in a 3×3 mini-grid inside the cell (like Sudoku pencil marks). Each person's initial always sits in the same slot, so patterns are easy to scan. | Place mode: a quick tap on a cell with a person selected (`Space` from the keyboard). There is no separate Notes tool any more. |
| **Eliminated initial** | An initial with a slash through it: "*this* person is not here," while others still might be. | Eliminate tool (`E`): tap with a person selected, or type their number |
| **Tentative placement** | A dashed outline token: "I think B goes here," without committing. It doesn't count towards row/column rules or Accuse. Can be promoted to a real placement with one click (✓), or dropped with its ✕. | Pencil-place mode (`P`) |
| **Erase** | Wipes one cell (or the selection) clean: marks, candidate initials, highlight and pencil guesses, as one undoable step. Real placements stay. | Erase tool (`R`), or `Delete` / `Backspace` |

#### 6.5.2 Colours and highlights

- **Cell fill highlight** in 6 colours. Each colour is also drawn with a distinct pattern edge, so it doesn't depend on colour vision. Typical use: shade every cell where B could still be.
- **Multi-select**: drag (or Shift-click) to select many cells, then apply a mark, colour or candidate to all of them at once.
- **Quick-selects**: whole row, whole column, whole room (double-click a room label), or "all cells with this furniture type" (click a furniture entry in the Key). Useful for things like crossing out a whole room in one go.

#### 6.5.3 Room notes

- *Removed.* Room notes went with the room legend, and per-row and per-column margin notes were removed earlier; the scratchpad and person-card notes cover free text. The old fields remain in the save format only so old saves load; nothing shows them.

#### 6.5.4 Clue annotations

- Tick off each **part** of a combined clue separately (e.g. "in the Study ✓", "beside a bookshelf ✓").
- Strike through a whole clue, or dim the card once that person is solved.
- Highlight words inside a clue with a colour.
- A **free-text note** field on every person card (e.g. "must be row 2 or 7").

#### 6.5.5 Logic grid (deduction matrix)

An optional panel, opened by a toggle, with a classic logic-puzzle grid. Players who like to solve on a grid can work here instead of, or as well as, on the board:

- **People × Rooms**, **People × Rows** and **People × Columns** tables.
- Each cell cycles through blank → ✗ → ✓ → blank.
- Optional link (setting, off by default): a ✓ in People × Rooms can shade that person's possible cells on the board. Like everything else, it only uses the player's own marks.

#### 6.5.6 Freehand pen layer

- A transparent drawing layer over the board, for arrows, circles, lines between cells and quick scribbles.
- Tools: **pen** (3 widths), **highlighter** (semi-transparent), **eraser**, and **clear drawing**.
- Uses pointer events with pressure where supported, so it works with mouse, touch or stylus. Strokes are stored as simplified point lists in grid-relative coordinates, so they stay aligned when the board is resized.
- Toggle the layer's visibility, or lock it so taps go to the cells instead of drawing.

#### 6.5.7 Scratchpad

A free-text notepad for the whole puzzle, for longer reasoning ("If C is in the Kitchen then…"). Minimised it is a round button (with a dot when it holds text); open it is a floating panel that can be dragged by its header and resized by its corner handle, and stays inside the window. Position, size and open state are remembered per browser.

#### 6.5.8 What-if branches ("try in pencil")

- **Start what-if** takes a snapshot of the whole board and all annotations, then tints the board to show you're in a hypothesis.
- The player explores freely. Rule conflicts still show up as usual (if enabled), which is how a contradiction appears.
- Afterwards they either **Keep** (merge into the main board) or **Abandon** (revert to the snapshot). An optional "note why" prompt records the result in the scratchpad, e.g. "C in Kitchen → contradiction."
- Nesting is supported up to 3 levels, shown as breadcrumbs.

#### 6.5.9 Optional automatic helpers

All are in Settings and all are **off by default**, except where marked. They act only on the player's own placements and the clue rules, never the solution:

- Auto-cross row and column on placement (on by default, §6.4).
- Auto-clear a person's candidate initials elsewhere once they are placed (on by default).
- "Show where this clue allows": while a person is selected, dim the cells their clue rules out. This is a strong aid, so it is counted in the win stats as "assists used."
- Conflict highlighting (§6.4).

#### 6.5.10 Layers, clearing and printing

- A **layers menu** toggles visibility for: crosses, candidates, highlights, drawing and tentative placements.
- **Clear…** offers a choice: clear one layer, clear all annotations but keep placements, or reset everything (each with confirmation; all undoable).
- **Print / PDF**: a print stylesheet renders a clean black-and-white board, legend and clue list on one A4/Letter page. An option includes the player's current marks. Useful for people who want to finish on real paper.

### 6.6 Keyboard and accessibility

- Arrow keys move a cell cursor. `1`–`9` select a person. `Enter` places, `Space` notes a candidate.
- Marks: `X` (cross), `.` (possible), `?` (unsure), `E` (eliminate), `P` (pencil/tentative placement), `D` (draw tool), `C` (cycle highlight colour), `W` (start/end what-if), `G` (logic grid).
- Every tool has a palette button with a tooltip showing its shortcut (when it is on the quick bar). Tool keys are gated by the quick bar (§6.1); arrows, digits, `Enter`, `Space`, `V`, `Esc` and undo/redo always work.
- Every cell has an `aria-label`, e.g. "Row 3, column D, Kitchen, chair, empty".
- Colour is never the only signal: tokens show initials and conflicts also use an icon.
- `prefers-reduced-motion` is respected.

### 6.7 Themes

Light and dark themes via CSS variables, following the system setting by default, with a manual toggle in Settings.

---

## 7. Keeping the solution hidden (browser-only)

The goal is to make casual cheating impractical, not impossible.

1. **The solution lives only inside the Web Worker.** The worker generates the puzzle and posts back a `PuzzleView`: grid, rooms, furniture, people, clues, seed, difficulty. That object has **no solution field**. React state and DevTools component inspectors never see the solution.
2. **Checks are worker messages.** `check(placement)` and `accuse(placement, suspectId)` run in the worker. The replies only report correct/incorrect. Any other message type gets a `bad-request` error.
3. **Nothing is persisted in plaintext.** localStorage holds only the seed, generator version and player progress. On reload the worker regenerates the puzzle from the seed, so no solution is ever written to storage.
4. **Win verification without the worker** (fallback / sanity check): the `PuzzleView` carries `solutionHash = SHA-256(seed + canonical placement)` (Web Crypto). The UI can confirm a win by hashing the player's board, without knowing the answer.
5. A determined person can still solve it by running the generator with the seed, reading worker memory, or simply using the solver. That is acceptable, as agreed.

---

## 8. Persistence

- `localStorage["murdoku:v1:current"]` → `{ generatorVersion, seed, difficulty, placements, tentativePlacements, annotations, whatIfStack, history (capped at 500 steps), elapsedMs, checksUsed, assistsUsed, startedAt }`, where `annotations` is:
  ```ts
  interface Annotations {
    cellMarks: Record<CellKey, 'cross' | 'dot' | 'unsure'>;
    autoCrosses: CellKey[];                       // derived; kept separate from player crosses
    candidates: Record<CellKey, { yes: number; no: number }>; // 9-bit person masks
    highlights: Record<CellKey, ColorId>;
    rowNotes: string[]; colNotes: string[]; roomNotes: Record<RoomId, string>;
    clueTicks: Record<PersonId, boolean[]>; clueStruck: PersonId[];
    clueHighlights: Record<PersonId, { start: number; end: number; color: ColorId }[]>;
    personNotes: Record<PersonId, string>;
    logicGrid: { rooms: Mark3[][]; rows: Mark3[][]; cols: Mark3[][] };
    strokes: { tool: 'pen' | 'highlighter'; color: ColorId; width: number; pts: [number, number][] }[];
    scratchpad: string;
    layerVisibility: Record<LayerId, boolean>;
  }
  ```
  Saves are debounced (≈500 ms). Freehand strokes are simplified (Ramer–Douglas–Peucker) to keep the save small.
- `localStorage["murdoku:v1:stats"]` → games played and won, best times per difficulty, current streak.
- `localStorage["murdoku:v1:settings"]` → theme, auto-cross, conflict highlighting.
- On load:
  1. If a saved game exists and its generator version matches, regenerate from the seed and restore progress.
  2. If the version does not match, offer to start a new game.
- URL `?seed=abc&d=medium` starts that specific puzzle (shareable). The share button copies the URL.
- All storage access is wrapped in try/catch, so the game still works in private mode.

---

## 9. Core types (sketch)

```ts
type Cell = { r: number; c: number };          // 0..8
type RoomId = number;
type FurnitureType = 'chair' | 'armchair' | 'sofa' | 'bed' | 'rug' | 'table' | 'plant'
                   | 'bookshelf' | 'wardrobe' | 'tv' | 'stove' | 'bathtub' | 'piano' | 'car';
interface Room { id: RoomId; type: RoomType; name: string; cells: Cell[]; color: string }
interface Person { id: number; name: string; initial: string; color: string; isVictim: boolean }
type Atom =
  | { kind: 'inRoom' | 'notInRoom'; room: RoomId }
  | { kind: 'on' | 'beside' | 'notBeside'; furniture: FurnitureType }
  | { kind: 'row' | 'col'; index: number }
  | { kind: 'alone' } | { kind: 'sameRoomAs'; person: number }
  | { kind: 'roomCorner' | 'roomEdge' };
interface Clue { person: number; atoms: Atom[] }
interface PuzzleView {               // what the UI receives
  version: number; seed: string; difficulty: Difficulty;
  roomOf: RoomId[][]; rooms: Room[]; furniture: (FurnitureType | null)[][];
  people: Person[]; clues: Clue[]; solutionHash: string;
}
interface Solution { cellOf: Cell[]; murdererId: number }   // worker-only
```

Future attributes (jobs, motives, weapons, times) become extra `Person` fields and new `Atom` kinds. The solver treats them as extra dimensions, so the architecture does not need to change.

---

## 10. Milestones

1. **Scaffold**: Vite React-TS template, ESLint/Prettier, Vitest, Zustand, folder layout.
2. **Engine core**: rng, types, floor plan, placement, furniture, plus unit tests.
3. **Clues and solvers**: facts, evaluation, rendering, brute-force and logical solvers, generator loop, difficulty grading, plus tests.
4. **Worker**: generate/check/accuse protocol and client wrapper.
5. **UI**: board, people panel, place, undo/redo, conflicts, auto-cross.
5b. **Solving toolkit** (§6.5): cell marks, candidates, tentative placements, highlights and multi-select, room notes, clue annotations, logic grid, pen layer, scratchpad, what-if branches, layers, print view.
6. **Game flow**: new game dialog, timer, check, accuse, win, rules dialog.
7. **Persistence and sharing**: localStorage, seed URLs, stats.
8. **Polish**: themes, responsive layout, keyboard and accessibility, furniture SVG art, animations.

---

## 11. Verification

- **Engine unit tests (Vitest)**:
  - The same seed gives an identical puzzle (determinism).
  - Over **500 random seeds per difficulty**:
    - exactly one solution (brute force);
    - the logical solver solves it within the target technique level;
    - the solution meets every clue, the row/column rules and the blocking-furniture rule;
    - the victim's room holds exactly one suspect;
    - no clue reveals the murderer directly.
  - Room generator: every room is contiguous, within size bounds, and the grid is fully covered.
  - Clue rendering: snapshot tests of the English text.
  - Timing: average generation time logged; the test fails if p95 is over 1.5 s.
- **E2E smoke test (Cypress)**: load `?seed=test-easy`, place all people from a known solution through the UI, accuse, and assert the win dialog appears. Reload mid-game and assert progress is restored.
- **Toolkit tests (Vitest, store level)**:
  - Every annotation action can be undone and redone exactly.
  - What-if Keep merges and Abandon restores the snapshot byte for byte.
  - Annotations survive a save/load round trip.
  - Auto-crosses disappear when the person is removed, while player crosses stay.
  - No annotation code path imports anything from the worker or reads the solution.
- **E2E toolkit check (Cypress)**: add candidates, a highlight, a room note and a pen stroke, reload the page, and assert they are all restored.
- **Manual**: `npm run dev`, then play a few games of each difficulty on desktop and at mobile width, and check light and dark themes.
- **Build**: `npm run build && npm run preview`. Confirm the static output works with no server.

---

## 12. Open questions / defaults chosen

These are the defaults I picked. Tell me if you want any changed.

- **"Beside" = orthogonal adjacency within the same room.** Switchable to include diagonals.
- **Furniture you can stand on**: chair, armchair, sofa, bed, rug. Everything else blocks.
- **Windows and doors** as clue targets are **not** in v1 (could be added as wall features later).
- **Row/column labels**: rows 1–9, columns A–I.
- **No daily puzzle in v1.** The seed system makes it trivial to add later (seed = date).
- **Suspect names**: a fixed pool of about 40 names, picked so all 9 initials are distinct.
