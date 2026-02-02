/**
 * Approve Expense Report Tool (v1.5 with Human-in-the-Loop Confirmation)
 *
 * Approves a pending expense, changing its status from PENDING to APPROVED.
 * Uses human-in-the-loop confirmation (Section 5.6).
 *
 * Features:
 * - Permission check (finance-write or executive)
 * - Status validation (only PENDING expenses can be approved)
 * - Audit trail (approved_by, approved_at)
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
 * Input schema for approve_expense_report tool
 */
export const ApproveExpenseReportInputSchema = z.object({
  expenseId: z.string().uuid('Expense ID must be a valid UUID'),
  approverNotes: z.string().max(500).optional(),
});

export type ApproveExpenseReportInput = z.infer<typeof ApproveExpenseReportInputSchema>;

/**
 * Check if user has permission to approve expenses
 */
function hasApprovePermission(roles: string[]): boolean {
  return roles.includes('finance-write') || roles.includes('executive');
}

/**
 * Approve expense report tool - Returns pending_confirmation for user approval
 */
export async function approveExpenseReport(
  input: ApproveExpenseReportInput,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('approve_expense_report', async () => {
    // 1. Check permissions
    if (!hasApprovePermission(userContext.roles)) {
      return handleInsufficientPermissions('finance-write or executive', userContext.roles);
    }

    // Validate input
    const { expenseId, approverNotes } = ApproveExpenseReportInputSchema.parse(input);

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
          e.receipt_path
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
          ? 'This expense has already been approved. Use reimburse_expense_report to mark it as reimbursed.'
          : expense.status === 'REIMBURSED'
            ? 'This expense has already been reimbursed.'
            : 'Only PENDING expenses can be approved.';

        return createErrorResponse(
          'INVALID_EXPENSE_STATUS',
          `Cannot approve expense "${expenseId}" because it is in "${expense.status}" status`,
          suggestedAction,
          { expenseId, currentStatus: expense.status, requiredStatus: 'PENDING' }
        );
      }

      // 4. Generate confirmation ID and store in Redis
      const confirmationId = uuidv4();

      const confirmationData = {
        action: 'approve_expense_report',
        mcpServer: 'finance',
        userId: userContext.userId,
        timestamp: Date.now(),
        expenseId: expense.id,
        employeeId: expense.employee_id,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        status: expense.status,
        approverNotes: approverNotes || null,
      };

      await storePendingConfirmation(confirmationId, confirmationData, 300);

      // 5. Return pending_confirmation response
      const message = `✅ **Approve Expense?**

**Expense ID:** ${expenseId}
**Category:** ${expense.category}
**Description:** ${expense.description}
**Amount:** $${Number(expense.amount).toLocaleString()}
**Date:** ${expense.expense_date}
${expense.receipt_path ? `**Receipt:** Attached` : '**Receipt:** Not attached'}
${approverNotes ? `**Your Notes:** ${approverNotes}` : ''}

This will change the expense status from PENDING to APPROVED.`;

      return createPendingConfirmationResponse(
        confirmationId,
        message,
        confirmationData
      );
    } catch (error) {
      return handleDatabaseError(error as Error, 'approve_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}

/**
 * Execute the confirmed approval (called by Gateway after user approval)
 */
export async function executeApproveExpenseReport(
  confirmationData: Record<string, unknown>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  return withErrorHandling('execute_approve_expense_report', async () => {
    const expenseId = confirmationData.expenseId as string;

    try {
      const approverId = userContext.userId;

      // Update expense status to APPROVED
      const result = await queryWithRLS(
        userContext,
        `
        UPDATE finance.expenses
        SET status = 'APPROVED',
            approved_by = $2,
            approved_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND status = 'PENDING'
        RETURNING id, category, description, amount
        `,
        [expenseId, approverId]
      );

      if (result.rowCount === 0) {
        return handleExpenseReportNotFound(expenseId);
      }

      const approved = result.rows[0];

      return createSuccessResponse({
        success: true,
        message: `Expense for ${approved.description} ($${Number(approved.amount).toLocaleString()}) has been approved`,
        expenseId: approved.id,
        newStatus: 'APPROVED',
      });
    } catch (error) {
      return handleDatabaseError(error as Error, 'execute_approve_expense_report');
    }
  }) as Promise<MCPToolResponse>;
}
