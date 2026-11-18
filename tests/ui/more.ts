import { fireEvent, screen } from '@testing-library/react';

/** Click a secondary action, opening the desktop overflow menu first when it is closed. */
export function clickMore(id: string) {
  if (!screen.queryByTestId('overflow-menu'))
    fireEvent.click(screen.getByTestId('overflow-button'));
  fireEvent.click(screen.getByTestId(id));
}
