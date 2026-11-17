import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cellKey } from '../engine/types';
import { selectConflicts } from '../state/store';
import { Board } from './Board';
import { ConfirmDialog } from './ConfirmDialog';
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
  const canUndo = useGame((g) => g.history.past.length > 0);
  const canRedo = useGame((g) => g.history.future.length > 0);
  const anyPlaced = useGame((g) => Object.values(g.placements).some((c) => c !== null));

  const [cursor, setCursor] = useState({ r: 0, c: 0 });
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [shakeCell, setShakeCell] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const shakeTimer = useRef<number | undefined>(undefined);

  const conflicts = useMemo(
    () => conflictsByPerson(selectConflicts({ puzzle, placements })),
    [puzzle, placements],
  );

  const roomColors = useMemo(
    () => (puzzle ? assignRoomColors(puzzle.rooms, puzzle.roomOf) : new Map()),
    [puzzle],
  );

  const onActivate = useCallback(
    (r: number, c: number) => {
      setCursor({ r, c });
      const s = store.getState();
      const key = cellKey(r, c);
      const sel = s.selectedPerson;
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

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmReset) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.getState().redo();
        else store.getState().undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        store.getState().redo();
      } else if (e.key === 'Escape') {
        store.getState().selectPerson(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, confirmReset]);

  if (!puzzle) return null;
  const actions = store.getState();

  return (
    <div className={styles.layout} data-testid="game">
      <div className={styles.toolbarArea}>
        <Toolbar
          canUndo={canUndo}
          canRedo={canRedo}
          canReset={anyPlaced}
          settings={settings}
          onUndo={() => actions.undo()}
          onRedo={() => actions.redo()}
          onReset={() => setConfirmReset(true)}
          onSettings={(patch) => actions.updateSettings(patch)}
        />
      </div>
      <div className={styles.boardArea}>
        <Board
          puzzle={puzzle}
          roomColors={roomColors}
          placements={placements}
          selectedPerson={selected}
          cursor={cursor}
          highlight={highlight}
          conflicts={conflicts}
          autoCross={settings.autoCross}
          conflictHighlight={settings.conflictHighlight}
          shakeCell={shakeCell}
          onCursor={(r, c) => setCursor({ r, c })}
          onActivate={onActivate}
          onSelectPerson={(id) => actions.selectPerson(id)}
        />
        <RoomLegend rooms={puzzle.rooms} colors={roomColors} onHighlight={setHighlight} />
      </div>
      <div className={styles.panelArea}>
        <PeoplePanel
          puzzle={puzzle}
          placements={placements}
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
    </div>
  );
}
