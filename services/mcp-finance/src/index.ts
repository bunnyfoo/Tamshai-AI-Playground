/**
 * MCP Finance Server (Architecture v1.4)
 *
 * Provides financial data access with:
 * - Row Level Security (RLS) enforcement
 * - LLM-friendly error responses (Section 7.4)
 * - Truncation warnings for large result sets (Section 5.3)
 * - Human-in-the-loop confirmations for write operations (Section 5.6)
 *
 * Port: 3102
 */

import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import winston from 'winston';
import { UserContext, checkConnection, closePool } from './database/connection';
import { getBudget, GetBudgetInputSchema } from './tools/get-budget';
import { listBudgets, ListBudgetsInputSchema } from './tools/list-budgets';
import { listInvoices, ListInvoicesInputSchema } from './tools/list-invoices';
import { getExpenseReport, GetExpenseReportInputSchema } from './tools/get-expense-report';
import { listExpenseReports, ListExpenseReportsInputSchema } from './tools/list-expense-reports';
import { getArr, GetArrInputSchema } from './tools/get-arr';
import { getArrMovement, GetArrMovementInputSchema } from './tools/get-arr-movement';
import {
  deleteInvoice,
  executeDeleteInvoice,
  DeleteInvoiceInputSchema,
} from './tools/delete-invoice';
import {
  approveBudget,
  executeApproveBudget,
  ApproveBudgetInputSchema,
} from './tools/approve-budget';
import {
  rejectBudget,
  executeRejectBudget,
  RejectBudgetInputSchema,
} from './tools/reject-budget';
import {
  deleteBudget,
  executeDeleteBudget,
  DeleteBudgetInputSchema,
} from './tools/delete-budget';
import {
  approveInvoice,
  executeApproveInvoice,
  ApproveInvoiceInputSchema,
} from './tools/approve-invoice';
import {
  payInvoice,
  executePayInvoice,
  PayInvoiceInputSchema,
} from './tools/pay-invoice';
import {
  approveExpenseReport,
  executeApproveExpenseReport,
  ApproveExpenseReportInputSchema,
} from './tools/approve-expense-report';
import {
  rejectExpenseReport,
  executeRejectExpenseReport,
  RejectExpenseReportInputSchema,
} from './tools/reject-expense-report';
import {
  reimburseExpenseReport,
  executeReimburseExpenseReport,
  ReimburseExpenseReportInputSchema,
} from './tools/reimburse-expense-report';
import {
  deleteExpenseReport,
  executeDeleteExpenseReport,
  DeleteExpenseReportInputSchema,
} from './tools/delete-expense-report';
import { MCPToolResponse } from './types/response';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

const app = express();
const PORT = parseInt(process.env.PORT || '3102');

// Authorization helper - checks if user has Finance access
function hasFinanceAccess(roles: string[]): boolean {
  return roles.some(role =>
    role === 'finance-read' ||
    role === 'finance-write' ||
    role === 'executive'
  );
}

// Middleware
app.use(express.json());

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    userId: req.headers['x-user-id'],
  });
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkConnection();

  if (!dbHealthy) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.json({
    status: 'healthy',
    service: 'mcp-finance',
    version: '1.4.0',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// MCP QUERY ENDPOINT
// =============================================================================

/**
 * Main query endpoint called by MCP Gateway
 *
 * Extracts user context from headers and routes to appropriate tool.
 * Supports cursor-based pagination for list operations.
 */
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, userContext: bodyUserContext, cursor } = req.body;

    // Build user context from request
    const userContext: UserContext = bodyUserContext || {
      userId: req.headers['x-user-id'] as string,
      username: req.headers['x-user-username'] as string || 'unknown',
      email: req.headers['x-user-email'] as string,
      roles: (req.headers['x-user-roles'] as string || '').split(','),
    };

    if (!userContext.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
        suggestedAction: 'Ensure authentication headers are set',
      });
      return;
    }

    logger.info('Processing query', {
      query: query.substring(0, 100),
      userId: userContext.userId,
      roles: userContext.roles,
      hasCursor: !!cursor,
    });

    // Simple query routing based on keywords
    const queryLower = query.toLowerCase();

    // Check for pagination requests
    const isPaginationRequest = queryLower.includes('next page') ||
      queryLower.includes('more') ||
      queryLower.includes('show more') ||
      queryLower.includes('continue') ||
      !!cursor;

    // Check if this is a budget query
    const isBudgetQuery = queryLower.includes('budget') ||
      queryLower.includes('spending') ||
      queryLower.includes('allocation');

    // Check if this is a list invoices query
    const isListInvoicesQuery = queryLower.includes('invoice');

    // Route to appropriate handler
    if (isBudgetQuery) {
      // Extract department filter if mentioned
      const deptMatch = queryLower.match(/(?:for|in)\s+(\w+)\s+(?:department|dept)?/);
      const yearMatch = queryLower.match(/(\d{4})/);

      const input: any = { limit: 50 };
      if (deptMatch) {
        input.department = deptMatch[1].toUpperCase();
      }
      if (yearMatch) {
        input.fiscalYear = parseInt(yearMatch[1]);
      }

      const result = await listBudgets(input, userContext);
      res.json(result);
      return;
    }

    if (isListInvoicesQuery || isPaginationRequest) {
      const input: any = { limit: 50 };
      if (cursor) {
        input.cursor = cursor;
      }

      const result = await listInvoices(input, userContext);
      res.json(result);
      return;
    }

    // Default: Return budget summary as it's the most commonly requested
    const result = await listBudgets({ limit: 50 }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('Query error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to process query',
      suggestedAction: 'Please try again or contact support',
    });
  }
});

