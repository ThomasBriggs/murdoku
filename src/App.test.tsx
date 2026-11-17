import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the title and main area', () => {
    render(<App />);
    expect(screen.getByTestId('app-title')).toHaveTextContent('Murdoku');
    expect(screen.getByTestId('app-main')).toBeInTheDocument();
  });
});
