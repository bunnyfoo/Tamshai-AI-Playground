import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { TaxWithholding } from '../types';

export default function TaxWithholdingsPage() {
  const { getAccessToken } = useAuth();

  const { data: withholding, isLoading, error } = useQuery({
    queryKey: ['tax-withholdings'],
    queryFn: async () => {
      const token = await getAccessToken();
      const response = await fetch(`${apiConfig.mcpGatewayUrl}/api/mcp/payroll/get_tax_withholdings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch tax withholdings');
      const result = await response.json();
      return result.data as TaxWithholding;
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tax Withholdings</h1>
        <p className="text-gray-500 mt-1">Manage your federal and state tax elections</p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading tax withholding settings...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error loading tax withholdings</p>
        </div>
      )}

      {/* Federal W-4 */}
      {!isLoading && !error && (
        <>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Federal W-4</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500">Filing Status</label>
            <p className="text-gray-900 mt-1 capitalize">
              {withholding?.federal_filing_status?.replace(/_/g, ' ') || 'Not set'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Allowances</label>
            <p className="text-gray-900 mt-1">{withholding?.federal_allowances ?? 0}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Additional Withholding</label>
            <p className="text-gray-900 mt-1">${withholding?.federal_additional ?? 0}</p>
          </div>
        </div>
        <button
          type="button"
          className="mt-4 px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50"
        >
          Update W-4
        </button>
      </div>

      {/* State Tax */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">State Tax</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500">State</label>
            <p className="text-gray-900 mt-1">{withholding?.state || 'Not set'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Filing Status</label>
            <p className="text-gray-900 mt-1">{withholding?.state_filing_status || 'Not set'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Allowances</label>
            <p className="text-gray-900 mt-1">{withholding?.state_allowances ?? 0}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Additional Withholding</label>
            <p className="text-gray-900 mt-1">${withholding?.state_additional ?? 0}</p>
          </div>
        </div>
        <button
          type="button"
          className="mt-4 px-4 py-2 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50"
        >
          Update State Tax
        </button>
      </div>
        </>
      )}
    </div>
  );
}
