/**
 * Database Connection
 *
 * PostgreSQL connection pool with Row-Level Security (RLS) support.
 * Uses session variables within transactions for RLS policy evaluation.
 */
import { Pool, QueryResult, QueryResultRow } from 'pg';
import format from 'pg-format';
import { logger } from '../utils/logger';

// User context passed from MCP Gateway
export interface UserContext {
  userId: string;
  username: string;
  email?: string;
  roles: string[];
  departmentId?: string;
  managerId?: string;
}

// Create connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5435', 10),
  database: process.env.POSTGRES_DB || 'tamshai_payroll',
  user: process.env.POSTGRES_USER || 'tamshai',
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Log pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

/**
 * Execute query with Row-Level Security context.
 * Sets session variables that RLS policies can read.
 */
export async function queryWithRLS<T extends QueryResultRow>(
  userContext: UserContext,
  queryText: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Set session variables for RLS policies
    await client.query(
      format('SET LOCAL app.current_user_id = %L', userContext.userId)
    );
    await client.query(
      format('SET LOCAL app.current_user_email = %L', userContext.email || '')
    );
    await client.query(
      format('SET LOCAL app.current_user_roles = %L', userContext.roles.join(','))
    );
    if (userContext.departmentId) {
      await client.query(
        format('SET LOCAL app.current_department_id = %L', userContext.departmentId)
      );
    }
    if (userContext.managerId) {
      await client.query(
        format('SET LOCAL app.current_manager_id = %L', userContext.managerId)
      );
    }

    const result = await client.query<T>(queryText, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute query without RLS context.
 * Use for system queries that don't need user filtering.
 */
export async function queryWithoutRLS<T extends QueryResultRow>(
  queryText: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(queryText, values);
}

/**
 * Check if the database connection is healthy.
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch (error) {
    logger.error('Database connection check failed', { error });
    return false;
  }
}

/**
 * Close the connection pool.
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
