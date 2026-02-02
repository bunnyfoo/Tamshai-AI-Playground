/**
 * Reject Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Rejects a pending expense, changing its status from PENDING to REJECTED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING expenses can be rejected)
 * - Rejection reason required
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
 * Input schema for reject_expense_report tool
 */
export const RejectExpenseReportInputSchema = z.object({
  expenseId: z.string().uuid('Expense ID must be a valid UUID'),
  rejectionReason: z.string().min(10, 'Rejection reason must be at least 10 characters').max(500),
});

export type RejectExpenseReportInput = z.infer<typeof RejectExpenseReportInputSchema>;

/**
 * Check if user has permission to reject expenses
 */
function hasRejectPermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Reject expense report tool - Returns pending_confirmation for user approval
 */
export async function rejectExpenseReport(
  input: RejectExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('reject_expense_report', async () => {
    // 1. Check permissions
    if (!hasRejectPermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { expenseId, rejectionReason } = RejectExpenseReportInputSchema.parse(input);

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

      // 3. Check if expense is in PENDING status
      if (expense.status !== 'PENDING') {
        const suggestedAction = expense.status === 'APPROVED'
          ? 'This expense has already been approved and cannot be rejected.'
          : expense.status === 'REIMBURSED'
            ? 'This expense has been reimbursed and cannot be rejected.'
            : expense.status === 'REJECTED'
              ? 'This expense has already been rejected.'
              : 'Only PENDING expenses can be rejected.';

        return createErrorResponse(
          'INVALID_EXPENSE_STATUS',
          `Cannot reject expense "${expenseId}" because it is in "${expense.status}" status`,
          suggestedAction,
          { expenseId, currentStatus: expense.status, requiredStatus: 'PENDING' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'reject_expense_report',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        expenseId: expense.id,
        employeeId: expense.employee_id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        status: expense.status,
        rejectionReason,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `❌ **Reject Expense?**

**Expense ID:** ${expenseId}
**Category:** ${expense.category}
**Description:** ${expense.description}
**Amount:** $${Number(expense.amount).toLocaleString()}
**Date:** ${expense.expense_date}
**Rejection Reason:** ${rejectionReason}

This will change the expense status from PENDING to REJECTED.
The employee will be notified and may resubmit with corrections.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'reject_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed rejection (called by Gateway after user approval)
 */
export async function executeRejectExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_reject_expense_report', async () => {
    const expenseId = confirmationData.expenseId as string;
    const rejectionReason = confirmationData.rejectionReason as string;

    try {
      // Update expense status to REJECTED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expenses
        SET status = 'REJECTED',
            updated_at = NOW()
        WHERE id = $1
          AND status = 'PENDING'
        RETURNING id, category, description, amount
        `,
        [expenseId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const rejected = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense for ${rejected.description} ($${Number(rejected.amount).toLocaleString()}) has been rejected`,
        expenseId: rejected.id,
        newStatus: 'REJECTED',
        rejectionReason,
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_reject_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
