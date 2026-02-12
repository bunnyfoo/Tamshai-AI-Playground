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
      { server: 'hr', tool: 'get_org_chart', paramMap: { rootEmployeeId: 'userId', maxDepth: 'depth' } },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // get_org_chart returns an array of tree nodes
      // Find the root node (the employee we're viewing)
      const nodes = (data as Array<any>) || [];
      const rootNode = nodes.find(n => n.level === 0) || null;

      // Map employee_id → id for component compatibility
      const mapEmployee = (emp: any) => emp ? { ...emp, id: emp.employee_id } : null;

      return {
        manager: null,  // get_org_chart doesn't return manager info (TODO: enhance tool)
        self: mapEmployee(rootNode),
        peers: [],  // get_org_chart doesn't return peers (TODO: enhance tool)
        directReports: (rootNode?.direct_reports || []).map(mapEmployee),
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      // data is the raw array from get_org_chart
      const nodes = (data as Array<any>) || [];
      const rootNode = nodes.find(n => n.level === 0);
      const reportCount = rootNode?.direct_reports?.length || 0;
      return {
        text: `You report to no one. You have ${reportCount} direct reports.`,
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

      // get_customer returns customer with nested contacts array
      // Extract contacts and map _id → id for component compatibility
      const contacts = (d.contacts as Array<any>) || [];
      const mappedContacts = contacts.map(contact => ({
        ...contact,
        id: contact._id || contact.id,
      }));

      // Extract customer without nested contacts
      const { contacts: _, ...customer } = d;

      return {
        customer,  // Already has id field from MCP server
        contacts: mappedContacts,
        opportunities: [],  // TODO: Add second MCP call for opportunities
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
      // list_leads returns array of leads - map MCP field names to component props
      const rawLeads = (data as Array<any>) || [];
      const leads = rawLeads.map((lead: any) => ({
        id: lead.id || lead._id,
        name: lead.contact_name || lead.name || 'Unknown',
        email: lead.contact_email || lead.email || '',
        company: lead.company_name || lead.company || 'Unknown',
        status: (lead.status || 'new').toLowerCase(),
        source: (lead.source || 'website').toLowerCase(),
        score: lead.score?.total || lead.score || 0,
        createdAt: lead.created_at || lead.createdAt || new Date().toISOString(),
        lastActivity: lead.updated_at || lead.lastActivity || new Date().toISOString(),
      }));
      return {
        leads,
        totalCount: leads.length,
        filters: {},
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
      const budgets = (d.budgets as Array<any>) || [];

      // Map department budgets to category spending structure
      const categories = budgets.map(b => ({
        name: b.category_id || 'General',
        allocated: Number(b.budgeted_amount) || 0,
        spent: Number(b.actual_amount) || 0,
        percentage: Number(b.budgeted_amount) > 0
          ? Math.round((Number(b.actual_amount) / Number(b.budgeted_amount)) * 100)
          : 0,
      }));

      const allocated = Number(d.total_budgeted) || 0;
      const spent = Number(d.total_actual) || 0;

      return {
        budget: {
          departmentName: String(d.department),
          fiscalYear: Number(d.fiscal_year),
          allocated,
          spent,
          remaining: allocated - spent,
          categories,
        },
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
      { server: 'hr', tool: 'get_pending_time_off', paramMap: {} },
      { server: 'finance', tool: 'get_pending_expenses', paramMap: {} },
      { server: 'finance', tool: 'get_pending_budgets', paramMap: {} },
    ],
    transform: (data: unknown): Record<string, unknown> => {
      // Multiple MCP calls return merged object with arrays
      const d = data as Record<string, unknown>;

      // Map time-off requests: requestId → id, typeCode → type, notes → reason
      const timeOffRequests = ((d.timeOffRequests as Array<any>) || []).map((req: any) => ({
        id: req.requestId || req.id,
        employeeName: req.employeeName,
        startDate: req.startDate,
        endDate: req.endDate,
        type: (req.typeCode || req.type || 'other').toLowerCase(),
        reason: req.notes || req.reason || '',
      }));

      // Map expense reports: totalAmount → amount, title → description, submittedAt → date
      const expenseReports = ((d.expenseReports as Array<any>) || []).map((exp: any) => ({
        id: exp.id,
        employeeName: exp.employeeName || 'Unknown',
        amount: exp.totalAmount || exp.amount || 0,
        date: exp.submittedAt || exp.submissionDate || exp.date,
        description: exp.title || exp.description || 'No description',
        itemCount: 0, // Not available from MCP response
      }));

      // Map budget amendments: budgetedAmount → requestedBudget
      // Note: currentBudget not available from get_pending_budgets tool
      const budgetAmendments = ((d.budgetAmendments as Array<any>) || []).map((bud: any) => ({
        id: bud.id,
        department: bud.department || bud.departmentCode,
        currentBudget: 0, // Not available from MCP response
        requestedBudget: bud.budgetedAmount || bud.requestedBudget || 0,
        reason: bud.categoryName || bud.reason || 'Budget request',
      }));

      return {
        timeOffRequests,
        expenseReports,
        budgetAmendments,
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

      // get_quarterly_report returns complete QuarterlyReport structure
      // Component expects report object with quarter, year, kpis, arrWaterfall, highlights
      return {
        report: {
          quarter: d.quarter,
          year: d.year,
          kpis: d.kpis || [],
          arrWaterfall: d.arrWaterfall || [],
          highlights: d.highlights || [],
        },
      };
    },
    generateNarration: (data: unknown, params: Record<string, string>): { text: string } => {
      const d = data as Record<string, unknown>;
      const quarter = d.quarter || params.quarter || 'Q1';
      const year = d.year || params.year || '2026';
      const highlights = (d.highlights as string[]) || [];

      // Generate summary from highlights if available
      if (highlights.length > 0) {
        return {
          text: `${quarter} ${year} quarterly report. ${highlights[0]}`,
        };
      }

      return {
        text: `Quarterly report for ${quarter} ${year}.`,
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
