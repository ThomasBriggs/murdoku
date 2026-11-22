import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as register from '../../src/pwa/register';
import { UpdateBanner } from '../../src/ui/UpdateBanner';

beforeEach(() => register.resetPwaForTests());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UpdateBanner', () => {
  it('is hidden until a new version is waiting', () => {
    render(<UpdateBanner />);
    expect(screen.queryByTestId('update-banner')).toBeNull();
    act(() => register.useUpdateStore.setState({ needRefresh: true }));
    expect(screen.getByTestId('update-banner')).toHaveAttribute('role', 'status');
  });

  it('Reload applies the update', () => {
    const apply = vi.spyOn(register, 'applyUpdate').mockResolvedValue();
    register.useUpdateStore.setState({ needRefresh: true });
    render(<UpdateBanner />);
    fireEvent.click(screen.getByTestId('update-reload'));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('Later hides it', () => {
    register.useUpdateStore.setState({ needRefresh: true });
    render(<UpdateBanner />);
    fireEvent.click(screen.getByTestId('update-dismiss'));
    expect(screen.queryByTestId('update-banner')).toBeNull();
  });
});
