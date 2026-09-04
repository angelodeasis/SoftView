import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;
function Bomb() {
  if (shouldThrow) throw new Error('boom');
  return <p>safe</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <p>all good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders the fallback when a child throws during render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary fallback={() => <p>fallback shown</p>}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fallback shown')).toBeInTheDocument();
  });

  it('renders children again once reset is called after the failure clears', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    shouldThrow = true;
    render(
      <ErrorBoundary
        fallback={(reset) => (
          <button
            type="button"
            onClick={() => {
              shouldThrow = false;
              reset();
            }}
          >
            retry
          </button>
        )}
      >
        <Bomb />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('safe')).toBeInTheDocument();
  });
});
