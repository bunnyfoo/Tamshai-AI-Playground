/**
 * Component Registry - Full Implementation
 *
 * The registry maps domain:component pairs (e.g., "hr:org_chart") to their
 * component definitions including:
 * - type: The React component type name
 * - domain: The domain (hr, sales, finance, approvals)
 * - component: The component identifier
 * - mcpCalls: Array of MCP server calls needed to populate the component
 * - transform: Function to transform MCP responses to component props
 * - generateNarration: Function to generate AI narration for the component
 */

import { ComponentDefinition } from '../types/component';

const componentRegistry: Record<string, ComponentDefinition> = {
  'hr:org_chart': {
    type: 'OrgChartComponent',
    domain: 'hr',
    component: 'org_chart',
    description: 'Displays organizational hierarchy centered on the current user',
    mcpCalls: [
      { server: 'hr', tool: 'get_org_chart', paramMap: { userId: 'userId', maxDepth: 'depth' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        manager: d.manager,
        self: d.employee,
        peers: d.peers || [],
        directReports: d.directReports || [],
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const manager = d.manager as Record<string, unknown> | undefined;
      const directReports = d.directReports as unknown[] | undefined;
      const managerName = manager?.name || 'no one';
      const reportCount = directReports?.length || 0;
      return {
        text: `You report to ${managerName}. You have ${reportCount} direct reports.`,
      };
    },
  },

  'sales:customer': {
    type: 'CustomerDetailCard',
    domain: 'sales',
    component: 'customer',
    description: 'Shows detailed customer information with contacts and opportunities',
    mcpCalls: [
      { server: 'sales', tool: 'get_customer', paramMap: { customerId: 'customerId' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        customer: d.customer,
        contacts: d.contacts || [],
        opportunities: d.opportunities || [],
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const customer = d.customer as Record<string, unknown> | undefined;
      const opportunities = d.opportunities as unknown[] | undefined;
      const name = customer?.name || 'Unknown';
      const oppCount = opportunities?.length || 0;
      return {
        text: `${name} has ${oppCount} active opportunities.`,
      };
    },
  },

  'sales:leads': {
    type: 'LeadsDataTable',
    domain: 'sales',
    component: 'leads',
    description: 'Displays a filterable table of sales leads',
    mcpCalls: [
      { server: 'sales', tool: 'list_leads', paramMap: { status: 'status', limit: 'limit' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        leads: d.leads || [],
        totalCount: d.totalCount || 0,
        filters: d.filters || {},
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const leads = d.leads as unknown[] | undefined;
      const count = leads?.length || 0;
      const status = params.status || 'all';
      return {
        text: `Showing ${count} ${status} leads.`,
      };
    },
  },

  'sales:forecast': {
    type: 'ForecastChart',
    domain: 'sales',
    component: 'forecast',
    description: 'Displays sales forecast chart for a period',
    mcpCalls: [
      { server: 'sales', tool: 'get_forecast', paramMap: { period: 'period' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        forecast: d.forecast,
        actual: d.actual,
        period: d.period,
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const period = params.period || 'current period';
      return {
        text: `Sales forecast for ${period}.`,
      };
    },
  },

  'finance:budget': {
    type: 'BudgetSummaryCard',
    domain: 'finance',
    component: 'budget',
    description: 'Shows budget summary for a department',
    mcpCalls: [
      { server: 'finance', tool: 'get_budget', paramMap: { department: 'department', year: 'year' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        department: d.department,
        budget: d.budget,
        spent: d.spent,
        remaining: d.remaining,
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const dept = params.department || (d.department as string) || 'department';
      return {
        text: `Budget summary for ${dept}.`,
      };
    },
  },

  'approvals:pending': {
    type: 'ApprovalsQueue',
    domain: 'approvals',
    component: 'pending',
    description: 'Shows pending approvals across HR and Finance',
    mcpCalls: [
      { server: 'hr', tool: 'get_pending_time_off', paramMap: { userId: 'userId' } },
      { server: 'finance', tool: 'get_pending_expenses', paramMap: { userId: 'userId' } },
      { server: 'finance', tool: 'get_pending_budgets', paramMap: { userId: 'userId' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        timeOffRequests: d.timeOffRequests || [],
        expenseReports: d.expenseReports || [],
        budgetAmendments: d.budgetAmendments || [],
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const timeOffRequests = d.timeOffRequests as unknown[] | undefined;
      const expenseReports = d.expenseReports as unknown[] | undefined;
      const budgetAmendments = d.budgetAmendments as unknown[] | undefined;
      const timeOff = timeOffRequests?.length || 0;
      const expenses = expenseReports?.length || 0;
      const budgets = budgetAmendments?.length || 0;
      const total = timeOff + expenses + budgets;
      return {
        text: `You have ${total} pending approvals: ${timeOff} time off, ${expenses} expenses, ${budgets} budget amendments.`,
      };
    },
  },

  'finance:quarterly_report': {
    type: 'QuarterlyReportDashboard',
    domain: 'finance',
    component: 'quarterly_report',
    description: 'Displays quarterly financial report dashboard',
    mcpCalls: [
      { server: 'finance', tool: 'get_quarterly_report', paramMap: { quarter: 'quarter', year: 'year' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      const d = data as Record<string, unknown>;
      return {
        quarter: d.quarter,
        year: d.year,
        revenue: d.revenue,
        expenses: d.expenses,
        profit: d.profit,
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const q = params.quarter || 'Q1';
      const y = params.year || '2026';
      return {
        text: `Quarterly report for ${q} ${y}.`,
      };
    },
  },
};

/**
 * Get a component definition by domain and component name.
 *
 * @param domain - The domain (hr, sales, finance, approvals)
 * @param component - The component identifier (org_chart, customer, etc.)
 * @returns ComponentDefinition if found, undefined otherwise
 */
export function getComponentDefinition(
  domain: string,
  component: string
): ComponentDefinition | undefined {
  if (!domain || !component) return undefined;
  return componentRegistry[`${domain}:${component}`];
}

/**
 * List all registered component definitions.
 *
 * @returns Array of all ComponentDefinition objects
 */
export function listComponents(): ComponentDefinition[] {
  return Object.values(componentRegistry);
}

// Re-export ComponentDefinition type for convenience
export { ComponentDefinition };
