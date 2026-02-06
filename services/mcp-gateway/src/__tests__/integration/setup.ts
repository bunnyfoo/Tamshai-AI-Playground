/**
 * Integration Test Setup
 *
 * Sets up database connections and test utilities for integration tests.
 * Requires running PostgreSQL and other services.
 *
 * TOTP Handling:
 * - Uses direct access grants which bypass OTP requirement
 * - Does NOT delete any user credentials
 * - Temporarily removes CONFIGURE_TOTP required action (if present)
 * - Restores required actions after tests
 */

import { Client, Pool } from 'pg';
import axios from 'axios';

// Test environment configuration
process.env.NODE_ENV = 'test';

// Keycloak configuration for TOTP handling
// Note: KEYCLOAK_URL should NOT include /auth - we add it where needed
const KEYCLOAK_CONFIG = {
  url: process.env.KEYCLOAK_URL || 'http://127.0.0.1:8190',
  realm: process.env.KEYCLOAK_REALM || 'tamshai-corp',
  adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
};

// Database connection settings from environment or defaults
// IMPORTANT: Use tamshai_app user (not tamshai) to enforce RLS policies
// The tamshai user has BYPASSRLS for sync operations, but tests need RLS enforced
// NOTE: Default port is 5443 to match infrastructure/docker/docker-compose.yml
//
// Password precedence for tamshai_app user:
// 1. TAMSHAI_APP_PASSWORD (explicit app user password)
// 2. 'changeme' (matches CREATE ROLE in sample-data/*.sql)
// Note: POSTGRES_PASSWORD is the postgres superuser password, NOT tamshai_app
const DB_CONFIG_HR = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5443'),
  database: process.env.POSTGRES_DB || 'tamshai_hr',
  user: process.env.POSTGRES_USER || 'tamshai_app',
  password: process.env.TAMSHAI_APP_PASSWORD || 'changeme',
};

const DB_CONFIG_FINANCE = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5443'),
  database: 'tamshai_finance',
  user: process.env.POSTGRES_USER || 'tamshai_app',
  password: process.env.TAMSHAI_APP_PASSWORD || 'changeme',
};

// Admin config with tamshai superuser for fixture resets (bypasses RLS)
// Requires TAMSHAI_DB_PASSWORD environment variable
const DB_CONFIG_ADMIN_FINANCE = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5443'),
  database: 'tamshai_finance',
  user: 'tamshai',  // Superuser with BYPASSRLS for fixture resets
  password: process.env.TAMSHAI_DB_PASSWORD,
};

// Default config - HR database (used as default for legacy compatibility)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DB_CONFIG = DB_CONFIG_HR;

// Connection pools for different test users
let adminPool: Pool | null = null;
let adminPoolFinance: Pool | null = null;
let adminPoolFinanceReset: Pool | null = null;  // For fixture resets

// Keycloak admin token for TOTP management
let keycloakAdminToken: string | null = null;

// Storage for user state to restore after tests
const savedUserState: Record<string, { userId: string; requiredActions: string[]; hasOtpCredential: boolean }> = {};

// Test usernames that need TOTP handling
const TEST_USERNAMES = [
  'eve.thompson',
  'alice.chen',
  'bob.martinez',
  'carol.johnson',
  'dan.williams',
  'frank.davis',
  'nina.patel',
  'marcus.johnson',
];

/**
 * Get admin database connection pool for HR database
 */
export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool(DB_CONFIG_HR);
  }
  return adminPool;
}

/**
 * Get admin database connection pool for Finance database
 */
export function getAdminPoolFinance(): Pool {
  if (!adminPoolFinance) {
    adminPoolFinance = new Pool(DB_CONFIG_FINANCE);
  }
  return adminPoolFinance;
}

/**
 * Get admin database connection pool for Finance database with BYPASSRLS
 * Use this for fixture resets that need to update all records regardless of RLS
 */
export function getAdminPoolFinanceReset(): Pool {
  if (!adminPoolFinanceReset) {
    adminPoolFinanceReset = new Pool(DB_CONFIG_ADMIN_FINANCE);
  }
  return adminPoolFinanceReset;
}

