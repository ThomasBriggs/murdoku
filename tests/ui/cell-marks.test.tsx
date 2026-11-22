import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CellMarks } from '../../src/ui/CellMarks';

afterEach(cleanup);

it('draws a candidate initial in its person colour via --tc', () => {
  const person = { id: 3, name: 'Ada', initial: 'A', color: '#4363d8', isVictim: false };
  render(
    <CellMarks
      r={1}
      c={2}
      candidates={[{ person, slot: 4, state: 'yes' }]}
      tentative={[]}
      onPromote={() => {}}
    />,
  );
  const el = screen.getByTestId('cand-1-2-3');
  expect(el.style.getPropertyValue('--tc')).toBe('#4363d8');
  expect(el.style.gridRow).toBe('2');
});
