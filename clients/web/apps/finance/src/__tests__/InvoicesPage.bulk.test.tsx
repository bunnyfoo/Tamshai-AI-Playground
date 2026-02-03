/**
 * InvoicesPage Bulk Operations Tests - v1.5 Enterprise UX Hardening
 *
 * TDD tests for bulk invoice operations following Salesforce Lightning patterns.
 * These tests verify the DataTable integration and bulk action flows.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { InvoicesPage } from '../pages/InvoicesPage';
import type { Invoice } from '../types';

// Mock auth
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    userContext: { roles: ['finance-write'] },
    getAccessToken: () => 'mock-token',
  }),
  canModifyFinance: () => true,
  apiConfig: { mcpGatewayUrl: '' },
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test wrapper with providers
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

// Mock invoice data
const mockInvoices: Invoice[] = [
  {
    id: 'inv-001',
    invoice_number: 'INV-2026-0001',
    vendor_name: 'Cloud Services Inc',
    amount: 15000,
    currency: 'USD',
    invoice_date: '2026-01-02',
    due_date: '2026-01-15',
    paid_date: null,
    status: 'PENDING',
    department_code: 'ENG',
    description: 'Cloud hosting services',
    approved_by: null,
    approved_at: null,
    created_at: '2026-01-02T10:00:00Z',
  },
  {
    id: 'inv-002',
    invoice_number: 'INV-2026-0002',
    vendor_name: 'Office Supplies Co',
    amount: 2500,
    currency: 'USD',
    invoice_date: '2026-01-05',
    due_date: '2026-01-20',
    paid_date: null,
    status: 'PENDING',
    department_code: 'OPS',
    description: 'Office furniture',
    approved_by: null,
    approved_at: null,
    created_at: '2026-01-05T10:00:00Z',
  },
  {
    id: 'inv-003',
    invoice_number: 'INV-2026-0003',
    vendor_name: 'Marketing Agency',
    amount: 50000,
    currency: 'USD',
    invoice_date: '2026-01-01',
    due_date: '2026-01-31',
    paid_date: null,
    status: 'PENDING',
    department_code: 'MKT',
    description: 'Q1 Campaign',
    approved_by: null,
    approved_at: null,
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'inv-004',
    invoice_number: 'INV-2026-0004',
    vendor_name: 'Legal Firm LLP',
    amount: 10000,
    currency: 'USD',
    invoice_date: '2026-01-03',
    due_date: '2026-02-01',
    paid_date: null,
    status: 'APPROVED',
    department_code: 'LEG',
    description: 'Legal consultation',
    approved_by: 'Bob Martinez',
    approved_at: '2026-01-05T14:00:00Z',
    created_at: '2026-01-03T10:00:00Z',
  },
  {
    id: 'inv-005',
    invoice_number: 'INV-2026-0005',
    vendor_name: 'HR Consultants',
    amount: 5000,
    currency: 'USD',
    invoice_date: '2025-12-01',
    due_date: '2025-12-31',
    paid_date: '2025-12-28',
    status: 'PAID',
    department_code: 'HR',
    description: 'Training services',
    approved_by: 'Alice Chen',
    approved_at: '2025-12-15T10:00:00Z',
    created_at: '2025-12-01T10:00:00Z',
  },
];

describe('InvoicesPage Bulk Operations', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success', data: mockInvoices }),
    });
  });

  describe('Bulk Selection UI', () => {
    test('renders select-all checkbox in table header', async () => {
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('checkbox', { name: /select all/i })).toBeInTheDocument();
      });
    });

    test('renders row checkboxes for each invoice', async () => {
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        // Header row + 5 data rows
        expect(rows.length).toBeGreaterThan(1);
      });

      // Each data row should have a checkbox
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThanOrEqual(mockInvoices.length);
    });

    test('clicking row checkbox selects that row', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Find and click first row checkbox
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // First row checkbox (index 0 is header)

      // Row should be selected (aria-selected=true)
      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        expect(rows[1]).toHaveAttribute('aria-selected', 'true');
      });
    });

    test('clicking select-all checkbox selects all rows', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Click header checkbox
      const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i });
      await user.click(headerCheckbox);

      // All rows should be selected
      await waitFor(() => {
        const rows = screen.getAllByRole('row');
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i]).toHaveAttribute('aria-selected', 'true');
        }
      });
    });

    test('header checkbox shows indeterminate state when some rows selected', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select only first row
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Header checkbox should be indeterminate (we check via CSS or property)
      const headerCheckbox = screen.getByRole('checkbox', { name: /select all/i }) as HTMLInputElement;
      await waitFor(() => {
        expect(headerCheckbox.indeterminate).toBe(true);
      });
    });
  });

  describe('Bulk Action Toolbar', () => {
    test('toolbar hidden when no rows selected', async () => {
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Toolbar should not be visible
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    test('toolbar appears when rows are selected', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select first row
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Toolbar should appear
      await waitFor(() => {
        expect(screen.getByRole('toolbar')).toBeInTheDocument();
      });
    });

    test('toolbar shows selected count', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select two rows
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);

      // Should show "2 items selected"
      await waitFor(() => {
        expect(screen.getByText(/2.*items selected/i)).toBeInTheDocument();
      });
    });

    test('toolbar shows available bulk actions', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select first row (pending invoice)
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Should show approve and export actions
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
      });
    });

    test('clear button deselects all rows', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select first row
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Wait for toolbar
      await waitFor(() => {
        expect(screen.getByRole('toolbar')).toBeInTheDocument();
      });

      // Click clear
      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);

      // Toolbar should disappear
      await waitFor(() => {
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Bulk Approve Flow', () => {
    test('approve button triggers bulk approval API call', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select pending invoices
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // inv-001
      await user.click(checkboxes[2]); // inv-002

      // Mock approval API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending_confirmation',
          confirmationId: 'bulk-conf-001',
          message: 'Approve 2 invoices totaling $17,500.00?',
        }),
      });

      // Click bulk approve
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      });
      const approveButton = screen.getByRole('button', { name: /approve/i });
      await user.click(approveButton);

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByText(/approve 2 invoices/i)).toBeInTheDocument();
      });
    });

    test('bulk approval confirmation shows total amount', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select pending invoices
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]); // inv-001 ($15,000)
      await user.click(checkboxes[2]); // inv-002 ($2,500)
      await user.click(checkboxes[3]); // inv-003 ($50,000)

      // Mock approval response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'pending_confirmation',
          confirmationId: 'bulk-conf-002',
          message: 'Approve 3 invoices totaling $67,500.00?',
        }),
      });

      // Click bulk approve
      const approveButton = await screen.findByRole('button', { name: /approve/i });
      await user.click(approveButton);

      // Should show total amount
      await waitFor(() => {
        expect(screen.getByText(/\$67,500/i)).toBeInTheDocument();
      });
    });

    test('confirming bulk approval updates invoices', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select first invoice
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Mock confirmation flow
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'pending_confirmation',
            confirmationId: 'bulk-conf-003',
            message: 'Approve 1 invoice?',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: { approved: 1 },
          }),
        });

      // Click bulk approve
      const approveButton = await screen.findByRole('button', { name: /approve/i });
      await user.click(approveButton);

      // Wait for confirmation dialog
      await waitFor(() => {
        expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
      });

      // Confirm approval
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      await user.click(confirmButton);

      // Should clear selection and show success
      await waitFor(() => {
        expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Bulk Export Flow', () => {
    test('export button exports selected invoices', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select invoices
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);
      await user.click(checkboxes[2]);

      // Click export
      const exportButton = await screen.findByRole('button', { name: /export/i });
      await user.click(exportButton);

      // Export should be initiated (mock doesn't actually download)
      // In real implementation, this would trigger a file download
    });
  });

  describe('Accessibility', () => {
    test('table has proper aria-multiselectable attribute', async () => {
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      const table = screen.getByRole('grid');
      expect(table).toHaveAttribute('aria-multiselectable', 'true');
    });

    test('toolbar has proper role and label', async () => {
      const user = userEvent.setup();
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      // Select row to show toolbar
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      const toolbar = await screen.findByRole('toolbar');
      expect(toolbar).toHaveAttribute('aria-label');
    });

    test('row checkboxes have proper aria-label', async () => {
      render(<InvoicesPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      // Row checkboxes should have labels
      checkboxes.forEach((checkbox, i) => {
        if (i > 0) { // Skip header checkbox
          expect(checkbox).toHaveAttribute('aria-label');
        }
      });
    });
  });
});
