import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, apiConfig, canModifyHR } from '@tamshai/auth';
import { ApprovalCard, TruncationWarning } from '@tamshai/ui';
import type { TimeOffBalance, TimeOffRequest, APIResponse } from '../types';

/**
 * Time-Off Management Page
 *
 * Features:
 * - View personal time-off balances
 * - Submit time-off requests
 * - View request history
 * - Managers can approve/reject team requests
 * - HR can view all requests
 */
export default function TimeOffPage() {
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'balances' | 'requests' | 'team'>('balances');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    confirmationId: string;
    message: string;
    action: 'approve' | 'reject';
    request: TimeOffRequest;
  } | null>(null);

  const canWrite = canModifyHR(userContext);
  const isManager = userContext?.roles?.includes('manager') || canWrite;

  // Fetch time-off balances for current user
  const { data: balancesResponse, isLoading: loadingBalances } = useQuery({
    queryKey: ['time-off-balances'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/get_time_off_balances`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch balances');
      return response.json() as Promise<APIResponse<TimeOffBalance[]>>;
    },
  });

  // Fetch time-off requests (own or team based on tab)
  const { data: requestsResponse, isLoading: loadingRequests } = useQuery({
    queryKey: ['time-off-requests', activeTab],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const endpoint = activeTab === 'team'
        ? '/api/mcp/hr/list_team_time_off_requests'
        : '/api/mcp/hr/list_time_off_requests';

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}${endpoint}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch requests');
      return response.json() as Promise<APIResponse<TimeOffRequest[]>>;
    },
    enabled: activeTab !== 'balances',
  });

  // Submit time-off request mutation
  const submitRequestMutation = useMutation({
    mutationFn: async (requestData: {
      type_code: string;
      start_date: string;
      end_date: string;
      notes?: string;
    }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/create_time_off_request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestData),
        }
      );

      if (!response.ok) throw new Error('Failed to submit request');
      return response.json() as Promise<APIResponse<TimeOffRequest>>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
      queryClient.invalidateQueries({ queryKey: ['time-off-balances'] });
      setShowRequestForm(false);
    },
  });

  // Approve/reject mutation
  const approveRejectMutation = useMutation({
    mutationFn: async ({ requestId, approved, comments }: {
      requestId: string;
      approved: boolean;
      comments?: string;
    }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/hr/approve_time_off_request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ requestId, approved, comments }),
        }
      );

      if (!response.ok) throw new Error('Failed to process request');
      return response.json() as Promise<APIResponse<TimeOffRequest>>;
    },
    onSuccess: (data) => {
      if (data.status === 'pending_confirmation') {
        // This would trigger approval card flow if backend returns it
        console.log('Pending confirmation:', data);
      } else {
        queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
      }
    },
  });

  const handleApprove = (request: TimeOffRequest) => {
    if (confirm(`Approve time-off request for ${request.employee_name}?`)) {
      approveRejectMutation.mutate({ requestId: request.request_id, approved: true });
    }
  };

  const handleReject = (request: TimeOffRequest) => {
    const comments = prompt(`Reject time-off request for ${request.employee_name}? Enter reason:`);
    if (comments !== null) {
      approveRejectMutation.mutate({ requestId: request.request_id, approved: false, comments });
    }
  };

  const handleConfirmationComplete = (success: boolean) => {
    setPendingConfirmation(null);
    if (success) {
      queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
    }
  };

  const balances = balancesResponse?.data || [];
  const requests = requestsResponse?.data || [];
  const isTruncated = requestsResponse?.metadata?.truncated || requestsResponse?.metadata?.hasMore;

  // Calculate total available days
  const totalAvailable = balances.reduce((sum, b) => sum + b.available, 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="page-title">Time Off</h2>
            <p className="page-subtitle">
              Manage your time-off requests and balances
            </p>
          </div>
          <button
            onClick={() => setShowRequestForm(true)}
            className="btn-primary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Request Time Off
          </button>
        </div>
      </div>

      {/* Pending Confirmation */}
      {pendingConfirmation && (
        <div className="mb-6">
          <ApprovalCard
            confirmationId={pendingConfirmation.confirmationId}
            message={pendingConfirmation.message}
            confirmationData={{
              action: pendingConfirmation.action,
              requestId: pendingConfirmation.request.request_id,
              employeeName: pendingConfirmation.request.employee_name,
            }}
            onComplete={handleConfirmationComplete}
          />
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="text-sm font-medium text-secondary-500 uppercase tracking-wide">
            Total Available
          </div>
          <div className="text-3xl font-bold text-secondary-900 mt-1">
            {totalAvailable.toFixed(1)} days
          </div>
        </div>
        {balances.slice(0, 3).map((balance) => (
          <div key={balance.type_code} className="card">
            <div className="text-sm font-medium text-secondary-500 uppercase tracking-wide">
              {balance.type_name}
            </div>
            <div className="text-3xl font-bold text-secondary-900 mt-1">
              {balance.available.toFixed(1)}
            </div>
            <div className="text-sm text-secondary-500 mt-1">
              of {balance.entitlement || balance.annual_entitlement || 0} days
            </div>
            <div className="mt-2 w-full bg-secondary-200 rounded-full h-2">
              <div
                className="bg-primary-500 h-2 rounded-full"
                style={{ width: `${Math.min(100, (balance.available / (balance.entitlement || balance.annual_entitlement || 1)) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-secondary-200">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px ${
            activeTab === 'balances'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-secondary-600 hover:text-secondary-900'
          }`}
        >
          My Balances
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px ${
            activeTab === 'requests'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-secondary-600 hover:text-secondary-900'
          }`}
        >
          My Requests
        </button>
        {isManager && (
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 font-medium text-sm border-b-2 -mb-px ${
              activeTab === 'team'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-secondary-600 hover:text-secondary-900'
            }`}
          >
            Team Requests
            {requests.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-warning-100 text-warning-800 rounded-full">
                {requests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'balances' && (
        <div className="card overflow-hidden">
          {loadingBalances ? (
            <div className="py-12 text-center">
              <div className="spinner mb-4"></div>
              <p className="text-secondary-600">Loading balances...</p>
            </div>
          ) : balances.length === 0 ? (
            <div className="py-12 text-center text-secondary-600">
              <p>No time-off balances found</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="table-header">Type</th>
                  <th className="table-header text-right">Annual</th>
                  <th className="table-header text-right">Carryover</th>
                  <th className="table-header text-right">Used</th>
                  <th className="table-header text-right">Pending</th>
                  <th className="table-header text-right">Available</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {balances.map((balance) => (
                  <tr key={balance.type_code} className="table-row">
                    <td className="table-cell font-medium">{balance.type_name}</td>
                    <td className="table-cell text-right">{balance.entitlement || balance.annual_entitlement || 0}</td>
                    <td className="table-cell text-right">{balance.carryover}</td>
                    <td className="table-cell text-right">{balance.used}</td>
                    <td className="table-cell text-right text-warning-600">{balance.pending}</td>
                    <td className="table-cell text-right font-bold text-primary-600">{balance.available}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(activeTab === 'requests' || activeTab === 'team') && (
        <>
          {isTruncated && requestsResponse?.metadata && (
            <div className="mb-4">
              <TruncationWarning
                message="More requests exist than can be shown."
                returnedCount={requestsResponse.metadata.returnedCount || 50}
                totalEstimate={requestsResponse.metadata.totalEstimate || '50+'}
              />
            </div>
          )}

          <div className="card overflow-hidden">
            {loadingRequests ? (
              <div className="py-12 text-center">
                <div className="spinner mb-4"></div>
                <p className="text-secondary-600">Loading requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="py-12 text-center text-secondary-600">
                <p>No time-off requests found</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    {activeTab === 'team' && <th className="table-header">Employee</th>}
                    <th className="table-header">Type</th>
                    <th className="table-header">Dates</th>
                    <th className="table-header text-center">Days</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Submitted</th>
                    {activeTab === 'team' && <th className="table-header">Actions</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-secondary-200">
                  {requests.map((request) => (
                    <tr key={request.request_id} className="table-row">
                      {activeTab === 'team' && (
                        <td className="table-cell font-medium">{request.employee_name}</td>
                      )}
                      <td className="table-cell">{request.type_name}</td>
                      <td className="table-cell">
                        {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                      </td>
                      <td className="table-cell text-center">{request.total_days}</td>
                      <td className="table-cell">
                        <span className={`badge-${
                          request.status === 'approved' ? 'success' :
                          request.status === 'rejected' ? 'danger' :
                          request.status === 'pending' ? 'warning' :
                          'secondary'
                        }`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="table-cell text-secondary-500">
                        {new Date(request.created_at).toLocaleDateString()}
                      </td>
                      {activeTab === 'team' && (
                        <td className="table-cell">
                          {request.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={approveRejectMutation.isPending}
                                className="text-success-600 hover:text-success-700 text-sm font-medium disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(request)}
                                disabled={approveRejectMutation.isPending}
                                className="text-danger-600 hover:text-danger-700 text-sm font-medium disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Request Form Modal */}
      {showRequestForm && (
        <TimeOffRequestForm
          onClose={() => setShowRequestForm(false)}
          onSubmit={(data) => submitRequestMutation.mutate(data)}
          isSubmitting={submitRequestMutation.isPending}
          balances={balances}
        />
      )}
    </div>
  );
}

/**
 * Time-Off Request Form Modal
 */
function TimeOffRequestForm({
  onClose,
  onSubmit,
  isSubmitting,
  balances,
}: {
  onClose: () => void;
  onSubmit: (data: { type_code: string; start_date: string; end_date: string; notes?: string }) => void;
  isSubmitting: boolean;
  balances: TimeOffBalance[];
}) {
  const [typeCode, setTypeCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeCode || !startDate || !endDate) return;
    onSubmit({ type_code: typeCode, start_date: startDate, end_date: endDate, notes: notes || undefined });
  };

  const selectedBalance = balances.find(b => b.type_code === typeCode);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">Request Time Off</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Time Off Type
              </label>
              <select
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}
                className="input w-full"
                required
              >
                <option value="">Select type...</option>
                {balances.map((balance) => (
                  <option key={balance.type_code} value={balance.type_code}>
                    {balance.type_name} ({balance.available} days available)
                  </option>
                ))}
              </select>
            </div>

            {selectedBalance && (
              <div className="p-3 bg-primary-50 rounded-lg">
                <div className="text-sm text-primary-700">
                  Available: <span className="font-bold">{selectedBalance.available} days</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="input w-full"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input w-full"
                rows={3}
                placeholder="Any additional details..."
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-secondary-50 border-t border-secondary-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !typeCode || !startDate || !endDate}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
