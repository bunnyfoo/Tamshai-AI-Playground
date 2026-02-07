/**
 * Display Routes - GREEN Phase Implementation
 *
 * Implements the display endpoints for the Generative UI service.
 *
 * Endpoints:
 * - POST /api/display - Process a display directive and return component
 * - GET /api/display/components - List all registered components
 */
import { Router, Request, Response } from 'express';
import { parseDirective } from '../parser/directive-parser';
import { getComponentDefinition, listComponents } from '../registry/component-registry';
import { callMCPTool } from '../mcp/mcp-client';
import { logger } from '../utils/logger';

const router = Router();

interface DisplayRequest {
  directive: string;
  userContext: {
    userId: string;
    roles: string[];
    username?: string;
    email?: string;
  };
}

/**
 * POST /api/display
 * Parse directive, fetch data from MCP servers, return component + narration
 */
router.post('/', async (req: Request, res: Response) => {
  const { directive, userContext } = req.body as DisplayRequest;

  // Validate required fields
  if (!directive || !userContext) {
    const missingField = !directive ? 'directive' : 'userContext';
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELD',
      message: `Missing required field: ${missingField}`,
      suggestedAction: 'Include both directive and userContext in the request body',
    });
  }

  // Parse directive
  const parsed = parseDirective(directive);
  if (!parsed) {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_DIRECTIVE',
      message: `Invalid display directive format: ${directive}`,
      suggestedAction:
        'Use format: display:<domain>:<component>:<params>. Example: display:hr:org_chart:userId=me,depth=1',
    });
  }

  // Look up component definition
  const componentDef = getComponentDefinition(parsed.domain, parsed.component);
  if (!componentDef) {
    return res.status(404).json({
      status: 'error',
      code: 'UNKNOWN_COMPONENT',
      message: `Unknown component: ${parsed.domain}:${parsed.component}`,
      suggestedAction: 'Use GET /api/display/components to see available components',
    });
  }

  try {
    // Call MCP servers for data
    const mcpResults = await Promise.all(
      componentDef.mcpCalls.map((call) => callMCPTool(call, parsed.params, userContext))
    );

    // Merge all MCP response data
    const mergedData: Record<string, unknown> = {};
    for (const result of mcpResults) {
      if (result.status === 'success' && result.data) {
        Object.assign(mergedData, result.data);
      }
    }

    // Transform data for component props
    const props = componentDef.transform(mergedData);

    // Generate narration
    const narration = componentDef.generateNarration(mergedData, parsed.params);

    // Check for truncation in any MCP response
    const truncated = mcpResults.some(
      (r) => r.status === 'success' && r.metadata?.truncated
    );

    return res.json({
      status: 'success',
      component: {
        type: componentDef.type,
        props,
        actions: [], // Actions to be added later
      },
      narration,
      metadata: {
        dataFreshness: new Date().toISOString(),
        truncated,
      },
    });
  } catch (error) {
    logger.error('Error fetching MCP data', { error, directive });
    return res.status(500).json({
      status: 'error',
      code: 'MCP_ERROR',
      message: 'Failed to fetch data from MCP servers',
      suggestedAction: 'Check MCP server availability and try again',
    });
  }
});

/**
 * GET /api/display/components
 * List all available components with directive patterns
 */
router.get('/components', (req: Request, res: Response) => {
  const components = listComponents().map((def) => ({
    type: def.type,
    directivePattern: `display:${def.domain}:${def.component}:<params>`,
    description: def.description || '',
  }));

  return res.json({ components });
});

export { router as displayRouter };
