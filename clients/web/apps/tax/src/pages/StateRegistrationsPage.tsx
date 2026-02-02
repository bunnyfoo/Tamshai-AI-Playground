/**
 * State Tax Registrations Page
 *
 * Shows state tax registrations and compliance status.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { LoadingSpinner, ErrorMessage, Badge, Card } from '@tamshai/ui';
import type { StateRegistration, TaxApiResponse } from '../types';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getRegistrationTypeLabel(type: string): string {
  switch (type) {
    case 'sales_tax':
      return 'Sales Tax';
    case 'income_tax':
      return 'Income Tax';
    case 'payroll_tax':
      return 'Payroll Tax';
    case 'franchise_tax':
      return 'Franchise Tax';
    default:
      return type;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'pending':
      return 'Pending';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Revoked';
    default:
      return status;
  }
}

function getStatusVariant(status: string): string {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending':
      return 'warning';
    case 'expired':
      return 'error';
    case 'revoked':
      return 'error';
    default:
      return 'default';
  }
}

function getFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'monthly':
      return 'Monthly';
    case 'quarterly':
      return 'Quarterly';
    case 'annually':
      return 'Annually';
    default:
      return frequency;
  }
}

export function StateRegistrationsPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['state-registrations'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/state-registrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<StateRegistration[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const registrations = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">State Tax Registrations</h1>
        <p className="text-gray-500 mt-1">State tax registration status and filing requirements</p>
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load registrations'} />}

      {!isLoading && !error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registration #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filing Frequency</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {registrations.map((registration) => (
                  <tr key={registration.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{registration.state}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {getRegistrationTypeLabel(registration.registrationType)}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-900">{registration.registrationNumber}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {getFrequencyLabel(registration.filingFrequency)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(registration.registrationDate)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {registration.expirationDate ? formatDate(registration.expirationDate) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatusVariant(registration.status)}>
                        {getStatusLabel(registration.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{registration.notes || '-'}</td>
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

export default StateRegistrationsPage;
