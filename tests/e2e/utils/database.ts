/**
 * E2E Database Utilities
 *
 * Provides database snapshot and rollback capabilities for E2E tests.
 * Enables state isolation between tests to ensure deterministic outcomes.
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Uses MCP Gateway Admin API for snapshot/rollback operations.
 * The admin API is protected by X-Admin-Key header.
 */

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';

// Dev environment uses self-signed certificates; allow Node.js fetch to connect
if (ENV === 'dev') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const API_BASE_URLS: Record<string, string> = {
  dev: 'https://www.tamshai-playground.local:8443/api/admin',
  stage: 'https://www.tamshai.com/api/admin',
  prod: 'https://app.tamshai.com/api/admin',
};

// Admin API key (matches MCP Gateway configuration)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'e2e-test-admin-key';

// API timeout for database operations (snapshots can take time)
const API_TIMEOUT = 60000; // 60 seconds

interface SnapshotResponse {
  status: 'success' | 'error';
  data?: {
    snapshotId: string;
    timestamp: string;
    databases: string[];
  };
  code?: string;
  message?: string;
}

interface RollbackResponse {
  status: 'success' | 'error';
  data?: {
    snapshotId: string;
    restoredDatabases: string[];
    timestamp: string;
  };
  code?: string;
  message?: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  snapshotDir: string;
  snapshotCount: string;
}

/**
 * Make authenticated request to admin API
 */
async function adminRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URLS[ENV]}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_API_KEY,
        ...options.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        errorBody.message || `Admin API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Admin API timeout after ${API_TIMEOUT}ms`);
    }

    throw error;
  }
}

/**
 * Create a database snapshot for test state isolation
 *
 * Creates point-in-time snapshots of the test databases using the
 * MCP Gateway Admin API. The snapshot can later be restored using
 * rollbackToSnapshot().
 *
 * @param databases - Optional array of database names to snapshot
 *                    Defaults to all domain databases
 * @returns Promise<string> - Snapshot ID for later rollback
 *
 * @example
 * ```typescript
 * let snapshotId: string;
 *
 * test.beforeAll(async () => {
 *   snapshotId = await createDatabaseSnapshot();
 * });
 *
 * test.afterEach(async () => {
 *   await rollbackToSnapshot(snapshotId);
 * });
 * ```
 */
export async function createDatabaseSnapshot(
  databases?: string[]
): Promise<string> {
  const timestamp = new Date().toISOString();

  try {
    const response = await adminRequest<SnapshotResponse>('/snapshots', {
      method: 'POST',
      body: databases ? JSON.stringify({ databases }) : undefined,
    });

    if (response.status === 'error') {
      throw new Error(response.message || 'Failed to create snapshot');
    }

    const snapshotId = response.data?.snapshotId || '';

    console.log(`[DB Snapshot] Created: ${snapshotId}`);
    console.log(`  Timestamp: ${response.data?.timestamp}`);
    console.log(`  Databases: ${response.data?.databases?.join(', ')}`);

    return snapshotId;
  } catch (error) {
    console.warn(`[DB Snapshot] Snapshot not available (admin API may not be configured): ${error instanceof Error ? error.message : error}`);
    console.warn(`[DB Snapshot] Tests will run without state isolation`);
    return `noop-${Date.now()}`;
  }
}

/**
 * Rollback database to a previous snapshot
 *
 * Restores database state to the point when the snapshot was created.
 * This ensures test isolation - changes made during a test are reverted.
 *
 * @param snapshotId - The snapshot ID returned from createDatabaseSnapshot
 *
 * @example
 * ```typescript
 * test.afterEach(async () => {
 *   await rollbackToSnapshot(snapshotId);
 * });
 * ```
 */
