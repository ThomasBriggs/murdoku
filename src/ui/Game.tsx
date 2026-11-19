import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setHas } from '../engine/cellset';
import { allowedCells } from '../engine/clues/evaluate';
import { GRID_SIZE } from '../engine/constants';
import { cellKey } from '../engine/types';
import { furnitureCells, roomCells } from '../state/selection';
import { slotOf, type ColorId } from '../state/annotations';
import { logicPossibleCells } from '../state/logicGrid';
import {
  allPlaced,
  selectConflicts,
  type GameStore,
  WHATIF_MAX_DEPTH,
  type Tool,
} from '../state/store';
import type { HintDeduction as Deduction } from '../worker/protocol';
import type { PersonId } from '../engine/types';
import { AccuseDialog } from './dialogs/AccuseDialog';
import { WinDialog } from './dialogs/WinDialog';
import { CheckSummary, HintPanel, hintHighlights, type HintView } from './Feedback';
import feedback from './Feedback.module.css';
import { withShortcut } from './shortcuts';
import { placementMatchesHash } from './verifyWin';
import { Board } from './Board';
import type { ActivateMods } from './Cell';
import { ConfirmDialog } from './ConfirmDialog';
import { DrawControls } from './DrawControls';
import { LogicGrid } from './LogicGrid';
import { PrintSheet } from './PrintSheet';
import { Scratchpad } from './Scratchpad';
import { WhatIfBanner, WhatIfEndDialog, type WhatIfEnd } from './WhatIf';
import { FurnitureLegend } from './FurnitureLegend';
import { ClearMenu, describeClear, LayersMenu, type ClearChoice } from './ToolkitMenus';
import { ColorPicker, PRIMARY_TOOLS, ToolPalette } from './ToolPalette';
import palette from './ToolPalette.module.css';
import { CheckIcon, FlagIcon, HintIcon, ResetIcon, UndoIcon } from './icons/glyphs';
import { useGame, useStoreApi } from './context';
import styles from './Game.module.css';
import { PeoplePanel } from './PeoplePanel';
import { RoomLegend } from './RoomLegend';
import { assignRoomColors } from './roomColors';
import { SettingsMenu, Toolbar } from './Toolbar';
import { conflictsByPerson, type Highlight } from './types';

const SHAKE_MS = 400;

/** Feedback tied to the board it was computed for; it stops showing once the board changes. */
interface Stamped<T> {
  value: T;
  p: unknown;
  t: unknown;
  a: unknown;
}
const boardStamp = (s: GameStore) => ({
  p: s.placements,
  t: s.tentativePlacements,
  a: s.annotations,
});

/** Subscribe to a CSS media query (false where matchMedia does not exist, e.g. jsdom). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener('change', notify);
      return () => mq?.removeEventListener('change', notify);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** The playable screen: board, toolbar, people panel and the game-flow dialogs. */
