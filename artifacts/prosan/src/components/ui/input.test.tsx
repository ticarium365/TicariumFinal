import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { Input } from './input';

describe('Input Component', () => {
  it('shows error message when error prop provided as string', () => {
    render(<Input error="This field is required" />);
    
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('Input has red border-color class when error provided', () => {
    render(<Input error={true} />);
    
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-[var(--color-semantic-danger)]');
  });

  it('calls onChange with correct value', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} />);
    
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test value' } });
    
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ value: 'test value' })
    }));
  });

  it('does not show error message when error is false', () => {
    render(<Input error={false} />);
    
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { container: containerSm } = render(<Input inputSize="sm" />);
    const { container: containerMd } = render(<Input inputSize="md" />);
    
    const inputSm = containerSm.querySelector('input');
    const inputMd = containerMd.querySelector('input');
    
    expect(inputSm).toHaveClass('h-8');
    expect(inputMd).toHaveClass('h-9');
  });
});
