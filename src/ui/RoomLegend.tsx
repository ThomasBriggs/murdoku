import { useState, type CSSProperties } from 'react';
import type { Room } from '../engine/types';
import { NoteInput } from './NoteInput';
import styles from './RoomLegend.module.css';
import type { RoomColor } from './roomColors';
import type { Highlight } from './types';

/**
 * Colour swatch + full name per room. Hovering or focusing one highlights the
 * room's cells, double-clicking selects the room, and the note button edits the
 * room's note (SPEC §6.5.3).
 */
export function RoomLegend({
  rooms,
  colors,
  notes,
  showNotes,
  onHighlight,
  onSelectRoom,
  onNote,
}: {
  rooms: readonly Room[];
  colors: Map<number, RoomColor>;
  notes: Record<number, string>;
  showNotes: boolean;
  onHighlight(h: Highlight | null): void;
  onSelectRoom(room: number): void;
  onNote(room: number, text: string): void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const editedRoom = rooms.find((r) => r.id === editing);
  return (
    <div className={styles.wrap}>
      <ul className={styles.legend} aria-label="Rooms" data-testid="room-legend">
        {rooms.map((room) => {
          const h: Highlight = { kind: 'room', id: room.id };
          const color = colors.get(room.id);
          const note = notes[room.id] ?? '';
          return (
            <li
              key={room.id}
              className={styles.item}
              tabIndex={0}
              title="Double-click to select the whole room"
              data-testid={`legend-room-${room.id}`}
              onMouseEnter={() => onHighlight(h)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(h)}
              onBlur={() => onHighlight(null)}
              onDoubleClick={() => onSelectRoom(room.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) onSelectRoom(room.id);
              }}
            >
              <span
                className={styles.swatch}
                style={{ '--room-l': color?.light, '--room-d': color?.dark } as CSSProperties}
              />
              {room.name}
              {showNotes && (
                <button
                  type="button"
                  className={styles.noteBtn}
                  data-testid={`room-note-btn-${room.id}`}
                  data-has-note={note ? 'true' : undefined}
                  aria-label={`Note for ${room.name}`}
                  aria-expanded={editing === room.id}
                  title={note ? `${room.name}: ${note}` : `Add a note for ${room.name}`}
                  onClick={() => setEditing(editing === room.id ? null : room.id)}
                >
                  {note ? <span data-testid={`room-note-${room.id}`}>{note}</span> : '✎'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {showNotes && editedRoom && (
        <div className={styles.editor} data-testid="room-note-editor">
          <label>
            Note for {editedRoom.name}{' '}
            <NoteInput
              key={editedRoom.id}
              autoFocus
              className={styles.input}
              value={notes[editedRoom.id] ?? ''}
              label={`Note for ${editedRoom.name}`}
              testId={`room-note-input-${editedRoom.id}`}
              onCommit={(t) => {
                onNote(editedRoom.id, t);
                setEditing(null);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