// =============================================================================
// TOOL ENDPOINTS (v1.4)
// =============================================================================

/**
 * Get Budget Tool
 */
app.post('/tools/get_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, department, year } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await getBudget({ department, year }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get budget',
    });
  }
});

/**
 * List Invoices Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_invoices', async (req: Request, res: Response) => {
  try {
    const { userContext, status, department, startDate, endDate, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await listInvoices({ status, department, startDate, endDate, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_invoices error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list invoices',
    });
  }
});

/**
 * List Budgets Tool (v1.4 with truncation detection)
 */
app.post('/tools/list_budgets', async (req: Request, res: Response) => {
  try {
    const { userContext, fiscalYear, department, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await listBudgets({ fiscalYear, department, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_budgets error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list budgets',
    });
  }
});

/**
 * Get Expense Report Tool
 */
app.post('/tools/get_expense_report', async (req: Request, res: Response) => {
  try {
    const { userContext, reportId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await getExpenseReport({ reportId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get expense report',
    });
  }
});

/**
 * List Expense Reports Tool
 */
app.post('/tools/list_expense_reports', async (req: Request, res: Response) => {
  try {
    const { userContext, status, employeeId, startDate, endDate, limit, cursor } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await listExpenseReports({ status, employeeId, startDate, endDate, limit, cursor }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('list_expense_reports error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to list expense reports',
    });
  }
});

/**
 * Get ARR Tool - Returns current ARR metrics
 */
app.post('/tools/get_arr', async (req: Request, res: Response) => {
  try {
    const { userContext, asOfDate } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await getArr({ asOfDate }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_arr error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get ARR metrics',
    });
  }
});

/**
 * Get ARR Movement Tool - Returns ARR waterfall/movement data
 */
app.post('/tools/get_arr_movement', async (req: Request, res: Response) => {
  try {
    const { userContext, year, months } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await getArrMovement({ year, months }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('get_arr_movement error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to get ARR movement data',
    });
  }
});

/**
 * Delete Invoice Tool (v1.4 with confirmation)
 */
app.post('/tools/delete_invoice', async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await deleteInvoice({ invoiceId }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete invoice',
    });
  }
});

/**
 * Approve Invoice Tool (v1.4 with confirmation)
 */
app.post('/tools/approve_invoice', async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await approveInvoice({ invoiceId, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve invoice',
    });
  }
});

/**
 * Pay Invoice Tool (v1.4 with confirmation)
 */
app.post('/tools/pay_invoice', async (req: Request, res: Response) => {
  try {
    const { userContext, invoiceId, paymentDate, paymentReference, paymentNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await payInvoice({ invoiceId, paymentDate, paymentReference, paymentNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('pay_invoice error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to pay invoice',
    });
  }
});

/**
 * Approve Budget Tool (v1.5 with confirmation)
 */
app.post('/tools/approve_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await approveBudget({ budgetId, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve budget',
    });
  }
});

/**
 * Reject Budget Tool (v1.5 with confirmation)
 */
app.post('/tools/reject_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, rejectionReason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await rejectBudget({ budgetId, rejectionReason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reject_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reject budget',
    });
  }
});

/**
 * Delete Budget Tool (v1.5 with confirmation)
 */
