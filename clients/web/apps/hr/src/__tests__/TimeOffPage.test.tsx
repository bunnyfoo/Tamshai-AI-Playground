/**
 * TimeOffPage Tests
 *
 * Tests for the Time-Off Management page including:
 * - Balance display
 * - Request form modal
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import TimeOffPage from '../pages/TimeOffPage';
import type { TimeOffBalance } from '../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock data
const mockBalances: TimeOffBalance[] = [
  {
    balance_id: 'bal-001',
    employee_id: 'emp-001',
    type_id: 'type-pto',
    type_name: 'Paid Time Off',
    type_code: 'PTO',
    year: 2026,
    annual_entitlement: 20,
    carryover: 2,
    used: 5,
    pending: 2,
    available: 15,
  },
  {
    balance_id: 'bal-002',
    employee_id: 'emp-001',
    type_id: 'type-sick',
    type_name: 'Sick Leave',
    type_code: 'SICK',
    year: 2026,
    annual_entitlement: 10,
    carryover: 0,
    used: 2,
    pending: 0,
    available: 8,
  },
];

describe('TimeOffPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Time Off')).toBeInTheDocument();
    });

    test('displays Request Time Off button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Request Time Off')).toBeInTheDocument();
    });
  });

  describe('Balance Display', () => {
    test('displays time-off type names when data loads', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Paid Time Off')).toBeInTheDocument();
      });
    });

    test('shows total available days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Total Available')).toBeInTheDocument();
      });
    });
  });

  describe('Tabs', () => {
    test('displays My Balances tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      expect(screen.getByText('My Balances')).toBeInTheDocument();
    });

    test('displays My Requests tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      expect(screen.getByText('My Requests')).toBeInTheDocument();
    });
  });

  describe('Request Form Modal', () => {
    test('opens request form when button clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockBalances }),
      });

      render(<TimeOffPage />, { wrapper: createWrapper() });

      const requestButton = screen.getByText('Request Time Off');
      fireEvent.click(requestButton);

      await waitFor(() => {
        expect(screen.getByText('Time Off Type')).toBeInTheDocument();
      });
    });
  });
});