export function Game({ onNewGame }: { onNewGame(): void }) {
  const store = useStoreApi();
  const puzzle = useGame((g) => g.puzzle);
  const placements = useGame((g) => g.placements);
  const selected = useGame((g) => g.selectedPerson);
  const settings = useGame((g) => g.settings);
  const annotations = useGame((g) => g.annotations);
  const tentative = useGame((g) => g.tentativePlacements);
  const selection = useGame((g) => g.selection);
  const tool = useGame((g) => g.tool);
  const color = useGame((g) => g.color);
  const canUndo = useGame((g) => g.history.past.length > 0);
  const canRedo = useGame((g) => g.history.future.length > 0);
  const anyPlaced = useGame((g) => Object.values(g.placements).some((c) => c !== null));
  const whatIfLevel = useGame((g) => g.whatIfStack.length);
  const pen = useGame((g) => g.pen);
  const penSize = useGame((g) => g.penSize);
  const drawLocked = useGame((g) => g.drawLocked);
  const status = useGame((g) => g.status);
  const complete = useGame((g) => allPlaced(g));
  const solved = status === 'won';
  const elapsedMs = useGame((g) => g.elapsedMs);
  const newBest = useGame((g) => g.newBest);
  const hintsUsed = useGame((g) => g.hintsUsed);
  const checksUsed = useGame((g) => g.checksUsed);
  const assistsUsed = useGame((g) => g.assistsUsed);
  const [hintStamped, setHint] = useState<Stamped<HintView> | null>(null);
  const [checkStamped, setCheck] = useState<Stamped<{
    correct: PersonId[];
    wrong: PersonId[];
  }> | null>(null);
  const [showWrong, setShowWrong] = useState(false);
  const [accuseOpen, setAccuseOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);

  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const mobile = useMediaQuery('(max-width: 600px)');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasMoreOpen = useRef(false);
  useEffect(() => {
    // The More sheet behaves like a dialog: focus moves in, and returns to its button on close.
    if (moreOpen) sheetRef.current?.querySelector<HTMLElement>('button')?.focus();
    else if (wasMoreOpen.current && document.activeElement === document.body)
      moreButton.current?.focus();
    wasMoreOpen.current = moreOpen;
  }, [moreOpen]);
  const [clearChoice, setClearChoice] = useState<ClearChoice | null>(null);
  const [logicOpen, setLogicOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [whatIfEnd, setWhatIfEnd] = useState<WhatIfEnd | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printMarks, setPrintMarks] = useState(false);
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  const shakeTimer = useRef<number | undefined>(undefined);

  // Feedback is about the board as it was when asked for: any later change hides it.
  const stillValid = <T,>(x: Stamped<T> | null): T | null =>
    x && x.p === placements && x.t === tentative && x.a === annotations ? x.value : null;
  const hint = stillValid(hintStamped);
  const check = stillValid(checkStamped);

  const requestHint = useCallback(
    async (revealOne?: boolean) => {
      const r = await store.getState().hint(revealOne);
      if (!r) return;
      setCheck(null);
      const at = boardStamp(store.getState());
      if (r.type === 'deduction')
        setHint({ ...at, value: { kind: 'deduction', deduction: r.deduction } });
      else if (r.type === 'wrong')
        setHint({
          ...at,
          value: {
            kind: 'wrong',
            count: r.count,
            ...(r.person !== undefined ? { person: r.person } : {}),
          },
        });
      else setHint({ ...at, value: { kind: 'none', complete: allPlaced(store.getState()) } });
    },
    [store],
  );

  const runCheck = useCallback(async () => {
    const r = await store.getState().check();
    if (!r) return;
    setHint(null);
    setCheck({ ...boardStamp(store.getState()), value: r });
  }, [store]);

  const applyHint = useCallback(
    (d: Deduction) => {
      const s = store.getState();
      if (d.kind === 'place' && d.person !== undefined && d.cells[0]) {
        s.place(d.person, cellKey(d.cells[0].r, d.cells[0].c));
      } else {
        const keys = [...new Set(d.cells.map((c) => cellKey(c.r, c.c)))];
        // applyMark toggles, so skip cells that are already crossed out.
        s.applyMark(
          keys.filter((k) => s.annotations.cellMarks[k] !== 'cross'),
          'cross',
        );
      }
      setHint(null);
    },
    [store],
  );

  const accuse = useCallback(
    async (id: PersonId) => {
      const r = await store.getState().accuse(id);
      if (!r) return 'error' as const;
      if (!r.won) return r.placementCorrect ? ('suspect' as const) : ('placement' as const);
      const s = store.getState();
      // Sanity check (SPEC §7.4): the board must hash to the puzzle's solution hash.
      if (s.puzzle && !(await placementMatchesHash(s.puzzle, s.placements)))
        console.warn('Win reported by the worker does not match the local solution hash.');
      setAccuseOpen(false);
      setWinOpen(true);
      return 'won' as const;
    },
    [store],
  );

  const wrongPeople = useMemo(() => {
    const out = new Set<PersonId>();
    if (check && showWrong) for (const id of check.wrong) out.add(id);
    if (hint?.kind === 'wrong' && hint.person !== undefined) out.add(hint.person);
    return out;
  }, [check, showWrong, hint]);
  const hintCells = useMemo(() => hintHighlights(hint), [hint]);

  const conflicts = useMemo(
    () => conflictsByPerson(selectConflicts({ puzzle, placements })),
    [puzzle, placements],
  );

  const roomColors = useMemo(
    () => (puzzle ? assignRoomColors(puzzle.rooms, puzzle.roomOf) : new Map()),
    [puzzle],
  );

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  // Assists: cells the selected person's clue rules out (SPEC §6.5.9) ...
  const dimmed = useMemo(() => {
    if (!settings.showClueAllows || selected === null || !puzzle) return undefined;
    const allowed = allowedCells(puzzle, selected);
    const out = new Set<number>();
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) if (!setHas(allowed, r, c)) out.add(cellKey(r, c));
    return out;
  }, [settings.showClueAllows, selected, puzzle]);
  // ... and cells the player's own logic-grid ticks leave possible (§6.5.5).
  const possible = useMemo(() => {
    if (!settings.linkLogicGrid || selected === null || !puzzle) return undefined;
    return (
      logicPossibleCells(annotations.logicGrid, puzzle.roomOf, slotOf(puzzle.people, selected)) ??
      undefined
    );
  }, [settings.linkLogicGrid, selected, puzzle, annotations.logicGrid]);

  /** Cells a mark/key acts on: the multi-selection when there is one, else the cursor cell. */
  const targets = useCallback(
    (at?: { r: number; c: number }) => {
      const s = store.getState();
      const cell = at ?? cursorRef.current;
      return s.selection.length > 0 ? s.selection : [cellKey(cell.r, cell.c)];
    },
    [store],
  );

  const onTool = useCallback(
    (t: Tool) => {
      const s = store.getState();
      s.setTool(t);
      // With cells selected, picking a mark/colour/notes tool applies it to all of them.
      if (s.selection.length > 0) s.applyTool(s.selection);
    },
    [store],
  );

  const onActivate = useCallback(
    (r: number, c: number, mods: ActivateMods = {}) => {
      setCursor({ r, c });
      const s = store.getState();
      if (s.status !== 'playing') return; // solved: view only
      const key = cellKey(r, c);
      const sel = s.selectedPerson;
      // The draw tool only owns the pointer through the overlay; taps that reach a cell place.
      const t = s.tool === 'draw' ? 'place' : s.tool;
      if (mods.keyboard && s.selection.length > 0 && t !== 'place' && t !== 'select') {
        s.applyTool(s.selection, mods.shift);
        return;
      }
      if (t === 'select' || (mods.shift && t !== 'notes' && t !== 'eliminate')) {
        s.selectCells([key], mods.shift ? 'toggle' : 'replace');
        return;
      }
      if (t === 'pencil') {
        if (sel !== null) {
          if (s.placeTentative(sel, key) !== 'refused') s.selectPerson(null);
        } else {
          const guess = s.puzzle?.people.find((p) => s.tentativePlacements[p.id] === key);
          if (guess) s.selectPerson(guess.id);
        }
        return;
      }
      if (t !== 'place') {
        // Mark, notes and highlight tools act on the clicked cell only.
        if (s.selection.length > 0 && !mods.keyboard) s.clearSelection();
        s.applyTool([key], mods.shift);
        return;
      }
      if (sel !== null) {
        if (s.placements[sel] === key) {
          s.remove(sel); // selection is kept so the person can be put somewhere else
          return;
        }
        const result = s.place(sel, key);
        if (result === 'refused') {
          window.clearTimeout(shakeTimer.current);
          setShakeCell(null);
          // Re-arm on the next frame so repeated refusals replay the animation.
          requestAnimationFrame(() => {
            setShakeCell(key);
            shakeTimer.current = window.setTimeout(() => setShakeCell(null), SHAKE_MS);
          });
        } else {
          s.selectPerson(null);
        }
        return;
      }
      const occupant = s.puzzle?.people.find((p) => s.placements[p.id] === key);
      if (occupant) s.selectPerson(occupant.id);
    },
    [store],
  );

  const onContextMenu = useCallback(
    (r: number, c: number) => {
      setCursor({ r, c });
      store.getState().applyMark([cellKey(r, c)], 'cross');
    },
    [store],
  );

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmReset || clearChoice || whatIfEnd || printOpen || accuseOpen || winOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return; // header dialogs

      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = store.getState();
      const inGrid = !!t?.closest?.('[role="grid"]');
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        store.getState().redo();
      } else if (e.key === 'Escape') {
        if (s.tool === 'draw') s.setTool('place');
        s.selectPerson(null);
        s.clearSelection();
      } else if (!mod && !e.altKey) {
        // Toolkit shortcuts (SPEC §6.6). Marks act on the selection, or on the
        // cursor cell when the board has focus.
        const act = s.selection.length > 0 || inGrid;
        const cellEl = t?.closest?.('[data-r]') as HTMLElement | null | undefined;
        const at = cellEl
          ? { r: Number(cellEl.dataset.r), c: Number(cellEl.dataset.c) }
          : undefined;
        const toolKey = (tool: Tool) => {
          s.setTool(tool);
          if (act) s.applyTool(targets(at));
        };
        if (k === 'x') toolKey('cross');
        else if (e.key === '.') toolKey('dot');
        else if (e.key === '?') toolKey('unsure');
        else if (k === 'r') toolKey('erase');
        else if (k === 'n') s.setTool(s.tool === 'notes' ? 'place' : 'notes');
        else if (k === 'p') s.setTool(s.tool === 'pencil' ? 'place' : 'pencil');
        else if (k === 'e') s.setTool(s.tool === 'eliminate' ? 'place' : 'eliminate');
        else if (k === 'd') s.setTool(s.tool === 'draw' ? 'place' : 'draw');
        else if (k === 'h') void requestHint();
        else if (k === 'g') setLogicOpen((o) => !o);
        else if (k === 'w') {
          // W starts a what-if, or (inside one) asks how to end it; Shift+W nests another.
          if (s.whatIfStack.length === 0 || e.shiftKey) s.startWhatIf();
          else setWhatIfEnd('choose');
        } else if (k === 'v') s.setTool('place');
        else if (k === 's') s.setTool(s.tool === 'select' ? 'place' : 'select');
        else if (k === 'c') {
          if (s.tool === 'highlight') s.cycleColor();
          else s.setTool('highlight');
          if (act) s.applyTool(targets(at));
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && act) {
          e.preventDefault();
          s.clearCellAnnotations(targets(at));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    store,
    confirmReset,
    clearChoice,
    whatIfEnd,
    printOpen,
    accuseOpen,
    winOpen,
    targets,
    requestHint,
  ]);

  if (!puzzle) return null;
  const actions = store.getState();

  const onColor = (c: ColorId) => {
    actions.setColor(c);
    // While drawing, the colour is the pen's colour; otherwise it switches to Highlight.
    if (tool === 'draw') return;
    actions.setTool('highlight');
    if (store.getState().selection.length > 0) store.getState().applyTool(selection);
  };
  const closeMore = () => setMoreOpen(false);
  const drawControls = (
    <DrawControls
      pen={pen}
      size={penSize}
      locked={drawLocked}
      visible={annotations.layerVisibility.drawing}
      hasStrokes={annotations.strokes.length > 0}
      onPen={(v) => actions.setPen(v)}
      onSize={(v) => actions.setPenSize(v)}
      onLock={(v) => actions.setDrawLocked(v)}
      onClear={() => actions.clearLayer('drawing')}
    />
  );
  const toolbar = (compact: boolean) => (
    <Toolbar
      compact={compact}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={() => actions.undo()}
      onRedo={() => actions.redo()}
      secondary={
        <>
          <button
            type="button"
            data-testid="reset"
            disabled={!anyPlaced}
            onClick={() => setConfirmReset(true)}
            title="Reset board"
          >
            <ResetIcon className={palette.menuIcon} />
            <span>Reset</span>
          </button>
          <LayersMenu
            visibility={annotations.layerVisibility}
            onToggle={(l, v) => actions.setLayerVisible(l, v)}
          />
          <ClearMenu onChoose={setClearChoice} />
          <button
            type="button"
            data-testid="whatif-start"
            disabled={whatIfLevel >= WHATIF_MAX_DEPTH}
            aria-keyshortcuts="w"
            title="Start what-if (W): try a hypothesis in pencil, then keep or abandon it"
            onClick={() => {
              actions.startWhatIf();
              closeMore();
            }}
          >
            <span aria-hidden="true">⑂</span>
            <span>Start what-if</span>
          </button>
          <button
            type="button"
            data-testid="logic-toggle"
            aria-pressed={logicOpen}
            aria-keyshortcuts="g"
            title="Logic grid (G)"
            onClick={() => {
              setLogicOpen((o) => !o);
              closeMore();
            }}
          >
            <span aria-hidden="true">▦</span>
            <span>Logic grid</span>
          </button>
          <button
            type="button"
            data-testid="print-button"
            title="Print or save as PDF"
            onClick={() => {
              setPrintOpen(true);
              closeMore();
            }}
          >
            <span aria-hidden="true">⎙</span>
            <span>Print</span>
          </button>
          <SettingsMenu
            compact={compact}
            settings={settings}
            onSettings={(patch) => actions.updateSettings(patch)}
          />
        </>
      }
    >
      <button
        type="button"
        data-testid="hint-button"
        disabled={status !== 'playing'}
        aria-keyshortcuts="h"
        title={withShortcut('Hint: explain the next step you can deduce', 'hint')}
        onClick={() => {
          void requestHint();
          closeMore();
        }}
      >
        <HintIcon className={palette.menuIcon} />
        <span>Hint</span>
      </button>
      <button
        type="button"
        data-testid="check-button"
        disabled={status !== 'playing' || !anyPlaced}
        title="Check: how many placements are right or wrong"
        onClick={() => {
          void runCheck();
          closeMore();
        }}
      >
        <CheckIcon className={palette.menuIcon} />
        <span>Check</span>
      </button>
      <button
        type="button"
        data-testid="accuse-button"
        disabled={status !== 'playing' || !complete}
        title={
          complete
            ? 'Accuse a suspect of the murder'
            : 'Place all 9 people on the board before you can accuse'
        }
        onClick={() => {
          setAccuseOpen(true);
          closeMore();
        }}
      >
        <FlagIcon className={palette.menuIcon} />
        <span>Accuse</span>
      </button>
    </Toolbar>
  );

  return (
    <div className={styles.layout} data-testid="game">
      <div className={styles.toolbarArea}>
        {mobile ? (
          <>
            {(tool === 'highlight' || tool === 'draw') && !moreOpen && (
              <div className={palette.slim} data-testid="color-row">
                {tool === 'draw' && drawControls}
                <ColorPicker color={color} onColor={onColor} />
              </div>
            )}
            <div className={palette.bar}>
              <ToolPalette
                only={PRIMARY_TOOLS}
                showColors={false}
                tool={tool}
                color={color}
                onTool={onTool}
                onColor={onColor}
              />
              <button
                type="button"
                className={palette.barBtn}
                data-testid="undo"
                disabled={!canUndo}
                onClick={() => actions.undo()}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <UndoIcon style={{ width: '1.2rem', height: '1.2rem' }} />
              </button>
              <button
                type="button"
                className={palette.barBtn}
                ref={moreButton}
                data-testid="more-button"
                aria-expanded={moreOpen}
                aria-label="More tools"
                title="More tools and options"
                onClick={() => setMoreOpen((o) => !o)}
              >
                ⋯
              </button>
            </div>
            {moreOpen && (
              <>
                <div
                  className={palette.sheetBackdrop}
                  data-testid="more-backdrop"
                  onClick={() => setMoreOpen(false)}
                />
                <div
                  className={palette.sheet}
                  role="dialog"
                  aria-label="More tools"
                  data-testid="more-sheet"
                  aria-modal="true"
                  ref={sheetRef}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setMoreOpen(false);
                    else if (e.key === 'Tab') {
                      const items = sheetRef.current?.querySelectorAll<HTMLElement>(
                        'button:not(:disabled), input:not(:disabled)',
                      );
                      if (!items?.length) return;
                      const first = items[0]!;
                      const last = items[items.length - 1]!;
                      if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                      } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                      }
                    }
                  }}
                >
                  <div className={palette.sheetHead}>
                    More
                    <button
                      type="button"
                      data-testid="more-close"
                      onClick={() => setMoreOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                  <ToolPalette
                    wrap
                    except={PRIMARY_TOOLS}
                    testId="tool-palette-more"
                    tool={tool}
                    color={color}
                    onTool={(t) => {
                      onTool(t);
                      setMoreOpen(false);
                    }}
                    onColor={(c) => {
                      onColor(c);
                      setMoreOpen(false);
                    }}
                  />
                  {toolbar(true)}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className={styles.toolsArea}>
              <ToolPalette
                strip
                showColors={false}
                tool={tool}
                color={color}
                onTool={onTool}
                onColor={onColor}
              />
            </div>
            <div className={styles.actionsArea}>
              {(tool === 'highlight' || tool === 'draw') && (
                <div className={styles.context} data-testid="color-row">
                  {tool === 'draw' && drawControls}
                  <ColorPicker color={color} onColor={onColor} />
                </div>
              )}
              {toolbar(false)}
            </div>
          </>
        )}
      </div>
      <div className={styles.boardArea} data-whatif={whatIfLevel || undefined}>
        {whatIfLevel > 0 && (
          <WhatIfBanner
            level={whatIfLevel}
            onKeep={() => setWhatIfEnd('keep')}
            onAbandon={() => setWhatIfEnd('abandon')}
            onNest={() => actions.startWhatIf()}
          />
        )}
        {solved && (
          <div className={feedback.solved} data-testid="solved-banner" role="status">
            <span>Solved</span>
            <span>
              <button type="button" data-testid="solved-results" onClick={() => setWinOpen(true)}>
                Results
              </button>{' '}
              <button type="button" data-testid="solved-new" onClick={onNewGame}>
                New game
              </button>
            </span>
          </div>
        )}
        {hint && (
          <HintPanel
            view={hint}
            personName={(id) => puzzle.people.find((x) => x.id === id)?.name ?? 'Someone'}
            onShowOne={() => void requestHint(true)}
            onApply={applyHint}
            onDismiss={() => setHint(null)}
          />
        )}
        {check && (
          <CheckSummary
            correct={check.correct.length}
            wrong={check.wrong.length}
            showWrong={showWrong}
            onToggleWrong={setShowWrong}
            onDismiss={() => setCheck(null)}
          />
        )}
        <Board
          solved={solved}
          hintCells={hintCells}
          wrongPeople={wrongPeople}
          puzzle={puzzle}
          roomColors={roomColors}
          placements={placements}
          tentative={tentative}
          annotations={annotations}
          selection={selectionSet}
          tool={tool}
          selectedPerson={selected}
          cursor={cursor}
          highlight={highlight}
          conflicts={conflicts}
          autoCross={settings.autoCross}
          conflictHighlight={settings.conflictHighlight}
          shakeCell={shakeCell}
          dimmed={dimmed}
          possible={possible}
          whatIfLevel={whatIfLevel}
          draw={{
            active: tool === 'draw' && !drawLocked,
            pen,
            size: penSize,
            color,
            onStroke: (s) => actions.addStroke(s),
            onErase: (i) => actions.eraseStrokes(i),
          }}
          onCursor={(r, c) => setCursor({ r, c })}
          onActivate={onActivate}
          onContextMenu={onContextMenu}
          onSelectPerson={(id) => actions.selectPerson(id)}
          onCandidateKey={(person, eliminate, at) => {
            actions.applyCandidate(targets(at), person, eliminate);
          }}
          onDragSelect={(cells) => actions.selectCells(cells, 'replace')}
          onQuickSelect={(cells, additive) =>
            actions.selectCells(cells, additive ? 'add' : 'replace')
          }
          onRoomSelect={(room) => actions.selectCells(roomCells(puzzle.roomOf, room), 'replace')}
          onPromote={(person) => actions.promoteTentative(person)}
          onRemove={(person) => actions.remove(person)}
          onRemoveTentative={(person) => actions.removeTentative(person)}
          onNote={(kind, index, text) =>
            kind === 'row' ? actions.setRowNote(index, text) : actions.setColNote(index, text)
          }
        />
        <RoomLegend
          rooms={puzzle.rooms}
          colors={roomColors}
          notes={annotations.roomNotes}
          showNotes={annotations.layerVisibility.margins}
          onHighlight={setHighlight}
          onSelectRoom={(room) => actions.selectCells(roomCells(puzzle.roomOf, room), 'replace')}
          onNote={(room, text) => actions.setRoomNote(room, text)}
        />
        <FurnitureLegend
          furniture={puzzle.furniture}
          onHighlight={setHighlight}
          onSelect={(type, additive) =>
            actions.selectCells(
              furnitureCells(puzzle.furniture, type),
              additive ? 'add' : 'replace',
            )
          }
        />
        {logicOpen && (
          <LogicGrid
            puzzle={puzzle}
            roomColors={roomColors}
            grid={annotations.logicGrid}
            sheet={mobile}
            onCycle={(t, slot, i) => actions.cycleLogicCell(t, slot, i)}
            onClose={() => setLogicOpen(false)}
          />
        )}
        <Scratchpad
          value={annotations.scratchpad}
          open={scratchOpen}
          onToggle={setScratchOpen}
          onCommit={(text) => actions.setScratchpad(text)}
        />
      </div>
      <div className={styles.panelArea}>
        <PeoplePanel
          puzzle={puzzle}
          placements={placements}
          tentative={tentative}
          annotations={annotations}
          selectedPerson={selected}
          onSelect={(id) => actions.selectPerson(id)}
          onHighlight={setHighlight}
        />
      </div>
      <PrintSheet
        puzzle={puzzle}
        placements={placements}
        annotations={annotations}
        includeMarks={printMarks}
      />
      {accuseOpen && (
        <AccuseDialog
          suspects={puzzle.people.filter((x) => !x.isVictim)}
          onAccuse={accuse}
          onClose={() => setAccuseOpen(false)}
        />
      )}
      {winOpen && (
        <WinDialog
          elapsedMs={elapsedMs}
          difficulty={puzzle.difficulty}
          seed={puzzle.seed}
          hints={hintsUsed}
          checks={checksUsed}
          assists={assistsUsed}
          newBest={newBest}
          onClose={() => setWinOpen(false)}
          onNewGame={() => {
            setWinOpen(false);
            onNewGame();
          }}
        />
      )}
      {whatIfEnd && (
        <WhatIfEndDialog
          mode={whatIfEnd}
          level={whatIfLevel}
          onCancel={() => setWhatIfEnd(null)}
          onEnd={(outcome, note) => {
            if (outcome === 'keep') actions.keepWhatIf(note);
            else actions.abandonWhatIf(note);
            setWhatIfEnd(null);
          }}
        />
      )}
      {printOpen && (
        <ConfirmDialog
          testId="print-dialog"
          title="Print or save as PDF"
          confirmLabel="Print"
          confirmTestId="print-confirm"
          cancelTestId="print-cancel"
          neutral
          onCancel={() => setPrintOpen(false)}
          onConfirm={() => {
            setPrintOpen(false);
            // Let the dialog unmount first so focus and layout are settled.
            window.setTimeout(() => window.print(), 50);
          }}
        >
          <p>A clean black-and-white page with the board, rooms and clues.</p>
          <label>
            <input
              type="checkbox"
              data-testid="print-include-marks"
              checked={printMarks}
              onChange={(e) => setPrintMarks(e.target.checked)}
            />{' '}
            Include my marks (placements, crosses, candidates, margin notes)
          </label>
        </ConfirmDialog>
      )}
      {confirmReset && (
        <ConfirmDialog
          testId="reset-dialog"
          title="Reset the board?"
          confirmLabel="Reset"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            actions.reset();
            setConfirmReset(false);
          }}
        >
          <p>Everyone is taken off the board. You can still undo this.</p>
        </ConfirmDialog>
      )}
      {clearChoice && (
        <ConfirmDialog
          testId="clear-dialog"
          title={describeClear(clearChoice).title}
          confirmLabel={describeClear(clearChoice).label}
          onCancel={() => setClearChoice(null)}
          onConfirm={() => {
            if (clearChoice.kind === 'layer') actions.clearLayer(clearChoice.layer);
            else if (clearChoice.kind === 'annotations') actions.clearAnnotations();
            else actions.resetEverything();
            setClearChoice(null);
          }}
        >
          <p>{describeClear(clearChoice).body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
