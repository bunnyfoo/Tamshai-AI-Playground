/**
 * Reimburse Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Marks an approved expense as reimbursed, changing status from APPROVED to REIMBURSED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only APPROVED expenses can be reimbursed)
 * - Payment tracking
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
 * Input schema for reimburse_expense_report tool
 */
export const ReimburseExpenseReportInputSchema = z.object({
  expenseId: z.string().uuid('Expense ID must be a valid UUID'),
  paymentReference: z.string().max(100).optional(),
  paymentNotes: z.string().max(500).optional(),
});

export type ReimburseExpenseReportInput = z.infer<typeof ReimburseExpenseReportInputSchema>;

/**
 * Check if user has permission to mark expenses as reimbursed
 */
function hasReimbursePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Reimburse expense report tool - Returns pending_confirmation for user approval
 */
export async function reimburseExpenseReport(
  input: ReimburseExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('reimburse_expense_report', async () => {
    // 1. Check permissions
    if (!hasReimbursePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { expenseId, paymentReference, paymentNotes } = ReimburseExpenseReportInputSchema.parse(input);

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
          e.status,
          e.approved_by,
          e.approved_at
        FROM finance.expenses e
        WHERE e.id = $1
        `,
        [expenseId]
      );

      if (expenseResult.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const expense = expenseResult.rows[0];

      // 3. Check if expense is in APPROVED status
      if (expense.status !== 'APPROVED') {
        const suggestedAction = expense.status === 'PENDING'
          ? 'This expense must be approved first. Use approve_expense_report.'
          : expense.status === 'REJECTED'
            ? 'This expense was rejected and cannot be reimbursed.'
            : expense.status === 'REIMBURSED'
              ? 'This expense has already been reimbursed.'
              : 'Only APPROVED expenses can be marked as reimbursed.';

        return createErrorResponse(
          'INVALID_EXPENSE_STATUS',
          `Cannot reimburse expense "${expenseId}" because it is in "${expense.status}" status`,
          suggestedAction,
          { expenseId, currentStatus: expense.status, requiredStatus: 'APPROVED' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'reimburse_expense_report',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        expenseId: expense.id,
        employeeId: expense.employee_id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        status: expense.status,
        paymentReference: paymentReference || null,
        paymentNotes: paymentNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `💰 **Mark Expense as Reimbursed?**

**Expense ID:** ${expenseId}
**Category:** ${expense.category}
**Description:** ${expense.description}
**Amount:** $${Number(expense.amount).toLocaleString()}
**Date:** ${expense.expense_date}
**Approved At:** ${expense.approved_at || 'N/A'}
${paymentReference ? `**Payment Reference:** ${paymentReference}` : ''}
${paymentNotes ? `**Notes:** ${paymentNotes}` : ''}

This will change the expense status from APPROVED to REIMBURSED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'reimburse_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed reimbursement (called by Gateway after user approval)
 */
export async function executeReimburseExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_reimburse_expense_report', async () => {
    const expenseId = confirmationData.expenseId as string;

    try {
      // Update expense status to REIMBURSED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expenses
        SET status = 'REIMBURSED',
            updated_at = NOW()
        WHERE id = $1
          AND status = 'APPROVED'
        RETURNING id, category, description, amount
        `,
        [expenseId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const reimbursed = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense for ${reimbursed.description} ($${Number(reimbursed.amount).toLocaleString()}) has been marked as reimbursed`,
        expenseId: reimbursed.id,
        newStatus: 'REIMBURSED',
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_reimburse_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
