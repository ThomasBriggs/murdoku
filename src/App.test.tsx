import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createGameStore } from './state/store';
import { createEngineClient } from './worker/client';
import { createInProcessWorker } from './worker/inprocess';

afterEach(cleanup);

describe('App', () => {
  it('renders the title and main area', () => {
    const store = createGameStore({
      client: createEngineClient({ workerFactory: createInProcessWorker }),
    });
    render(<App store={store} />);
    expect(screen.getByTestId('app-title')).toHaveTextContent('Murdoku');
    expect(screen.getByTestId('app-main')).toBeInTheDocument();
  });

  it('starts a game from the ?seed= param', async () => {
    window.history.pushState({}, '', '/?seed=unit-seed&d=easy');
    const store = createGameStore({
      client: createEngineClient({ workerFactory: createInProcessWorker }),
    });
    render(<App store={store} />);
    await waitFor(() => expect(screen.getByTestId('puzzle-status')).toHaveTextContent('playing'));
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('unit-seed');
    window.history.pushState({}, '', '/');
  });
});
