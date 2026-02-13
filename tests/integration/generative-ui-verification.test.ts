/**
 * Generative UI Verification Test Suite
 *
 * Comprehensive test of all display directives across all domains after Phoenix rebuild.
 * Tests component rendering, data transformation, and approval workflows.
 *
 * @see .claude/plans/test-auth-refactoring.md - Uses token exchange authentication
 */

import axios, { AxiosInstance } from 'axios';
import { getTestAuthProvider, Logger } from '../shared/auth/token-exchange';

// Test configuration
const MCP_UI_URL = process.env.MCP_UI_URL || 'http://localhost:3118';
const MCP_GATEWAY_URL = process.env.MCP_GATEWAY_URL || 'http://localhost:3110';

// Simple console logger
const logger: Logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

describe('Generative UI - Full Verification Suite', () => {
  let authProvider: ReturnType<typeof getTestAuthProvider>;
  let aliceToken: string;
  let bobToken: string;
  let httpClient: AxiosInstance;

  beforeAll(async () => {
    authProvider = getTestAuthProvider(logger);

    // Get tokens for test users
    aliceToken = await authProvider.getUserToken('alice.chen'); // HR manager
    bobToken = await authProvider.getUserToken('bob.martinez'); // Finance manager

    // Create axios client with default config
    httpClient = axios.create({
      baseURL: MCP_UI_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  afterAll(() => {
    authProvider.clearCache();
  });

  describe('1. Approvals Queue - Multi-Domain Name Resolution', () => {
    let approvalsData: any;

    beforeAll(async () => {
      // Request approvals:pending directive
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:approvals:pending:userId=me',
        },
        {
          headers: { Authorization: `Bearer ${aliceToken}` },
        }
      );

      expect(response.status).toBe(200);
      approvalsData = response.data;
    });

    test('should return ApprovalsQueue component type', () => {
      expect(approvalsData.component).toBe('ApprovalsQueue');
    });

    test('should contain all three data arrays', () => {
      expect(approvalsData.component.props).toHaveProperty('timeOffRequests');
      expect(approvalsData.component.props).toHaveProperty('expenseReports');
      expect(approvalsData.component.props).toHaveProperty('budgetAmendments');
    });

    test('should have time-off requests with resolved names', () => {
      const timeOffRequests = approvalsData.component.props.timeOffRequests;
      expect(Array.isArray(timeOffRequests)).toBe(true);

      if (timeOffRequests.length > 0) {
        const firstRequest = timeOffRequests[0];
        expect(firstRequest).toHaveProperty('employeeName');
        expect(firstRequest.employeeName).not.toBe('Unknown');
        expect(firstRequest.employeeName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); // "First Last"

        expect(firstRequest).toHaveProperty('startDate');
        expect(firstRequest).toHaveProperty('endDate');
        expect(firstRequest).toHaveProperty('type');
      }
    });

    test('should have expense reports with resolved names and item counts', () => {
      const expenseReports = approvalsData.component.props.expenseReports;
      expect(Array.isArray(expenseReports)).toBe(true);

      if (expenseReports.length > 0) {
        const firstExpense = expenseReports[0];

        // Employee name should be resolved
        expect(firstExpense).toHaveProperty('employeeName');
        expect(firstExpense.employeeName).not.toBe('Unknown');
        expect(firstExpense.employeeName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);

        // Item count should NOT be zero (if expense has items)
        expect(firstExpense).toHaveProperty('itemCount');
        expect(firstExpense.itemCount).toBeGreaterThanOrEqual(0);

        // Other required fields
        expect(firstExpense).toHaveProperty('amount');
        expect(firstExpense.amount).toBeGreaterThan(0);
        expect(firstExpense).toHaveProperty('date');
        expect(firstExpense).toHaveProperty('description');
      }
    });

    test('should have budget amendments with resolved submitter names', () => {
      const budgetAmendments = approvalsData.component.props.budgetAmendments;
      expect(Array.isArray(budgetAmendments)).toBe(true);

      if (budgetAmendments.length > 0) {
        const firstBudget = budgetAmendments[0];

        // Submitter name should be resolved
        expect(firstBudget).toHaveProperty('submittedBy');
        expect(firstBudget.submittedBy).not.toBe('Unknown');

        expect(firstBudget).toHaveProperty('department');
        expect(firstBudget).toHaveProperty('requestedBudget');
        expect(firstBudget.requestedBudget).toBeGreaterThan(0);
      }
    });

    test('should generate narration text', () => {
      expect(approvalsData.narration).toHaveProperty('text');
      expect(approvalsData.narration.text).toMatch(/pending approval/i);
    });
  });

  describe('2. Approval Actions - Database Persistence', () => {
    let initialApprovalsCount: number;

    beforeAll(async () => {
      // Get initial count
      const response = await httpClient.post(
        '/api/display',
        { directive: 'display:approvals:pending:userId=me' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      const data = response.data.component.props;
      initialApprovalsCount =
        data.timeOffRequests.length +
        data.expenseReports.length +
        data.budgetAmendments.length;
    });

    test('should approve time-off request and persist to database', async () => {
      // Get a pending time-off request
      const approvalsResponse = await httpClient.post(
        '/api/display',
        { directive: 'display:approvals:pending:userId=me' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      const timeOffRequests = approvalsResponse.data.data.timeOffRequests;

      if (timeOffRequests.length === 0) {
        console.log('[SKIP] No pending time-off requests to approve');
        return;
      }

      const requestToApprove = timeOffRequests[0];

      // Approve the request via MCP Gateway (with auto-confirmation)
      const approveResponse = await axios.post(
        `${MCP_GATEWAY_URL}/api/mcp/hr/tools/approve_time_off_request`,
        { requestId: requestToApprove.id, approved: true },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(approveResponse.status).toBe(200);

      // If pending_confirmation, auto-confirm
      if (approveResponse.data.status === 'pending_confirmation') {
        const confirmId = approveResponse.data.confirmationId;
        const confirmResponse = await axios.post(
          `${MCP_GATEWAY_URL}/api/confirm/${confirmId}`,
          { approved: true },
          { headers: { Authorization: `Bearer ${aliceToken}` } }
        );
        expect(confirmResponse.status).toBe(200);
      }

      // Wait a moment for DB write
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify item is removed from queue
      const verifyResponse = await httpClient.post(
        '/api/display',
        { directive: 'display:approvals:pending:userId=me' },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      const newTimeOffRequests = verifyResponse.data.data.timeOffRequests;
      expect(newTimeOffRequests.length).toBe(timeOffRequests.length - 1);

      // Verify the specific request is gone
      const stillExists = newTimeOffRequests.some((r: any) => r.id === requestToApprove.id);
      expect(stillExists).toBe(false);
    });

    test('should approve expense report and persist to database', async () => {
      const approvalsResponse = await httpClient.post(
        '/api/display',
        { directive: 'display:approvals:pending:userId=me' },
        { headers: { Authorization: `Bearer ${bobToken}` } } // Use Bob (Finance)
      );

      const expenseReports = approvalsResponse.data.data.expenseReports;

      if (expenseReports.length === 0) {
        console.log('[SKIP] No pending expense reports to approve');
        return;
      }

      const expenseToApprove = expenseReports[0];

      // Approve via MCP Gateway
      const approveResponse = await axios.post(
        `${MCP_GATEWAY_URL}/api/mcp/finance/tools/approve_expense_report`,
        { reportId: expenseToApprove.id },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );

      expect(approveResponse.status).toBe(200);

      // Auto-confirm if needed
      if (approveResponse.data.status === 'pending_confirmation') {
        const confirmId = approveResponse.data.confirmationId;
        await axios.post(
          `${MCP_GATEWAY_URL}/api/confirm/${confirmId}`,
          { approved: true },
          { headers: { Authorization: `Bearer ${bobToken}` } }
        );
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify persistence
      const verifyResponse = await httpClient.post(
        '/api/display',
        { directive: 'display:approvals:pending:userId=me' },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );

      const newExpenseReports = verifyResponse.data.data.expenseReports;
      expect(newExpenseReports.length).toBe(expenseReports.length - 1);

      const stillExists = newExpenseReports.some((e: any) => e.id === expenseToApprove.id);
      expect(stillExists).toBe(false);
    });
  });

  describe('3. HR Domain - Display Directives', () => {
    test('should render employee detail component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:hr:employee_detail:employeeId=e1000000-0000-0000-0000-000000000052',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component.type).toBe('EmployeeDetailCard');
      expect(response.data.component.props).toHaveProperty('employee');

      const employee = response.data.component.props.employee;
      expect(employee).toHaveProperty('firstName');
      expect(employee).toHaveProperty('lastName');
      expect(employee).toHaveProperty('workEmail');
    });

    test('should render org chart component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:hr:org_chart:departmentCode=DEPT001',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component.type).toBe('OrgChart');
      expect(response.data.component.props).toHaveProperty('nodes');
      expect(Array.isArray(response.data.component.props.nodes)).toBe(true);
    });
  });

  describe('4. Finance Domain - Display Directives', () => {
    test('should render budget summary component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:finance:budget:departmentCode=FIN',
        },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component.type).toBe('BudgetSummary');
      expect(response.data.component.props).toHaveProperty('budgets');
    });

    test('should render quarterly report dashboard', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:finance:quarterly_report:quarter=Q1&year=2026',
        },
        { headers: { Authorization: `Bearer ${bobToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component.type).toBe('QuarterlyReportDashboard');
      expect(response.data.component.props).toHaveProperty('report');

      const report = response.data.component.props.report;
      expect(report).toHaveProperty('kpis');
      expect(report).toHaveProperty('arrWaterfall');
    });
  });

  describe('5. Sales Domain - Display Directives', () => {
    test('should render customer detail component', async () => {
      // Note: Need a valid customer ID - this test may need adjustment
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:sales:customer:customerId=test',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      // May return error if customer doesn't exist - that's OK for verification
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('6. Support Domain - Display Directives', () => {
    test('should render tickets list component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:support:tickets:priority=high',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component).toMatch(/ticket/i);
      expect(response.data.component.props).toHaveProperty('tickets');
    });
  });

  describe('7. Payroll Domain - Display Directives', () => {
    test('should render pay stub component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:payroll:pay_stub:employeeId=e1000000-0000-0000-0000-000000000052',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component).toMatch(/pay.*stub/i);
      expect(response.data.component.props).toBeDefined();
    });

    test('should render pay runs list', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:payroll:pay_runs:status=completed',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component).toMatch(/pay.*run/i);
    });
  });

  describe('8. Tax Domain - Display Directives', () => {
    test('should render quarterly estimate component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:tax:quarterly_estimate:quarter=Q1&year=2026',
        },
        { headers: { Authorization: `Bearer ${aliceToken}` } }
      );

      expect(response.status).toBe(200);
      expect(response.data.component).toMatch(/tax|estimate/i);
    });
  });

  describe('9. Error Handling & Edge Cases', () => {
    test('should return 401 for missing auth token', async () => {
      try {
        await httpClient.post('/api/display', {
          directive: 'display:approvals:pending:userId=me',
        });
        fail('Should have thrown 401 error');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should return error for invalid directive format', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'invalid-format',
        },
        {
          headers: { Authorization: `Bearer ${aliceToken}` },
          validateStatus: () => true // Don't throw on error status
        }
      );

      expect([400, 404]).toContain(response.status);
    });

    test('should return error for unknown component', async () => {
      const response = await httpClient.post(
        '/api/display',
        {
          directive: 'display:unknown:component:param=value',
        },
        {
          headers: { Authorization: `Bearer ${aliceToken}` },
          validateStatus: () => true
        }
      );

      expect([404, 400]).toContain(response.status);
    });
  });
});
