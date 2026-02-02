/**
 * Annual Tax Filings Page
 *
 * Shows 1099s, W-2s, and other annual filings.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { LoadingSpinner, ErrorMessage, Badge, Card } from '@tamshai/ui';
import type { AnnualFiling, TaxApiResponse } from '../types';

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

function getStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'filed':
      return 'Filed';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'amended':
      return 'Amended';
    default:
      return status;
  }
}

function getStatusVariant(status: string): string {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'filed':
      return 'info';
    case 'draft':
      return 'warning';
    case 'rejected':
      return 'error';
    case 'amended':
      return 'default';
    default:
      return 'default';
  }
}

export function AnnualFilingsPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['annual-filings'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/annual-filings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<AnnualFiling[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const filings = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Annual Tax Filings</h1>
        <p className="text-gray-500 mt-1">1099s, W-2s, and other annual tax filings</p>
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load filings'} />}

      {!isLoading && !error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filed Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confirmation</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filings.map((filing) => (
                  <tr key={filing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{filing.year}</td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{filing.filingType}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{filing.entityName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(filing.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(filing.dueDate)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {filing.filingDate ? formatDate(filing.filingDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusVariant(filing.status)}>
                        {getStatusLabel(filing.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm font-mono">
                      {filing.confirmationNumber || '-'}
                    </td>
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

export default AnnualFilingsPage;
