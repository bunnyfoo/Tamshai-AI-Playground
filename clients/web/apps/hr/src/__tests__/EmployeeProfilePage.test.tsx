/**
 * EmployeeProfilePage Tests
 *
 * Tests for the Employee Profile page including:
 * - Profile header display
 * - Tabbed interface
 * - Employment details
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import EmployeeProfilePage from '../pages/EmployeeProfilePage';
import type { Employee } from '../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ employeeId: 'emp-001' }),
  };
});

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={children} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

// Mock data
const mockEmployee: Employee = {
  id: 'emp-001',
  employee_id: 'emp-001',
  first_name: 'Alice',
  last_name: 'Chen',
  work_email: 'alice.chen@tamshai.com',
  department: 'Engineering',
  job_title: 'Senior Software Engineer',
  employment_status: 'active',
  salary: 150000,
  manager_id: 'emp-002',
  hire_date: '2023-03-15',
  profile_photo_url: null,
  phone: '+1 555-123-4567',
  location: 'San Francisco',
  state: 'CA',
};

describe('EmployeeProfilePage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Profile Header', () => {
    test('displays employee full name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Alice Chen')).toBeInTheDocument();
      });
    });

    test('displays job title', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Senior Software Engineer')).toBeInTheDocument();
      });
    });

    test('displays department badge', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Engineering')).toBeInTheDocument();
      });
    });

    test('displays employment status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('active')).toBeInTheDocument();
      });
    });
  });

  describe('Tabbed Interface', () => {
    test('displays Overview tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('overview')).toBeInTheDocument();
      });
    });

    test('displays Employment tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('employment')).toBeInTheDocument();
      });
    });

    test('displays Time Off tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Time Off')).toBeInTheDocument();
      });
    });

    test('displays Documents tab', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('documents')).toBeInTheDocument();
      });
    });
  });

  describe('Loading and Error States', () => {
    test('shows loading state', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      expect(screen.getByText('Loading employee profile...')).toBeInTheDocument();
    });

    test('shows error state when employee not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: null }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Error loading employee')).toBeInTheDocument();
      });
    });
  });

  describe('Employee Info Display', () => {
    test('displays employee email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('alice.chen@tamshai.com')).toBeInTheDocument();
      });
    });

    test('displays location', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: mockEmployee }),
      });

      render(<EmployeeProfilePage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });
    });
  });
});
