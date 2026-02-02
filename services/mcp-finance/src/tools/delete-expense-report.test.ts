/**
 * Delete Expense Report Tool Tests - MCP-Finance (v1.5)
 */

import { deleteExpenseReport, executeDeleteExpenseReport } from './delete-expense-report';
import { createMockUserContext, createMockDbResult } from '../test-utils';
import { isSuccessResponse, isErrorResponse, isPendingConfirmationResponse } from '../types/response';

jest.mock('../database/connection', () => ({ queryWithRLS: jest.fn() }));
jest.mock('../utils/redis', () => ({ storePendingConfirmation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('uuid', () => ({ v4: () => 'test-confirmation-id' }));

import { queryWithRLS } from '../database/connection';

const mockQueryWithRLS = queryWithRLS as jest.MockedFunction<typeof queryWithRLS>;

describe('deleteExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });
  const readUserContext = createMockUserContext({ roles: ['finance-read'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should reject users without finance-write role', async () => {
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      readUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('INSUFFICIENT_PERMISSIONS');
  });

  it('should return error when expense not found', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('EXPENSE_REPORT_NOT_FOUND');
  });

  it('should reject deletion of APPROVED expenses', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'APPROVED',
      category: 'TRAVEL',
      description: 'Flight',
      amount: 500,
    }]));
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.code).toBe('CANNOT_DELETE_EXPENSE');
  });

  it('should reject deletion of REIMBURSED expenses', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'REIMBURSED',
      category: 'TRAVEL',
      description: 'Flight',
      amount: 500,
    }]));
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
    if (isErrorResponse(result)) expect(result.suggestedAction).toContain('audit purposes');
  });

  it('should return pending_confirmation for PENDING expenses', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'PENDING',
      category: 'TRAVEL',
      description: 'Flight to NYC',
      amount: 500,
      expense_date: '2025-01-15',
    }]));
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
    if (isPendingConfirmationResponse(result)) {
      expect(result.action).toBe('delete_expense_report');
      expect(result.message).toContain('cannot be undone');
    }
  });

  it('should return pending_confirmation for REJECTED expenses', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'REJECTED',
      category: 'TRAVEL',
      description: 'Flight to NYC',
      amount: 500,
      expense_date: '2025-01-15',
    }]));
    const result = await deleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isPendingConfirmationResponse(result)).toBe(true);
  });
});

describe('executeDeleteExpenseReport', () => {
  const writeUserContext = createMockUserContext({ roles: ['finance-write'] });

  beforeEach(() => { jest.clearAllMocks(); });

  it('should delete expense and return success', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      category: 'TRAVEL',
      description: 'Flight to NYC',
      amount: 500,
    }]));
    const result = await executeDeleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isSuccessResponse(result)).toBe(true);
    if (isSuccessResponse(result)) {
      const data = result.data as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toContain('deleted');
    }
  });

  it('should return error when expense no longer deletable', async () => {
    mockQueryWithRLS.mockResolvedValue(createMockDbResult([]));
    const result = await executeDeleteExpenseReport(
      { expenseId: '550e8400-e29b-41d4-a716-446655440000' },
      writeUserContext
    );
    expect(isErrorResponse(result)).toBe(true);
  });
});
