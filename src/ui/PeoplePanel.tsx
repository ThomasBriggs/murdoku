import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PencilIcon, StrikeIcon } from './icons/glyphs';
import { renderClue, type ClueToken } from '../engine/clues/render';
import type { FurnitureType, PersonId, PuzzleView, RoomId } from '../engine/types';
import { parseCellKey } from '../engine/types';
import {
  COLOR_IDS,
  type Annotations,
  type ClueHighlight,
  type ColorId,
} from '../state/annotations';
import { useStoreApi } from './context';
import { COLOR_INFO } from './colors';
import { NoteInput } from './NoteInput';
import { Token } from './Token';
import styles from './PeoplePanel.module.css';
import { COLUMN_LETTERS, panelOrder, type Highlight } from './types';

export interface PeoplePanelProps {
  puzzle: PuzzleView;
  placements: Record<PersonId, number | null>;
  tentative: Record<PersonId, number | null>;
  annotations: Annotations;
  selectedPerson: PersonId | null;
  onSelect(id: PersonId | null): void;
  onHighlight(h: Highlight | null): void;
}

interface Piece {
  text: string;
  start: number;
  color?: ColorId;
}

/** Split `text` (which starts at clue offset `offset`) at the player's highlight ranges. */
export function splitByHighlights(
  text: string,
  offset: number,
  highlights: readonly ClueHighlight[],
): Piece[] {
  const cuts = new Set<number>([0, text.length]);
  for (const h of highlights) {
    for (const x of [h.start - offset, h.end - offset]) if (x > 0 && x < text.length) cuts.add(x);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const h = highlights.find((x) => x.start <= offset + a && x.end >= offset + b);
    out.push({ text: text.slice(a, b), start: offset + a, color: h?.color });
  }
  return out;
}

/**
 * Offsets [start, end) of the current text selection within the clue rendered
 * under `root` (every text run carries `data-off`), or null when nothing in
 * the clue is selected.
 */
export function clueSelection(root: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  let start = Infinity;
  let end = -Infinity;
  for (const span of root.querySelectorAll<HTMLElement>('[data-off]')) {
    const t = span.firstChild;
    if (!t || t.nodeType !== Node.TEXT_NODE || !range.intersectsNode(t)) continue;
    const len = (t.textContent ?? '').length;
    const base = Number(span.dataset.off);
    const lo = range.startContainer === t ? range.startOffset : 0;
    const hi = range.endContainer === t ? range.endOffset : len;
    if (hi <= lo) continue;
    start = Math.min(start, base + lo);
    end = Math.max(end, base + hi);
  }
  return end > start ? { start, end } : null;
}

function ClueText({
  person,
  tokens,
  atomOfToken,
  highlights,
  ticks,
  onHighlight,
  onTick,
}: {
  person: PersonId;
  tokens: ClueToken[];
  atomOfToken: (number | null)[];
  highlights: readonly ClueHighlight[];
  ticks: readonly boolean[];
  onHighlight: (h: Highlight | null) => void;
  onTick: (atom: number) => void;
}) {
  // Text offsets of each token in the full clue sentence.
  const offsets: number[] = [];
  let acc = 0;
  for (const t of tokens) {
    offsets.push(acc);
    acc += t.text.length;
  }

  const renderToken = (t: ClueToken, i: number): ReactNode => {
    const pieces = splitByHighlights(t.text, offsets[i]!, highlights).map((pc) => (
      <span key={pc.start} data-off={pc.start} data-clue-hl={pc.color} className={styles.piece}>
        {pc.text}
      </span>
    ));
    if (t.kind === 'room' || t.kind === 'furniture') {
      const h: Highlight =
        t.kind === 'room'
          ? { kind: 'room', id: t.ref as RoomId }
          : { kind: 'furniture', id: t.ref as FurnitureType };
      return (
        <span
          key={i}
          className={t.kind === 'room' ? styles.roomWord : styles.furnWord}
          tabIndex={0}
          data-testid={`clue-${t.kind}-${t.ref}`}
          onMouseEnter={() => onHighlight(h)}
          onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(h)}
          onBlur={() => onHighlight(null)}
        >
          {pieces}
        </span>
      );
    }
    return t.kind === 'person' ? <strong key={i}>{pieces}</strong> : <span key={i}>{pieces}</span>;
  };

  // Consecutive tokens of one atom are wrapped together so it can be ticked off.
  const out: ReactNode[] = [];
  for (let i = 0; i < tokens.length;) {
    const atom = atomOfToken[i] ?? null;
    if (atom === null) {
      out.push(renderToken(tokens[i]!, i));
      i++;
      continue;
    }
    const group: ReactNode[] = [];
    let j = i;
    while (j < tokens.length && atomOfToken[j] === atom) group.push(renderToken(tokens[j]!, j++));
    const done = ticks[atom] === true;
    out.push(
      <span
        key={`a${i}`}
        className={`${styles.atom} ${done ? styles.ticked : ''}`}
        data-testid={`clue-atom-${person}-${atom}`}
        data-ticked={done ? 'true' : 'false'}
      >
        {group}
        <button
          type="button"
          className={styles.tick}
          data-testid={`clue-tick-${person}-${atom}`}
          aria-pressed={done}
          aria-label={done ? 'Untick this part of the clue' : 'Tick off this part of the clue'}
          title={done ? 'Untick this part' : 'Tick off this part'}
          onClick={(e) => {
            e.stopPropagation();
            onTick(atom);
          }}
        >
          ✓
        </button>
      </span>,
    );
    i = j;
  }
  return <>{out}</>;
}

