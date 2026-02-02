/**
 * DashboardPage Tests - RED Phase
 *
 * Tests for the Payroll Dashboard including:
 * - Key metrics display (Next Pay Date, Total Payroll, YTD)
 * - Charts (Monthly Payroll, Tax Breakdown)
 * - Quick Actions
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import type { PayrollDashboardMetrics } from '../types';

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
const mockMetrics: PayrollDashboardMetrics = {
  next_pay_date: '2026-02-14',
  days_until_payday: 12,
  current_period_gross: 425000,
  employees_count: 54,
  ytd_payroll: 850000,
  ytd_payroll_change: 5.2,
};

describe('DashboardPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Page Rendering', () => {
    test('displays page title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Payroll Dashboard')).toBeInTheDocument();
    });

    test('displays loading state while fetching', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<DashboardPage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading payroll data...')).toBeInTheDocument();
    });
  });

  describe('Key Metrics Cards', () => {
    test('displays Next Pay Date metric', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Next Pay Date')).toBeInTheDocument();
      });
    });

    test('displays days until payday countdown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('12 days')).toBeInTheDocument();
      });
    });

    test('displays Total Payroll metric', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Total Payroll')).toBeInTheDocument();
      });
    });

    test('displays gross payroll amount formatted as currency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('$425,000')).toBeInTheDocument();
      });
    });

    test('displays Employees Paid metric', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Employees Paid')).toBeInTheDocument();
        expect(screen.getByText('54')).toBeInTheDocument();
      });
    });

    test('displays YTD Payroll metric', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('YTD Payroll')).toBeInTheDocument();
      });
    });

    test('displays YTD payroll trend indicator', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('+5.2%')).toBeInTheDocument();
      });
    });
  });

  describe('Quick Actions', () => {
    test('displays Run Payroll button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run payroll/i })).toBeInTheDocument();
      });
    });

    test('displays View Pending Items button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /pending items/i })).toBeInTheDocument();
      });
    });

    test('displays Generate Reports button', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /generate reports/i })).toBeInTheDocument();
      });
    });
  });

  describe('Charts', () => {
    test('displays Payroll by Month chart section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Payroll by Month')).toBeInTheDocument();
      });
    });

    test('displays Tax Breakdown chart section', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockMetrics }),
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Tax Breakdown')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('shows error message on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      render(<DashboardPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/error loading payroll data/i)).toBeInTheDocument();
      });
    });
  });
});