export async function rollbackToSnapshot(snapshotId: string): Promise<void> {
  try {
    const response = await adminRequest<RollbackResponse>(
      `/snapshots/${snapshotId}/rollback`,
      { method: 'POST' }
    );

    if (response.status === 'error') {
      throw new Error(response.message || 'Failed to rollback snapshot');
    }

    console.log(`[DB Rollback] Restored: ${snapshotId}`);
    console.log(`  Databases: ${response.data?.restoredDatabases?.join(', ')}`);
  } catch (error) {
    if (snapshotId.startsWith('noop-')) return; // Snapshot wasn't created, skip rollback
    console.warn(`[DB Rollback] Rollback not available: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Seed test data for a specific test scenario
 *
 * Inserts pre-defined test data for specific test cases.
 * Use this when tests need specific data configurations.
 *
 * @param scenario - The test scenario name (e.g., 'invoice-bulk-approval', 'lead-conversion')
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await seedTestData('invoice-bulk-approval');
 * });
 * ```
 */
export async function seedTestData(scenario: string): Promise<void> {
  console.log(`[DB Seed] Seeding data for scenario: ${scenario}`);

  try {
    await adminRequest(`/seed/${scenario}`, { method: 'POST' });
    console.log(`[DB Seed] Completed: ${scenario}`);
  } catch (error) {
    console.warn(`[DB Seed] Seed not available for ${scenario}: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Clear test data for a specific domain
 *
 * Removes all test data from a domain's database tables.
 * Use this for cleanup after tests that create large amounts of data.
 *
 * @param domain - The domain to clear (e.g., 'finance', 'hr', 'sales')
 *
 * @example
 * ```typescript
 * test.afterAll(async () => {
 *   await clearTestData('finance');
 * });
 * ```
 */
export async function clearTestData(domain: string): Promise<void> {
  console.log(`[DB Clear] Clearing test data for domain: ${domain}`);

  try {
    await adminRequest(`/clear/${domain}`, { method: 'POST' });
    console.log(`[DB Clear] Completed: ${domain}`);
  } catch (error) {
    console.warn(`[DB Clear] Clear not available for ${domain}: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Get current database state hash
 *
 * Returns a hash of the current database state for verification.
 * Useful for checking if data has changed during a test.
 *
 * @param domain - The domain to hash (e.g., 'finance', 'hr')
 * @returns Promise<string> - Hash of the database state
 *
 * @example
 * ```typescript
 * const hashBefore = await getDatabaseStateHash('finance');
 * // ... run test ...
 * const hashAfter = await getDatabaseStateHash('finance');
 * expect(hashBefore).not.toBe(hashAfter); // Data changed
 * ```
 */
export async function getDatabaseStateHash(_domain: string): Promise<string> {
  throw new Error('getDatabaseStateHash() is not implemented. Implement the /hash admin API endpoint first.');
}

/**
 * Wait for database to be ready
 *
 * Polls the database health endpoint until ready or timeout.
 * Use at the start of test suites to ensure database availability.
 *
 * @param timeout - Maximum wait time in milliseconds (default: 30000)
 *
 * @example
 * ```typescript
 * test.beforeAll(async () => {
 *   await waitForDatabaseReady(60000);
 * });
 * ```
 */
export async function waitForDatabaseReady(timeout: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await adminRequest<HealthResponse>('/health');

      if (response.status === 'healthy') {
        console.log(`[DB Health] Database ready`);
        return;
      }
    } catch {
      // API not ready yet, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`[DB Health] Database not ready after ${timeout}ms`);
}

/**
 * Delete a specific snapshot
 *
 * Cleans up a snapshot and its associated files.
 * Use this to free disk space after tests complete.
 *
 * @param snapshotId - The snapshot ID to delete
 *
 * @example
 * ```typescript
 * test.afterAll(async () => {
 *   await deleteSnapshot(snapshotId);
 * });
 * ```
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  try {
    await adminRequest(`/snapshots/${snapshotId}`, { method: 'DELETE' });
    console.log(`[DB Snapshot] Deleted: ${snapshotId}`);
  } catch (error) {
    console.warn(`[DB Snapshot] Failed to delete ${snapshotId}:`, error);
    // Don't throw - deletion failure shouldn't block tests
  }
}

/**
 * List all available snapshots
 *
 * Returns a list of all snapshots currently stored.
 * Useful for debugging or cleanup operations.
 *
 * @returns Promise<Array> - List of snapshot metadata
 */
export async function listSnapshots(): Promise<Array<{
  id: string;
  timestamp: string;
  databases: string[];
}>> {
  try {
    interface ListResponse {
      status: string;
      data: Array<{ id: string; timestamp: string; databases: string[] }>;
    }
    const response = await adminRequest<ListResponse>('/snapshots');
    return response.data || [];
  } catch (error) {
    console.warn(`[DB Snapshot] Failed to list snapshots:`, error);
    return [];
  }
}
