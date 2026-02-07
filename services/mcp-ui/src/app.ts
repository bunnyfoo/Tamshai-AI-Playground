/**
 * MCP UI Service - Express Application
 *
 * Provides the Generative UI service for rendering AI-driven components.
 */
import express, { Request, Response, NextFunction } from 'express';
import { displayRouter } from './routes/display';

const app = express();

// JSON body parser middleware
app.use(express.json());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'mcp-ui',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Display API routes
app.use('/api/display', displayRouter);

// 404 handler for unknown routes - must be after all other routes
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: 'Route not found',
    suggestedAction:
      'Check the API documentation for available endpoints. Valid endpoints include: GET /health, POST /api/display',
  });
});

export { app };
