/**
 * Quarterly Tax Estimates Page
 *
 * Shows quarterly federal and state tax estimates.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { LoadingSpinner, ErrorMessage, Badge, Card } from '@tamshai/ui';
import type { QuarterlyEstimate, TaxApiResponse } from '../types';

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

function getQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
    case 'partial':
      return 'Partial';
    default:
      return status;
  }
}

function getStatusVariant(status: string): string {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
      return 'error';
    case 'partial':
      return 'info';
    default:
      return 'default';
  }
}

export function QuarterlyEstimatesPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['quarterly-estimates'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/quarterly-estimates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<QuarterlyEstimate[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const estimates = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quarterly Tax Estimates</h1>
        <p className="text-gray-500 mt-1">Federal and state quarterly estimated tax payments</p>
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load estimates'} />}

      {!isLoading && !error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quarter</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Federal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">State</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {estimates.map((estimate) => (
                  <tr key={estimate.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {getQuarterLabel(estimate.year, estimate.quarter)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(estimate.federalEstimate)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(estimate.stateEstimate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(estimate.totalEstimate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(estimate.dueDate)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {estimate.paidDate ? formatDate(estimate.paidDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusVariant(estimate.status)}>
                        {getStatusLabel(estimate.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{estimate.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default QuarterlyEstimatesPage;