// Map userId to email for RLS policy lookups
const USER_EMAIL_MAP: Record<string, string> = {
  'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e': 'frank@tamshai-playground.local',
  'e1000000-0000-0000-0000-000000000052': 'marcus.j@tamshai-playground.local',
  'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d': 'nina.p@tamshai-playground.local',
  'f104eddc-21ab-457c-a254-78051ad7ad67': 'alice@tamshai-playground.local',
  '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1': 'bob@tamshai-playground.local',
  'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b': 'eve@tamshai-playground.local',
  'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c': 'carol@tamshai-playground.local',
};

/**
 * Escape a string value for use in SET commands
 * PostgreSQL SET doesn't support parameterized queries, so we escape manually
 */
function escapeSetValue(value: string): string {
  // Escape single quotes by doubling them
  return value.replace(/'/g, "''");
}

/**
 * Create a database client with specific user context
 * Simulates RLS by setting session variables
 * @param database - 'hr' or 'finance' to select database (defaults to 'hr')
 */
export async function createUserClient(
  userId: string,
  roles: string[],
  department?: string,
  email?: string,
  database: 'hr' | 'finance' = 'hr'
): Promise<Client> {
  const config = database === 'finance' ? DB_CONFIG_FINANCE : DB_CONFIG_HR;
  const client = new Client(config);
  await client.connect();

  // Look up email from userId if not provided
  const userEmail = email || USER_EMAIL_MAP[userId] || '';

  // Set session variables that RLS policies will check
  // NOTE: SET commands don't support parameterized queries in PostgreSQL,
  // so we escape values manually. Values are internal test data (UUIDs, role names).
  await client.query(`SET app.current_user_id = '${escapeSetValue(userId)}'`);
  await client.query(`SET app.current_user_roles = '${escapeSetValue(roles.join(','))}'`);
  if (department) {
    await client.query(`SET app.current_user_department = '${escapeSetValue(department)}'`);
  }
  if (userEmail) {
    await client.query(`SET app.current_user_email = '${escapeSetValue(userEmail)}'`);
  }

  return client;
}

/**
 * Create a database client for finance database with specific user context
 * Convenience wrapper for createUserClient with database='finance'
 */
export async function createFinanceUserClient(
  userId: string,
  roles: string[],
  department?: string,
  email?: string
): Promise<Client> {
  return createUserClient(userId, roles, department, email, 'finance');
}

/**
 * Test user configurations matching keycloak test users and actual database records
 * Employee IDs and emails must match hr-data.sql for RLS policies to work correctly
 */
export const TEST_USERS = {
  // Intern - lowest privilege (self-only access)
  // Frank Davis: IT Intern
  intern: {
    userId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e',
    username: 'frank.davis',
    email: 'frank@tamshai-playground.local',
    roles: ['user'],
    department: 'IT',
    employeeId: 'b6c7d8e9-0f1a-2b3c-4d5e-6f7a8b9c0d1e',
  },
  // Regular employee
  // Marcus Johnson: Software Engineer (reports to Nina Patel)
  employee: {
    userId: 'e1000000-0000-0000-0000-000000000052',
    username: 'marcus.johnson',
    email: 'marcus.j@tamshai-playground.local',
    roles: ['user'],
    department: 'Engineering',
    employeeId: 'e1000000-0000-0000-0000-000000000052',
  },
  // Manager - can see direct reports
  // Nina Patel: Engineering Manager (has Marcus, Sophia, Tyler, etc. as reports)
  manager: {
    userId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
    username: 'nina.patel',
    email: 'nina.p@tamshai-playground.local',
    roles: ['manager'],
    department: 'Engineering',
    employeeId: 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d',
  },
  // HR Read - can see all employees
  // Alice Chen: VP of Human Resources
  hrRead: {
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    username: 'alice.chen',
    email: 'alice@tamshai-playground.local',
    roles: ['hr-read'],
    department: 'HR',
    employeeId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
  },
  // HR Write - full HR access
  // Alice Chen: VP of Human Resources (same person, different role combo)
  hrWrite: {
    userId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
    username: 'alice.chen',
    email: 'alice@tamshai-playground.local',
    roles: ['hr-read', 'hr-write'],
    department: 'HR',
    employeeId: 'f104eddc-21ab-457c-a254-78051ad7ad67',
  },
  // Finance Read - can see finance data
  // Bob Martinez: Finance Director
  financeRead: {
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    username: 'bob.martinez',
    email: 'bob@tamshai-playground.local',
    roles: ['finance-read'],
    department: 'FIN',  // Use department code as in finance RLS
    employeeId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
  },
  // Finance Write - full finance access
  // Bob Martinez: Finance Director (same person, different role combo)
  financeWrite: {
    userId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
    username: 'bob.martinez',
    email: 'bob@tamshai-playground.local',
    roles: ['finance-read', 'finance-write'],
    department: 'FIN',
    employeeId: '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1',
  },
  // Executive - cross-department access
  // Eve Thompson: CEO
  executive: {
    userId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
    username: 'eve.thompson',
    email: 'eve@tamshai-playground.local',
    roles: ['executive'],
    department: 'Executive',
    employeeId: 'e9f0a1b2-3c4d-5e6f-7a8b-9c0d1e2f3a4b',
  },
  // Sales - for cross-schema tests
  // Carol Johnson: VP of Sales
  sales: {
    userId: 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c',
    username: 'carol.johnson',
    email: 'carol@tamshai-playground.local',
    roles: ['sales-read', 'sales-write'],
    department: 'Sales',
    employeeId: 'c0e1c8a4-5d6e-4f9b-8a3c-7e2d1f0b9a8c',
  },
};

// ============================================================================
// Keycloak TOTP Management Functions
// ============================================================================

interface KeycloakCredential {
  type: string;
  id: string;
}

interface KeycloakUser {
  id: string;
  username: string;
  requiredActions: string[];
}

/**
 * Get admin token from Keycloak master realm
 */
async function getKeycloakAdminToken(): Promise<string> {
  const response = await axios.post(
    `${KEYCLOAK_CONFIG.url}/auth/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      client_id: 'admin-cli',
      username: 'admin',
      password: KEYCLOAK_CONFIG.adminPassword,
      grant_type: 'password',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

/**
 * Get user ID by username
 */
async function getUserId(username: string): Promise<string | null> {
  const response = await axios.get<KeycloakUser[]>(
    `${KEYCLOAK_CONFIG.url}/auth/admin/realms/${KEYCLOAK_CONFIG.realm}/users`,
    {
      params: { username },
      headers: { Authorization: `Bearer ${keycloakAdminToken}` },
    }
  );
  return response.data[0]?.id || null;
}

/**
 * Get user details
 */
async function getUser(userId: string): Promise<KeycloakUser> {
  const response = await axios.get<KeycloakUser>(
    `${KEYCLOAK_CONFIG.url}/auth/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${userId}`,
    { headers: { Authorization: `Bearer ${keycloakAdminToken}` } }
  );
  return response.data;
}

/**
 * Get user's credentials
 */
async function getUserCredentials(userId: string): Promise<KeycloakCredential[]> {
  const response = await axios.get<KeycloakCredential[]>(
    `${KEYCLOAK_CONFIG.url}/auth/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${userId}/credentials`,
    { headers: { Authorization: `Bearer ${keycloakAdminToken}` } }
  );
  return response.data;
}

/**
 * Update user's required actions
 */
async function updateUserRequiredActions(userId: string, requiredActions: string[]): Promise<void> {
  await axios.put(
    `${KEYCLOAK_CONFIG.url}/auth/admin/realms/${KEYCLOAK_CONFIG.realm}/users/${userId}`,
    { requiredActions },
    {
      headers: {
        Authorization: `Bearer ${keycloakAdminToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Prepare a single test user for automated testing
 * @returns Result message for logging
 */
async function prepareSingleUser(username: string): Promise<string> {
  const userId = await getUserId(username);
  if (!userId) {
    return `⚠️  User ${username} not found, skipping`;
  }

  const user = await getUser(userId);
  const currentActions = user.requiredActions || [];

  // Check if user has existing OTP credential
  const credentials = await getUserCredentials(userId);
  const hasOtpCredential = credentials.some((c) => c.type === 'otp');

  // Save current state for restoration
  savedUserState[username] = {
    userId,
    requiredActions: [...currentActions],
    hasOtpCredential,
  };

  const messages: string[] = [];

  // Remove CONFIGURE_TOTP from required actions if present
  if (currentActions.includes('CONFIGURE_TOTP')) {
    const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
    await updateUserRequiredActions(userId, newActions);
    messages.push(`✅ ${username}: Temporarily removed CONFIGURE_TOTP requirement`);
  } else {
    messages.push(`ℹ️  ${username}: No CONFIGURE_TOTP requirement to remove`);
  }

  if (hasOtpCredential) {
    messages.push(`📱 ${username}: Has existing OTP credential (will be preserved)`);
  }

  return messages.join('\n   ');
}

/**
 * Prepare test users for automated testing (PARALLELIZED)
 *
 * IMPORTANT: We do NOT delete OTP credentials!
 * We only temporarily remove CONFIGURE_TOTP from required actions.
 * The mcp-gateway client uses direct access grants which bypass OTP.
 */
async function prepareTestUsers(): Promise<void> {
  console.log('\n🔐 Preparing test users for automated testing (parallelized)...');
  console.log('   (OTP credentials are preserved - only required actions are modified)\n');

  // Process all users in parallel for faster setup
  const results = await Promise.all(
    TEST_USERNAMES.map(async (username) => {
      try {
        return await prepareSingleUser(username);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ Error preparing ${username}: ${message}`;
      }
    })
  );

  // Log all results
  results.forEach((result) => console.log(`   ${result}`));
}

/**
 * Restore a single test user's TOTP requirement
 * @returns Result message for logging
 */
async function restoreSingleUser(username: string): Promise<string> {
  const saved = savedUserState[username];
  if (!saved) {
    return `⚠️  No saved state for ${username}, skipping`;
  }

  const { userId } = saved;

  // Check current OTP credential status
  const currentCredentials = await getUserCredentials(userId);
  const hasOtpCredential = currentCredentials.some((c) => c.type === 'otp');

  // Get current user state
  const user = await getUser(userId);
  const currentActions = user.requiredActions || [];

  if (hasOtpCredential) {
    // User has OTP credential - they don't need CONFIGURE_TOTP
    // Remove it if present (they can just use their existing authenticator)
    if (currentActions.includes('CONFIGURE_TOTP')) {
      const newActions = currentActions.filter((a) => a !== 'CONFIGURE_TOTP');
      await updateUserRequiredActions(userId, newActions);
    }
    return `✅ ${username}: Has OTP credential, TOTP ready to use`;
  } else {
    // User has no OTP credential - add CONFIGURE_TOTP so they're prompted
    if (!currentActions.includes('CONFIGURE_TOTP')) {
      const newActions = [...currentActions, 'CONFIGURE_TOTP'];
      await updateUserRequiredActions(userId, newActions);
      return `🔒 ${username}: Added CONFIGURE_TOTP (will be prompted on next login)`;
    } else {
      return `🔒 ${username}: CONFIGURE_TOTP already required`;
    }
  }
}

/**
 * Restore TOTP requirement for all test users (PARALLELIZED)
 *
 * After QA testing, TOTP should be re-enabled for all users:
 * - If user has OTP credential: No action needed (they can use their authenticator)
 * - If user has no OTP credential: Add CONFIGURE_TOTP (they'll be prompted on next login)
 */
async function restoreTestUsers(): Promise<void> {
  console.log('\n🔐 Re-enabling TOTP requirement for all test users (parallelized)...');

  // Refresh admin token in case it expired during long tests
  try {
    keycloakAdminToken = await getKeycloakAdminToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('   ❌ Failed to refresh admin token:', message);
    return;
  }

  // Process all users in parallel for faster teardown
  const results = await Promise.all(
    TEST_USERNAMES.map(async (username) => {
      try {
        return await restoreSingleUser(username);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ Error restoring ${username}: ${message}`;
      }
    })
  );

  // Log all results
  results.forEach((result) => console.log(`   ${result}`));
  console.log('\n   ✅ TOTP requirement restored for all users');
}

// Increase timeout for slow database operations
jest.setTimeout(30000);

/**
 * Reset budget test fixtures to their initial states
 *
 * This function resets all test fixture budgets to their original states
 * before each test run, ensuring tests are isolated and repeatable.
 *
 * Test Fixtures Reset:
 * - BUD-TEST-PENDING-* : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-REJECT-1  : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-AUDIT-*   : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-RULES-1   : Reset to PENDING_APPROVAL, submitted by nina.patel
 * - BUD-TEST-SOD       : Reset to PENDING_APPROVAL, submitted by bob.martinez
 * - BUD-ENG-2024-SAL   : Reset to DRAFT, no submitter
 * - BUD-MKT-2024-MKT   : Reset to DRAFT, no submitter
 *
 * Also cleans up budget_approval_history for test fixtures to avoid
 * duplicate audit entries.
 */
export async function resetBudgetTestFixtures(): Promise<void> {
  // Use admin pool with BYPASSRLS to reset fixtures
  const pool = getAdminPoolFinanceReset();

  // User IDs (from TEST_USERS)
  const ninaPatelId = 'a5b6c7d8-9e0f-1a2b-3c4d-5e6f7a8b9c0d'; // manager
  const bobMartinezId = '1e8f62b4-37a5-4e67-bb91-45d1e9e3a0f1'; // financeWrite

  // Reset PENDING_APPROVAL fixtures (submitted by nina.patel)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'PENDING_APPROVAL',
        submitted_by = $1::uuid,
        submitted_at = NOW() - interval '1 day',
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id IN (
      'BUD-TEST-PENDING-1', 'BUD-TEST-PENDING-2', 'BUD-TEST-PENDING-3',
      'BUD-TEST-REJECT-1', 'BUD-TEST-AUDIT-1', 'BUD-TEST-AUDIT-2',
      'BUD-TEST-AUDIT-3', 'BUD-TEST-RULES-1'
    )
  `, [ninaPatelId]);

  // Reset SOD fixture (submitted by bob.martinez for separation of duties test)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'PENDING_APPROVAL',
        submitted_by = $1::uuid,
        submitted_at = NOW() - interval '2 days',
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id = 'BUD-TEST-SOD'
  `, [bobMartinezId]);

  // Reset DRAFT fixtures (2024 budgets used in submit_budget tests)
  await pool.query(`
    UPDATE finance.department_budgets
    SET status = 'DRAFT',
        submitted_by = NULL,
        submitted_at = NULL,
        approved_by = NULL,
        approved_at = NULL,
        rejection_reason = NULL,
        version = 1
    WHERE budget_id IN (
      'BUD-ENG-2024-SAL', 'BUD-MKT-2024-MKT', 'BUD-HR-2024-SAL',
      'BUD-FIN-2024-SAL', 'BUD-IT-2024-TECH', 'BUD-SALES-2024-SAL',
      'BUD-EXEC-2024-SAL'
    )
  `);

  // Clean up approval history for test fixtures to avoid duplicate audit entries
  await pool.query(`
    DELETE FROM finance.budget_approval_history
    WHERE budget_id IN (
      SELECT id FROM finance.department_budgets
      WHERE budget_id LIKE 'BUD-TEST-%'
        OR budget_id IN (
          'BUD-ENG-2024-SAL', 'BUD-MKT-2024-MKT', 'BUD-HR-2024-SAL',
          'BUD-FIN-2024-SAL', 'BUD-IT-2024-TECH', 'BUD-SALES-2024-SAL',
          'BUD-EXEC-2024-SAL'
        )
    )
  `);

  console.log('   ✅ Budget test fixtures reset to initial states');
}

// Global setup - prepare test users (remove CONFIGURE_TOTP)
beforeAll(async () => {
  const isCI = process.env.CI === 'true';

  // In CI, skip TOTP handling (Keycloak is ephemeral)
  if (isCI) {
    console.log('\n✅ CI mode - skipping TOTP preparation');
    return;
  }

  try {
    keycloakAdminToken = await getKeycloakAdminToken();
    await prepareTestUsers();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`\n⚠️  Could not prepare test users (Keycloak may not be available): ${message}`);
    console.warn('   Tests requiring Keycloak authentication may fail.\n');
  }
}, 60000);

// Global cleanup - restore test users and close database connections
afterAll(async () => {
  const isCI = process.env.CI === 'true';

  // Restore TOTP for test users (local dev only)
  if (!isCI && keycloakAdminToken) {
    await restoreTestUsers();
  }

  // Close database pools
  if (adminPool) {
    await adminPool.end();
    adminPool = null;
  }
  if (adminPoolFinance) {
    await adminPoolFinance.end();
    adminPoolFinance = null;
  }
  if (adminPoolFinanceReset) {
    await adminPoolFinanceReset.end();
    adminPoolFinanceReset = null;
  }
}, 30000);
