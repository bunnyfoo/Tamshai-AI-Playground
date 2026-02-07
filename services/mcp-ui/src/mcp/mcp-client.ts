/**
 * MCP Client - Implementation
 *
 * This module provides the client for calling MCP tools via the MCP Gateway.
 * The gateway handles routing to appropriate MCP servers based on the server name.
 *
 * TDD Phase: GREEN - Full implementation to pass all tests
 */

import axios from 'axios';

/**
 * Represents an MCP tool call configuration.
 */
export interface MCPCall {
  /** The MCP server to call (e.g., 'hr', 'finance', 'sales') */
  server: string;
  /** The tool name to invoke (e.g., 'get_org_chart', 'list_employees') */
  tool: string;
  /** Maps tool parameter names to directive parameter names */
  paramMap: Record<string, string>;
}

/**
 * User context for authorization headers.
 */
export interface UserContext {
  /** The user's unique identifier */
  userId: string;
  /** Array of roles assigned to the user */
  roles: string[];
  /** Optional username */
  username?: string;
  /** Optional email */
  email?: string;
}

/**
 * MCP Tool Response - discriminated union for success/error/pending states.
 */
export type MCPToolResponse =
  | { status: 'success'; data: any; metadata?: { truncated?: boolean; totalCount?: string } }
  | { status: 'error'; code: string; message: string; suggestedAction: string }
  | { status: 'pending_confirmation'; confirmationId: string; message: string };

/**
 * Calls an MCP tool via the MCP Gateway.
 *
 * @param call - The MCP call configuration (server, tool, paramMap)
 * @param params - The directive parameters to map to tool parameters
 * @param userContext - User context for authorization headers
 * @returns The MCP tool response
 * @throws Error on network or server errors
 *
 * @example
 * const result = await callMCPTool(
 *   { server: 'hr', tool: 'get_org_chart', paramMap: { userId: 'userId' } },
 *   { userId: 'me' },
 *   { userId: 'user-123', roles: ['hr-read'] }
 * );
 */
export async function callMCPTool(
  call: MCPCall,
  params: Record<string, string>,
  userContext: UserContext
): Promise<MCPToolResponse> {
  // Get gateway URL from environment or use default
  const gatewayUrl = process.env.MCP_GATEWAY_URL || 'http://localhost:3110';

  // Construct the full endpoint URL
  const url = `${gatewayUrl}/api/mcp/${call.server}/${call.tool}`;

  // Map directive params to tool params using paramMap
  // paramMap format: { toolParamName: directiveParamName }
  const toolParams: Record<string, string> = {};
  for (const [toolParam, directiveParam] of Object.entries(call.paramMap)) {
    if (params[directiveParam] !== undefined) {
      toolParams[toolParam] = params[directiveParam];
    }
  }

  // Build headers with user context
  const headers: Record<string, string> = {
    'X-User-ID': userContext.userId,
    'X-User-Roles': userContext.roles.join(','),
  };

  // Make the request - let axios throw on network/server errors
  const response = await axios.get(url, {
    params: toolParams,
    headers,
  });

  // Return the response data directly (MCP server handles error responses)
  return response.data;
}
