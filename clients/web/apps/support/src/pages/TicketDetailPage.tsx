import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, canModifySupport, apiConfig } from '@tamshai/auth';
import type { Ticket, APIResponse } from '../types';

/**
 * Ticket Detail Page
 *
 * Shows full ticket details with comments and actions
 */
export default function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { userContext, getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = canModifySupport(userContext);
  const [newComment, setNewComment] = useState('');
  const [assignee, setAssignee] = useState('');

  // Fetch ticket details
  const { data: ticketResponse, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/get_ticket?ticketId=${ticketId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Failed to fetch ticket');
      return response.json() as Promise<APIResponse<Ticket>>;
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/add_comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, comment }),
        }
      );
      if (!response.ok) throw new Error('Failed to add comment');
      return response.json();
    },
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  // Assign ticket mutation
  const assignMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${apiConfig.mcpGatewayUrl}/api/mcp/support/assign_ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ticketId, agentId }),
        }
      );
      if (!response.ok) throw new Error('Failed to assign ticket');
      return response.json();
    },
    onSuccess: () => {
      setAssignee('');
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
    },
  });

  const ticket = ticketResponse?.data;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="py-12 text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="page-container">
        <div className="alert-danger">
          <p className="font-medium">Error loading ticket</p>
          <p className="text-sm">{error ? String(error) : 'Ticket not found'}</p>
          <Link to="/" className="btn-primary mt-4 inline-block">
            Back to Tickets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/" className="text-primary-600 hover:underline">
          ← Back to Tickets
        </Link>
      </div>

      {/* Ticket Header */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-secondary-900 mb-2">
              {ticket.title}
            </h1>
            <div className="flex gap-2 items-center">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                {ticket.status.replace('_', ' ')}
              </span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                {ticket.priority}
              </span>
              <span className="text-secondary-500 text-sm">
                Created {new Date(ticket.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-secondary-700 whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>

          {/* Comments */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Comments</h2>

            {ticket.comments && ticket.comments.length > 0 ? (
              <div className="space-y-4 mb-4">
                {ticket.comments.map((comment, index) => (
                  <div key={index} className="border-l-2 border-secondary-200 pl-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-secondary-900">
                        {comment.author || 'Unknown'}
                      </span>
                      <span className="text-xs text-secondary-500">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-secondary-700">{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary-500 mb-4">No comments yet</p>
            )}

            {canWrite && (
              <div className="border-t pt-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="input w-full mb-2"
                  rows={3}
                />
                <button
                  onClick={() => addCommentMutation.mutate(newComment)}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="btn-primary"
                >
                  {addCommentMutation.isPending ? 'Adding...' : 'Add Comment'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Details */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Details</h2>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm text-secondary-500">Ticket ID</dt>
                <dd className="font-mono text-sm">{ticket.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Category</dt>
                <dd>{ticket.category || 'Uncategorized'}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Assigned To</dt>
                <dd>{ticket.assigned_to || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-sm text-secondary-500">Tags</dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {ticket.tags?.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-secondary-100 text-secondary-700 rounded text-xs">
                      {tag}
                    </span>
                  )) || 'None'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          {canWrite && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">Actions</h2>

              {/* Assign to Agent */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Assign to Agent
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="Agent ID or name"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => assignMutation.mutate(assignee)}
                    disabled={!assignee.trim() || assignMutation.isPending}
                    className="btn-primary"
                  >
                    Assign
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
