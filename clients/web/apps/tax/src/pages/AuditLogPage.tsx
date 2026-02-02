/**
 * Tax Audit Log Page
 *
 * Shows compliance audit trail for tax activities.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth, apiConfig } from '@tamshai/auth';
import { LoadingSpinner, ErrorMessage, Badge, Card } from '@tamshai/ui';
import type { AuditLogEntry, TaxApiResponse } from '../types';

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'create':
      return 'Create';
    case 'update':
      return 'Update';
    case 'delete':
      return 'Delete';
    case 'submit':
      return 'Submit';
    case 'approve':
      return 'Approve';
    case 'reject':
      return 'Reject';
    default:
      return action;
  }
}

function getActionVariant(action: string): string {
  switch (action) {
    case 'create':
      return 'success';
    case 'update':
      return 'info';
    case 'delete':
      return 'error';
    case 'submit':
      return 'warning';
    case 'approve':
      return 'success';
    case 'reject':
      return 'error';
    default:
      return 'default';
  }
}

function getEntityTypeLabel(type: string): string {
  switch (type) {
    case 'filing':
      return 'Filing';
    case 'estimate':
      return 'Estimate';
    case 'registration':
      return 'Registration';
    case 'rate':
      return 'Rate';
    default:
      return type;
  }
}

export function AuditLogPage() {
  const { getAccessToken } = useAuth();

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const token = await getAccessToken();
      const fetchResponse = await fetch(`${apiConfig.mcpGatewayUrl}/api/tax/audit-log`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result: TaxApiResponse<AuditLogEntry[]> = await fetchResponse.json();
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result;
    },
  });

  const logs = response?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-gray-500 mt-1">Compliance audit trail for tax activities</p>
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message || 'Failed to load audit log'} />}

      {!isLoading && !error && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={getActionVariant(log.action)}>
                        {getActionLabel(log.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {getEntityTypeLabel(log.entityType)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{log.userName}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                      {log.ipAddress || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm max-w-xs truncate">
                      {log.notes || (log.newValue ? JSON.stringify(log.newValue).substring(0, 50) + '...' : '-')}
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

export default AuditLogPage;
