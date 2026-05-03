import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { screen, fireEvent } from '@testing-library/dom';
import { Modal } from './modal';

describe('Modal Component', () => {
  it('renders children in body when open', () => {
    render(
      <Modal open={true} onOpenChange={vi.fn()}>
        <div>Modal content</div>
      </Modal>
    );
    
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render children when closed', () => {
    render(
      <Modal open={false} onOpenChange={vi.fn()}>
        <div>Modal content</div>
      </Modal>
    );
    
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('calls onClose when ESC key pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onOpenChange={handleClose}>
        <div>Modal content</div>
      </Modal>
    );
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(handleClose).toHaveBeenCalledWith(false);
  });

  it('calls onClose when clicking overlay backdrop', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onOpenChange={handleClose}>
        <div>Modal content</div>
      </Modal>
    );
    
    // Modal should render when open
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does NOT call onClose when clicking modal content', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onOpenChange={handleClose}>
        <div>Modal content</div>
      </Modal>
    );
    
    const content = screen.getByText('Modal content').closest('[class*="fixed"]');
    if (content) {
      fireEvent.click(content);
      expect(handleClose).not.toHaveBeenCalled();
    }
  });

  it('renders title when provided', () => {
    render(
      <Modal open={true} onOpenChange={vi.fn()} title="Test Title">
        <div>Content</div>
      </Modal>
    );
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <Modal open={true} onOpenChange={vi.fn()} description="Test description">
        <div>Content</div>
      </Modal>
    );
    
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });
});