const COLLAPSE_KEY = 'murdoku:v1:placed-collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function PeoplePanel({
  puzzle,
  placements,
  tentative,
  annotations,
  selectedPerson,
  onSelect,
  onHighlight,
}: PeoplePanelProps) {
  const store = useStoreApi();
  const ctx = useMemo(() => ({ rooms: puzzle.rooms, people: puzzle.people }), [puzzle]);
  const people = useMemo(() => panelOrder(puzzle.people), [puzzle.people]);
  const clueOf = useMemo(() => {
    const m = new Map<PersonId, ReturnType<typeof renderClue>>();
    for (const c of puzzle.clues) m.set(c.person, renderClue(ctx, c));
    return m;
  }, [puzzle.clues, ctx]);
  const [pending, setPending] = useState<{ person: PersonId; start: number; end: number } | null>(
    null,
  );
  // People whose note field is open for editing (a non-empty note shows as text otherwise).
  const [noteOpen, setNoteOpen] = useState<ReadonlySet<PersonId>>(new Set());
  const setEditing = (id: PersonId, on: boolean) =>
    setNoteOpen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const [placedCollapsed, setPlacedCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () =>
    setPlacedCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable: the state just won't persist */
      }
      return !c;
    });
  const clueRefs = useRef(new Map<PersonId, HTMLElement>());
  const actions = store.getState;

  const captureSelection = (person: PersonId) => {
    const root = clueRefs.current.get(person);
    const range = root ? clueSelection(root) : null;
    setPending(range ? { person, ...range } : null);
  };

  const renderCard = (person: (typeof people)[number], i: number) => {
    const cell = placements[person.id];
    const where = cell != null ? parseCellKey(cell) : null;
    const guess = tentative[person.id];
    const guessAt = guess != null ? parseCellKey(guess) : null;
    const selected = selectedPerson === person.id;
    const rendered = clueOf.get(person.id);
    const clue = puzzle.clues.find((c) => c.person === person.id);
    const struck = annotations.clueStruck.includes(person.id);
    const marks = annotations.clueHighlights[person.id] ?? [];
    const note = annotations.personNotes[person.id] ?? '';
    const pend = pending?.person === person.id ? pending : null;
    const editingNote = noteOpen.has(person.id);
    const noteShown = editingNote || note !== '';
    // Leaving a clue word falls back to lighting up this person, not nothing.
    const showPerson: Highlight = { kind: 'person', id: person.id };
    const highlightWithin = (h: Highlight | null) => onHighlight(h ?? showPerson);
    return (
      <li
        key={person.id}
        className={`${styles.card} ${selected ? styles.selected : ''} ${struck ? styles.struck : ''}`}
        data-testid={`person-card-${person.id}`}
        data-selected={selected ? 'true' : 'false'}
        data-placed={where ? 'true' : 'false'}
        data-struck={struck ? 'true' : 'false'}
        onClick={() => onSelect(selected ? null : person.id)}
        onMouseEnter={() => onHighlight(showPerson)}
        onMouseLeave={() => onHighlight(null)}
      >
        <div className={styles.top}>
          <button
            type="button"
            className={styles.head}
            aria-pressed={selected}
            onFocus={() => onHighlight(showPerson)}
            onBlur={() => onHighlight(null)}
            aria-keyshortcuts={String(i + 1)}
          >
            <span className={styles.tokenBox}>
              <Token person={person} scope="card-" />
            </span>
            <span className={styles.name}>
              <span
                className={where ? styles.placedName : undefined}
                data-testid={`person-name-${person.id}`}
                data-placed={where ? 'true' : undefined}
              >
                {person.name}
              </span>
              {person.isVictim && <span className={styles.victimTag}>Victim</span>}
            </span>
            <span className={styles.status} data-testid={`person-status-${person.id}`}>
              {where
                ? `Placed ${COLUMN_LETTERS[where.c]}${where.r + 1}`
                : guessAt
                  ? `Guess ${COLUMN_LETTERS[guessAt.c]}${guessAt.r + 1}`
                  : 'Unplaced'}
            </span>
          </button>
          <span className={styles.icons} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.icon}
              data-testid={`clue-strike-${person.id}`}
              aria-pressed={struck}
              aria-label={struck ? 'Remove the strike-through' : 'Strike through this clue'}
              title={struck ? 'Remove the strike-through' : 'Strike through this clue'}
              onClick={() => actions().toggleClueStruck(person.id)}
            >
              <StrikeIcon style={{ width: '1em', height: '1em' }} />
            </button>
            <button
              type="button"
              className={styles.icon}
              data-testid={`person-note-btn-${person.id}`}
              aria-pressed={noteShown}
              aria-label={`Note for ${person.name}`}
              title="Add a note to this card"
              data-has-note={note ? 'true' : undefined}
              onClick={() => setEditing(person.id, true)}
            >
              <PencilIcon style={{ width: '1em', height: '1em' }} />
            </button>
          </span>
        </div>
        <p
          className={`${styles.clue} ${struck ? styles.clueStruck : ''}`}
          data-testid={`person-clue-${person.id}`}
          ref={(el) => {
            if (el) clueRefs.current.set(person.id, el);
            else clueRefs.current.delete(person.id);
          }}
          onMouseUp={() => captureSelection(person.id)}
          onKeyUp={() => captureSelection(person.id)}
          onClick={(e) => {
            if (!window.getSelection()?.isCollapsed) e.stopPropagation();
          }}
        >
          {rendered && clue ? (
            <ClueText
              person={person.id}
              tokens={rendered.tokens}
              atomOfToken={rendered.atomOfToken}
              highlights={marks}
              ticks={annotations.clueTicks[person.id] ?? []}
              onHighlight={highlightWithin}
              onTick={(atom) => actions().toggleClueTick(person.id, atom)}
            />
          ) : person.isVictim ? (
            'The victim. Only the murderer shared a room with them.'
          ) : null}
        </p>
        {(marks.length > 0 || pend) && (
          <div
            className={styles.tools}
            onClick={(e) => e.stopPropagation()}
            role="group"
            aria-label={`${person.name} clue tools`}
          >
            {marks.length > 0 && (
              <button
                type="button"
                className={styles.mini}
                data-testid={`clue-hl-clear-${person.id}`}
                title="Remove the colours from this clue"
                onClick={() => actions().clearClueHighlights(person.id)}
              >
                Clear colours
              </button>
            )}
            {pend && (
              <span
                className={styles.hlBar}
                role="group"
                aria-label="Highlight the selected words"
                data-testid={`clue-hl-bar-${person.id}`}
              >
                {COLOR_IDS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={styles.hlSwatch}
                    data-color={c}
                    data-testid={`clue-hl-${person.id}-${c}`}
                    title={`Highlight in ${COLOR_INFO[c].label.toLowerCase()}`}
                    aria-label={`Highlight selected words in ${COLOR_INFO[c].label.toLowerCase()}`}
                    onClick={() => {
                      actions().addClueHighlight(person.id, pend.start, pend.end, c);
                      window.getSelection()?.removeAllRanges();
                      setPending(null);
                    }}
                  >
                    {COLOR_INFO[c].glyph}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
        {noteShown && (
          <div className={styles.noteRow} onClick={(e) => e.stopPropagation()}>
            {editingNote ? (
              <NoteInput
                autoFocus
                className={styles.noteInput}
                value={note}
                maxLength={200}
                placeholder="Note, e.g. row 2 or 7"
                label={`Note for ${person.name}`}
                testId={`person-note-${person.id}`}
                onCommit={(t) => actions().setPersonNote(person.id, t)}
                onDone={() => setEditing(person.id, false)}
              />
            ) : (
              <button
                type="button"
                className={styles.noteText}
                data-testid={`person-note-text-${person.id}`}
                title="Click to edit this note"
                onClick={() => setEditing(person.id, true)}
              >
                {note}
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  const isPlaced = (id: PersonId) => placements[id] != null;
  const unplacedList = people.map((p, i) => ({ p, i })).filter(({ p }) => !isPlaced(p.id));
  const placedList = people.map((p, i) => ({ p, i })).filter(({ p }) => isPlaced(p.id));

  return (
    <section className={styles.panel} aria-label="People" data-testid="people-panel">
      <div data-testid="clues-unplaced" className={styles.group}>
        <h3 className={styles.groupHead}>
          <span>Unplaced</span>
          <span className={styles.groupCount}>({unplacedList.length})</span>
        </h3>
        {unplacedList.length > 0 ? (
          <ol className={styles.list}>{unplacedList.map(({ p, i }) => renderCard(p, i))}</ol>
        ) : (
          <p className={styles.allPlaced} data-testid="clues-all-placed">
            Everyone is placed. Time to accuse.
          </p>
        )}
      </div>
      {placedList.length > 0 && (
        <div data-testid="clues-placed" className={styles.group}>
          <h3 className={styles.groupHead}>
            <button
              type="button"
              className={styles.groupToggle}
              data-testid="clues-placed-toggle"
              aria-expanded={!placedCollapsed}
              aria-controls="clues-placed-list"
              onClick={toggleCollapsed}
            >
              <span className={styles.chevron} aria-hidden="true">
                ▾
              </span>
              <span>Placed</span>
              <span className={styles.groupCount}>({placedList.length})</span>
            </button>
          </h3>
          <ol
            className={styles.list}
            id="clues-placed-list"
            hidden={placedCollapsed}
            data-testid="clues-placed-list"
          >
            {placedList.map(({ p, i }) => renderCard(p, i))}
          </ol>
        </div>
      )}
    </section>
  );
}
