/**
 * Tax Dashboard Page
 *
 * Shows tax summary, upcoming deadlines, and compliance status.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { LoadingSpinner, ErrorMessage, Card } from '@tamshai/ui';
import type { TaxSummary } from '../types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getComplianceStatusLabel(status: string): string {
  switch (status) {
    case 'compliant':
      return 'Compliant';
    case 'at_risk':
      return 'At Risk';
    case 'non_compliant':
      return 'Non-Compliant';
    default:
      return status;
  }
}

function getComplianceStatusColor(status: string): string {
  switch (status) {
    case 'compliant':
      return 'bg-green-100 text-green-800';
    case 'at_risk':
      return 'bg-yellow-100 text-yellow-800';
    case 'non_compliant':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function DashboardPage() {
  const { getAccessToken } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tax-summary'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data as TaxSummary;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of tax obligations and compliance</p>
        </div>
        {data && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getComplianceStatusColor(data.complianceStatus)}`}>
            {getComplianceStatusLabel(data.complianceStatus)}
          </span>
        )}
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load tax summary'} />}

      {!isLoading && !error && data && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Tax Liability</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(data.totalTaxLiability)}
              </p>
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Paid to Date</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(data.paidToDate)}
              </p>
            </Card>
            <Card className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Remaining Balance</h3>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {formatCurrency(data.remainingBalance)}
              </p>
            </Card>
          </div>

          {/* Upcoming Deadlines */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Deadlines</h2>
            <div className="space-y-3">
              {data.upcomingDeadlines.map((deadline, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{deadline.description}</p>
                    <p className="text-sm text-gray-500">Due: {formatDate(deadline.dueDate)}</p>
                  </div>
                  <p className="font-semibold text-gray-900">{formatCurrency(deadline.amount)}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* State Breakdown */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">State Tax Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Liability</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.stateBreakdown.map((state) => (
                    <tr key={state.state}>
                      <td className="px-4 py-3 text-gray-900">{state.state}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(state.liability)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(state.paid)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(state.liability - state.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recent Filings */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Filings</h2>
            <div className="space-y-3">
              {data.recentFilings.map((filing) => (
                <div key={filing.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{filing.entityName}</p>
                    <p className="text-sm text-gray-500">{filing.filingType} - {filing.year}</p>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                    {filing.status.charAt(0).toUpperCase() + filing.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default DashboardPage;
