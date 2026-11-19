import { describe, expect, it } from 'vitest';
import { SHEET_DISMISS_PX, shouldDismissSheet } from '../../src/ui/sheetGesture';

describe('shouldDismissSheet', () => {
  it('needs a long enough downward drag', () => {
    expect(shouldDismissSheet(0)).toBe(false);
    expect(shouldDismissSheet(SHEET_DISMISS_PX - 1)).toBe(false);
    expect(shouldDismissSheet(SHEET_DISMISS_PX)).toBe(true);
  });
  it('ignores upward drags', () => {
    expect(shouldDismissSheet(-200)).toBe(false);
  });
});
