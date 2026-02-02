/**
 * Tax App Test Setup
 *
 * Provides mocks for shared packages and test utilities.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock @tamshai/auth
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userContext: {
      userId: 'test-user-id',
      username: 'test.user',
      firstName: 'Test',
      lastName: 'User',
      email: 'test.user@tamshai.com',
      roles: ['tax-read', 'tax-write'],
    },
    getAccessToken: () => 'mock-access-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  canModifyTax: () => true,
  apiConfig: {
    mcpGatewayUrl: 'http://localhost:3100',
  },
}));

// Mock @tamshai/ui
vi.mock('@tamshai/ui', () => ({
  TruncationWarning: ({ message }: { message: string }) => (
    <div data-testid="truncation-warning">{message}</div>
  ),
  ApprovalCard: ({
    message,
    onComplete,
  }: {
    message: string;
    onComplete: (approved: boolean) => void;
  }) => (
    <div data-testid="approval-card">
      <p>{message}</p>
      <button onClick={() => onComplete(true)}>Approve</button>
      <button onClick={() => onComplete(false)}>Reject</button>
    </div>
  ),
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
  ErrorMessage: ({ message }: { message: string }) => (
    <div data-testid="error-message">{message}</div>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
  Modal: ({
    isOpen,
    onClose,
    title,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="modal" role="dialog">
        <h2>{title}</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  mockFetch.mockReset();
});
