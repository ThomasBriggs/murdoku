import { NOTE_MAX } from '../state/annotations';

/**
 * Short single-line note. Uncontrolled: the draft lives in the input and is
 * committed on Enter or blur, so typing makes one undo step, not one per key.
 * `key={value}` remounts it when undo/redo changes the stored text.
 */
export function NoteInput({
  value,
  label,
  testId,
  className,
  onCommit,
  autoFocus,
  maxLength = NOTE_MAX,
  placeholder,
  onDone,
}: {
  value: string;
  label: string;
  testId: string;
  className?: string;
  onCommit(text: string): void;
  autoFocus?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** Called after the field loses focus (whether or not the text changed). */
  onDone?(): void;
}) {
  return (
    <input
      key={value}
      type="text"
      className={className}
      defaultValue={value}
      maxLength={maxLength}
      aria-label={label}
      title={value || label}
      data-testid={testId}
      data-filled={value ? 'true' : undefined}
      autoFocus={autoFocus}
      placeholder={placeholder}
      autoComplete="off"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        if (e.currentTarget.value.trim() !== value) onCommit(e.currentTarget.value);
        onDone?.();
      }}
    />
  );
}
