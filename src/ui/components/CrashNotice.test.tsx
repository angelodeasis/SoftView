import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CrashNotice } from './CrashNotice';

describe('CrashNotice', () => {
  it('shows a soft-language message as an alert', () => {
    render(<CrashNotice onReset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/unexpected problem/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/never uploaded/i);
  });

  it('calls onReset when Back to start is activated', () => {
    const onReset = vi.fn();
    render(<CrashNotice onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: /back to start/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
