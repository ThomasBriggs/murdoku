import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scratchpad } from '../../src/ui/Scratchpad';

const KEY = 'murdoku.scratchpad.layout';

function Harness({
  initial = '',
  startOpen = false,
  onCommit,
}: {
  initial?: string;
  startOpen?: boolean;
  onCommit: (t: string) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [value, setValue] = useState(initial);
  return (
    <Scratchpad
      value={value}
      open={open}
      onToggle={setOpen}
      onCommit={(t) => {
        setValue(t);
        onCommit(t);
      }}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

const toggle = () => screen.getByTestId('scratchpad-toggle');

describe('Scratchpad', () => {
  it('starts as a minimised button and opens the panel on click', () => {
    render(<Harness onCommit={() => {}} />);
    expect(screen.queryByTestId('scratchpad-panel')).toBeNull();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle());
    expect(screen.getByTestId('scratchpad-panel')).toBeInTheDocument();
    expect(screen.getByTestId('scratchpad-text')).toHaveFocus();
  });

  it('Escape minimises and returns focus to the button', () => {
    render(<Harness onCommit={() => {}} />);
    fireEvent.click(toggle());
    fireEvent.keyDown(screen.getByTestId('scratchpad-text'), { key: 'Escape' });
    expect(screen.queryByTestId('scratchpad-panel')).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it('the minimise button closes the panel and returns focus', () => {
    render(<Harness startOpen onCommit={() => {}} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle());
    expect(screen.queryByTestId('scratchpad-panel')).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it('commits the text on blur through onCommit', () => {
    const onCommit = vi.fn();
    render(<Harness startOpen onCommit={onCommit} />);
    const ta = screen.getByTestId('scratchpad-text');
    fireEvent.change(ta, { target: { value: 'If C then F' } });
    expect(onCommit).not.toHaveBeenCalled(); // still debouncing
    fireEvent.blur(ta);
    expect(onCommit).toHaveBeenCalledWith('If C then F');
  });

  it('commits after a pause and on minimise', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<Harness startOpen onCommit={onCommit} />);
    fireEvent.change(screen.getByTestId('scratchpad-text'), { target: { value: 'abc' } });
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(onCommit).toHaveBeenLastCalledWith('abc');
    fireEvent.change(screen.getByTestId('scratchpad-text'), { target: { value: 'abcd' } });
    fireEvent.click(toggle());
    expect(onCommit).toHaveBeenLastCalledWith('abcd');
  });

  it('shows the has-text indicator dot only when there is text', () => {
    const { unmount } = render(<Harness onCommit={() => {}} />);
    expect(toggle()).not.toHaveAttribute('data-has-text');
    unmount();
    render(<Harness initial="notes" onCommit={() => {}} />);
    expect(toggle()).toHaveAttribute('data-has-text', 'true');
  });

  it('follows a changed stored value (undo, what-if note)', () => {
    const { rerender } = render(
      <Scratchpad value="one" open onToggle={() => {}} onCommit={() => {}} />,
    );
    expect(screen.getByTestId('scratchpad-text')).toHaveValue('one');
    rerender(<Scratchpad value="two" open onToggle={() => {}} onCommit={() => {}} />);
    expect(screen.getByTestId('scratchpad-text')).toHaveValue('two');
  });

  it('remembers the open state in localStorage', () => {
    render(<Harness onCommit={() => {}} />);
    fireEvent.click(toggle());
    expect(JSON.parse(window.localStorage.getItem(KEY)!).open).toBe(true);
    fireEvent.click(toggle());
    expect(JSON.parse(window.localStorage.getItem(KEY)!).open).toBe(false);
  });

  it('drag by the header persists the panel position', () => {
    render(<Harness startOpen onCommit={() => {}} />);
    const head = screen.getByTestId('scratchpad-drag');
    const panel = screen.getByTestId('scratchpad-panel');
    const left = parseFloat(panel.style.left);
    fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(head, { pointerId: 1, clientX: 140, clientY: 90 });
    fireEvent.pointerUp(head, { pointerId: 1, clientX: 140, clientY: 90 });
    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved.pos).toBeTruthy();
    expect(saved.pos.x).toBeCloseTo(left + 40, 0);
  });

  it('resize by the handle persists the size', () => {
    render(<Harness startOpen onCommit={() => {}} />);
    const grip = screen.getByTestId('scratchpad-resize');
    const w = parseFloat(screen.getByTestId('scratchpad-panel').style.width);
    fireEvent.pointerDown(grip, { button: 0, pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(grip, { pointerId: 2, clientX: 330, clientY: 320 });
    fireEvent.pointerUp(grip, { pointerId: 2, clientX: 330, clientY: 320 });
    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved.size.w).toBeCloseTo(w + 30, 0);
  });

  it('restores a saved layout (and the open state) on mount', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        open: true,
        fab: { x: 100, y: 100 },
        size: { w: 300, h: 200 },
        pos: { x: 120, y: 130 },
        corner: 'tl',
      }),
    );
    render(<Scratchpad value="" open onToggle={() => {}} onCommit={() => {}} />);
    const panel = screen.getByTestId('scratchpad-panel');
    expect(panel.style.left).toBe('120px');
    expect(panel.style.top).toBe('130px');
    expect(panel.style.width).toBe('300px');
  });

  it('keeps working when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<Harness onCommit={() => {}} />);
    fireEvent.click(toggle());
    expect(screen.getByTestId('scratchpad-panel')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(screen.queryByTestId('scratchpad-panel')).toBeNull();
  });
});