app.post('/tools/delete_budget', async (req: Request, res: Response) => {
  try {
    const { userContext, budgetId, reason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    // Authorization check - must have Finance access
    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access (finance-read, finance-write, or executive role). You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await deleteBudget({ budgetId, reason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_budget error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete budget',
    });
  }
});

/**
 * Approve Expense Report Tool (v1.5 with confirmation)
 */
app.post('/tools/approve_expense_report', async (req: Request, res: Response) => {
  try {
    const { userContext, expenseId, approverNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await approveExpenseReport({ expenseId, approverNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('approve_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to approve expense report',
    });
  }
});

/**
 * Reject Expense Report Tool (v1.5 with confirmation)
 */
app.post('/tools/reject_expense_report', async (req: Request, res: Response) => {
  try {
    const { userContext, expenseId, rejectionReason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await rejectExpenseReport({ expenseId, rejectionReason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reject_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reject expense report',
    });
  }
});

/**
 * Reimburse Expense Report Tool (v1.5 with confirmation)
 */
app.post('/tools/reimburse_expense_report', async (req: Request, res: Response) => {
  try {
    const { userContext, expenseId, paymentReference, paymentNotes } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await reimburseExpenseReport({ expenseId, paymentReference, paymentNotes }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('reimburse_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to reimburse expense report',
    });
  }
});

/**
 * Delete Expense Report Tool (v1.5 with confirmation)
 */
app.post('/tools/delete_expense_report', async (req: Request, res: Response) => {
  try {
    const { userContext, expenseId, reason } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    if (!hasFinanceAccess(userContext.roles)) {
      res.status(403).json({
        status: 'error',
        code: 'INSUFFICIENT_PERMISSIONS',
        message: `Access denied. This operation requires Finance access. You have: ${userContext.roles.join(', ')}`,
        suggestedAction: 'Contact your administrator to request Finance access permissions.',
      });
      return;
    }

    const result = await deleteExpenseReport({ expenseId, reason }, userContext);
    res.json(result);
  } catch (error) {
    logger.error('delete_expense_report error:', error);
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Failed to delete expense report',
    });
  }
});

// =============================================================================
// EXECUTE ENDPOINT (v1.4 - Called by Gateway after confirmation)
// =============================================================================

/**
 * Execute a confirmed action
 *
 * This endpoint is called by the Gateway after the user approves a
 * pending confirmation. It executes the actual write operation.
 */
app.post('/execute', async (req: Request, res: Response) => {
  try {
    const { action, data, userContext } = req.body;

    if (!userContext?.userId) {
      res.status(400).json({
        status: 'error',
        code: 'MISSING_USER_CONTEXT',
        message: 'User context is required',
      });
      return;
    }

    logger.info('Executing confirmed action', {
      action,
      userId: userContext.userId,
    });

    let result: MCPToolResponse;

    switch (action) {
      case 'delete_invoice':
        result = await executeDeleteInvoice(data, userContext);
        break;

      case 'approve_invoice':
        result = await executeApproveInvoice(data, userContext);
        break;

      case 'pay_invoice':
        result = await executePayInvoice(data, userContext);
        break;

      case 'approve_budget':
        result = await executeApproveBudget(data, userContext);
        break;

      case 'reject_budget':
        result = await executeRejectBudget(data, userContext);
        break;

      case 'delete_budget':
        result = await executeDeleteBudget(data, userContext);
        break;

      case 'approve_expense_report':
        result = await executeApproveExpenseReport(data, userContext);
        break;

      case 'reject_expense_report':
        result = await executeRejectExpenseReport(data, userContext);
        break;

      case 'reimburse_expense_report':
        result = await executeReimburseExpenseReport(data, userContext);
        break;

      case 'delete_expense_report':
        result = await executeDeleteExpenseReport(data, userContext);
        break;

      default:
        result = {
          status: 'error',
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`,
          suggestedAction: 'Check the action name and try again',
        };
    }

    res.json(result);
  } catch (error) {
    logger.error('Execute error:', error);
    res.status(500).json({
      status: 'error',
      code: 'EXECUTION_FAILED',
      message: 'Failed to execute confirmed action',
      suggestedAction: 'Please try the operation again',
    });
  }
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, async () => {
  logger.info(`MCP Finance Server listening on port ${PORT}`);
  logger.info('Architecture version: 1.4');

  // Check database connection
  const dbHealthy = await checkConnection();
  if (dbHealthy) {
    logger.info('Database connection: OK');
  } else {
    logger.error('Database connection: FAILED');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server...');
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
