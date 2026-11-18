import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cellKey } from '../engine/types';
import { furnitureCells, roomCells } from '../state/selection';
import { selectConflicts, type Tool } from '../state/store';
import { Board } from './Board';
import type { ActivateMods } from './Cell';
import { ConfirmDialog } from './ConfirmDialog';
import { FurnitureLegend } from './FurnitureLegend';
import { ClearMenu, describeClear, LayersMenu, type ClearChoice } from './ToolkitMenus';
import { ToolPalette } from './ToolPalette';
import { useGame, useStoreApi } from './context';
import styles from './Game.module.css';
import { PeoplePanel } from './PeoplePanel';
import { RoomLegend } from './RoomLegend';
import { assignRoomColors } from './roomColors';
import { Toolbar } from './Toolbar';
import { conflictsByPerson, type Highlight } from './types';

const SHAKE_MS = 400;

/** The playable screen: header, board, toolbar and people panel. */
export function Game() {
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

  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [clearChoice, setClearChoice] = useState<ClearChoice | null>(null);
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  const shakeTimer = useRef<number | undefined>(undefined);

  const conflicts = useMemo(
    () => conflictsByPerson(selectConflicts({ puzzle, placements })),
    [puzzle, placements],
  );

  const roomColors = useMemo(
    () => (puzzle ? assignRoomColors(puzzle.rooms, puzzle.roomOf) : new Map()),
    [puzzle],
  );

  const selectionSet = useMemo(() => new Set(selection), [selection]);

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
      const key = cellKey(r, c);
      const sel = s.selectedPerson;
      const t = s.tool;
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
      if (confirmReset || clearChoice) return;
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
        else if (k === 'n') s.setTool(s.tool === 'notes' ? 'place' : 'notes');
        else if (k === 'p') s.setTool(s.tool === 'pencil' ? 'place' : 'pencil');
        else if (k === 'e') s.setTool(s.tool === 'eliminate' ? 'place' : 'eliminate');
        else if (k === 'v') s.setTool('place');
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
  }, [store, confirmReset, clearChoice, targets]);

  if (!puzzle) return null;
  const actions = store.getState();

  return (
    <div className={styles.layout} data-testid="game">
      <div className={styles.toolbarArea}>
        <ToolPalette
          tool={tool}
          color={color}
          onTool={onTool}
          onColor={(c) => {
            actions.setColor(c);
            actions.setTool('highlight');
            if (store.getState().selection.length > 0) store.getState().applyTool(selection);
          }}
        />
        <Toolbar
          canUndo={canUndo}
          canRedo={canRedo}
          canReset={anyPlaced}
          settings={settings}
          onUndo={() => actions.undo()}
          onRedo={() => actions.redo()}
          onReset={() => setConfirmReset(true)}
          onSettings={(patch) => actions.updateSettings(patch)}
        >
          <LayersMenu
            visibility={annotations.layerVisibility}
            onToggle={(l, v) => actions.setLayerVisible(l, v)}
          />
          <ClearMenu onChoose={setClearChoice} />
        </Toolbar>
      </div>
      <div className={styles.boardArea}>
        <Board
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
