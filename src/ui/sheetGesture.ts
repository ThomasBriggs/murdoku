/** Pure helper for the phone clues sheet's swipe-down-to-close gesture. */
export const SHEET_DISMISS_PX = 48;

/** True once a downward drag (positive dy, in px) is long enough to close the sheet. */
export function shouldDismissSheet(dy: number): boolean {
  return dy >= SHEET_DISMISS_PX;
}
