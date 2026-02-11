import { useState, useCallback } from 'react';
import { SSEQueryClient, ComponentRenderer } from '@tamshai/ui';
import { useAuth, apiConfig } from '@tamshai/auth';
import type { ComponentResponse } from '@tamshai/ui/dist/components/generative/types';

/**
 * AI Query Page with Generative UI Support
 *
 * Natural language queries to HR data using SSE streaming (Architecture v1.4)
 *
 * Features:
 * - Server-Sent Events (SSE) for streaming responses
 * - Display directive detection (display:hr:org_chart:...)
 * - Generative UI rendering via ComponentRenderer
 * - Real-time chunk-by-chunk rendering
 * - Prevents 30-60 second timeout during Claude reasoning
 * - Example queries for users
 */
export default function AIQueryPage() {
  const { getAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [componentResponse, setComponentResponse] = useState<ComponentResponse | null>(null);
  const [directiveError, setDirectiveError] = useState<string | null>(null);

  const exampleQueries = [
    'List all employees in Engineering department',
    'Who are the managers in the company?',
    'Show employees hired in the last 6 months',
    'What is the average salary by department?',
    'List all employees reporting to Alice Chen',
  ];

  /**
   * Detect display directives in AI response
   * Format: display:<domain>:<component>:<params>
   * Example: display:hr:org_chart:userId=me,depth=1
   */
  const detectDirective = (text: string): string | null => {
    const directiveRegex = /display:hr:(\w+):([^\s]*)/;
    const match = text.match(directiveRegex);
    return match ? match[0] : null;
  };

  /**
   * Call MCP UI Service to render directive
   */
  const fetchComponentResponse = async (directive: string): Promise<void> => {
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Construct MCP UI Service URL
      let mcpUiUrl: string;
      if (apiConfig.mcpUiUrl) {
        // Use configured MCP UI URL (from VITE_MCP_UI_URL)
        mcpUiUrl = `${apiConfig.mcpUiUrl}/api/display`;
      } else {
        // Fallback to relative URL (proxied through Nginx)
        mcpUiUrl = '/api/mcp-ui/display';
      }

      const response = await fetch(mcpUiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ directive }),
      });

      if (!response.ok) {
        throw new Error(`MCP UI Service error: ${response.status}`);
      }

      const componentData: ComponentResponse = await response.json();
      setComponentResponse(componentData);
      setDirectiveError(null);
    } catch (error) {
      console.error('Failed to fetch component response:', error);
      setDirectiveError(error instanceof Error ? error.message : 'Unknown error');
      setComponentResponse(null);
    }
  };

  /**
   * Handle SSE response completion
   * Check for directives and fetch component if found
   */
  const handleQueryComplete = useCallback(async (response: string) => {
    console.log('Query complete:', response);

    // Reset component state
    setComponentResponse(null);
    setDirectiveError(null);

    // Detect directive
    const directive = detectDirective(response);
    if (directive) {
      console.log('Detected directive:', directive);
      await fetchComponentResponse(directive);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setActiveQuery(query);
      // Reset component state when new query submitted
      setComponentResponse(null);
      setDirectiveError(null);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    setActiveQuery(example);
    // Reset component state
    setComponentResponse(null);
    setDirectiveError(null);
  };

  /**
   * Handle component actions (navigate, drilldown, etc.)
   */
  const handleComponentAction = (action: any) => {
    console.log('Component action:', action);
    // TODO: Implement action handling (navigation, drilldowns)
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">AI-Powered HR Query</h2>
        <p className="page-subtitle">
          Ask natural language questions about employee data with SSE streaming
        </p>
      </div>

      {/* Info Banner */}
      <div className="alert-info mb-6">
        <h4 className="font-semibold mb-1">Architecture v1.4: SSE Streaming</h4>
        <p className="text-sm">
          This page uses Server-Sent Events (SSE) to stream AI responses in
          real-time, preventing timeouts during Claude's 30-60 second reasoning
          process.
        </p>
      </div>

      {/* Query Input */}
      <div className="card mb-6">
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Enter your query
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., List all employees in Engineering department"
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5 inline mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Query
            </button>
          </div>
        </form>

        {/* Example Queries */}
        <div className="mt-4">
          <p className="text-sm font-medium text-secondary-700 mb-2">
            Example queries:
          </p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example) => (
              <button
                key={example}
                onClick={() => handleExampleClick(example)}
                className="text-xs px-3 py-1 bg-secondary-100 hover:bg-secondary-200 text-secondary-700 rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SSE Query Client */}
      {activeQuery && (
        <div className="mb-6">
          <SSEQueryClient
            query={activeQuery}
            autoStart={true}
            onComplete={handleQueryComplete}
            onError={(error) => {
              console.error('Query error:', error);
              setComponentResponse(null);
              setDirectiveError(null);
            }}
          />
        </div>
      )}

      {/* Component Renderer - Display generative UI components */}
      {componentResponse && (
        <div className="mb-6" data-testid="generative-ui-container">
          <div className="card bg-primary-50 border-primary-200">
            <div className="flex items-center gap-2 mb-4">
              <svg
                className="w-5 h-5 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-primary-900">
                Generative UI Component
              </h3>
            </div>
            <ComponentRenderer
              component={componentResponse}
              onAction={handleComponentAction}
              voiceEnabled={false}
            />
          </div>
        </div>
      )}

      {/* Directive Error */}
      {directiveError && (
        <div className="mb-6" data-testid="directive-error">
          <div className="alert-danger">
            <p className="font-medium">Failed to render component</p>
            <p className="text-sm mt-1">{directiveError}</p>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="card bg-secondary-50">
        <h3 className="text-lg font-semibold text-secondary-900 mb-3">
          Query Tips
        </h3>
        <ul className="space-y-2 text-sm text-secondary-700">
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>Be specific:</strong> Include department, job title, or
              date ranges for better results
            </span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>Role-based access:</strong> Results respect your access
              level and permissions
            </span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>50-record limit:</strong> If results exceed 50 records,
              you'll see a truncation warning
            </span>
          </li>
          <li className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>Streaming:</strong> Watch responses appear in real-time
              as Claude processes your query
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
