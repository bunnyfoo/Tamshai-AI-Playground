/**
 * Delete Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Deletes an expense. Only PENDING or REJECTED expenses can be deleted.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING or REJECTED expenses can be deleted)
 * - Permanent deletion with confirmation
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { queryWithRLS, UserContext } from '../database/connection';
import {
  MCPToolResponse,
  createPendingConfirmationResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../types/response';
import {
  handleExpenseReportNotFound,
  handleInsufficientPermissions,
  handleDatabaseError,
  withErrorHandling,
} from '../utils/error-handler';
import { storePendingConfirmation } from '../utils/redis';

/**
 * Input schema for delete_expense_report tool
 */
export const DeleteExpenseReportInputSchema = z.object({
  expenseId: z.string().uuid('Expense ID must be a valid UUID'),
  reason: z.string().max(500).optional(),
});

export type DeleteExpenseReportInput = z.infer<typeof DeleteExpenseReportInputSchema>;

/**
 * Check if user has permission to delete expenses
 */
function hasDeletePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Delete expense report tool - Returns pending_confirmation for user approval
 */
export async function deleteExpenseReport(
  input: DeleteExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('delete_expense_report', async () => {
    // 1. Check permissions
    if (!hasDeletePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { expenseId, reason } = DeleteExpenseReportInputSchema.parse(input);

    try {
      // 2. Verify expense exists and get details
      const expenseResult = await queryWithRLS(
        userContext,
        `
        SELECT
          e.id,
          e.employee_id,
          e.department_id,
          e.expense_date,
          e.category,
          e.description,
          e.amount,
          e.status
        FROM finance.expenses e
        WHERE e.id = $1
        `,
        [expenseId]
      );

      if (expenseResult.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const expense = expenseResult.rows[0];

      // 3. Check if expense can be deleted (only PENDING or REJECTED)
      if (expense.status !== 'PENDING' && expense.status !== 'REJECTED') {
        const suggestedAction = expense.status === 'APPROVED'
          ? 'Approved expenses cannot be deleted. They must be reimbursed or archived.'
          : expense.status === 'REIMBURSED'
            ? 'Reimbursed expenses cannot be deleted. They are kept for audit purposes.'
            : 'Only PENDING or REJECTED expenses can be deleted.';

        return createErrorResponse(
          'CANNOT_DELETE_EXPENSE',
          `Cannot delete expense "${expenseId}" because it is in "${expense.status}" status`,
          suggestedAction,
          { expenseId, currentStatus: expense.status, allowedStatuses: ['PENDING', 'REJECTED'] }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'delete_expense_report',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        expenseId: expense.id,
        employeeId: expense.employee_id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        status: expense.status,
        reason: reason || 'No reason provided',
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `🗑️ **Delete Expense?**

**Expense ID:** ${expenseId}
**Category:** ${expense.category}
**Description:** ${expense.description}
**Amount:** $${Number(expense.amount).toLocaleString()}
**Date:** ${expense.expense_date}
**Current Status:** ${expense.status}
${reason ? `**Reason:** ${reason}` : ''}

⚠️ This action will permanently delete this expense and cannot be undone.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'delete_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed deletion (called by Gateway after user approval)
 */
export async function executeDeleteExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_delete_expense_report', async () => {
    const expenseId = confirmationData.expenseId as string;

    try {
      // Delete the expense (only if PENDING or REJECTED)
      const result = await queryWithRLS(
        userContext,
        `
        DELETE FROM finance.expenses
        WHERE id = $1
          AND status IN ('PENDING', 'REJECTED')
        RETURNING id, category, description, amount
        `,
        [expenseId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const deleted = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense for ${deleted.description} ($${Number(deleted.amount).toLocaleString()}) has been deleted`,
        expenseId: deleted.id,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_delete_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
