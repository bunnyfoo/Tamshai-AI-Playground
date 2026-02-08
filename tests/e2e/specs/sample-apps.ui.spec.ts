/**
 * E2E Tests for Phase 2 Sample App Pages
 *
 * Tests the following pages added in Phase 2:
 * - HR: EmployeeProfilePage, OrgChartPage, TimeOffPage
 * - Finance: ARRDashboardPage
 * - Sales: LeadsPage, ForecastingPage
 * - Support: SLAPage, AgentMetricsPage
 *
 * Prerequisites:
 * - ALWAYS run with --workers=1 to avoid TOTP reuse issues
 * - Environment variables:
 *   - TEST_USERNAME: User to authenticate as (default: test-user.journey)
 *   - TEST_USER_PASSWORD: User's password (required)
 *   - TEST_USER_TOTP_SECRET: TOTP secret in BASE32 (optional, auto-captured if not set)
 *
 * test-user.journey Access:
 * - In dev: Has executive role (C-Suite group) for full UX testing
 * - In stage/prod: No data access roles (login journey testing only)
 *
 * See docs/testing/TEST_USER_JOURNEY.md for credential management.
 */

import { test, expect, Page, BrowserContext, Browser } from '@playwright/test';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'tamshai-corp';

const BASE_URLS: Record<string, { site: string; apps: Record<string, string>; keycloak: string }> = {
  dev: {
    site: 'https://www.tamshai-playground.local:8443',
    apps: {
      hr: 'https://www.tamshai-playground.local:8443/hr',
      finance: 'https://www.tamshai-playground.local:8443/finance',
      sales: 'https://www.tamshai-playground.local:8443/sales',
      support: 'https://www.tamshai-playground.local:8443/support',
    },
    keycloak: 'https://www.tamshai-playground.local:8443/auth',
  },
  stage: {
    site: 'https://www.tamshai.com',
    apps: {
      hr: 'https://www.tamshai.com/hr',
      finance: 'https://www.tamshai.com/finance',
      sales: 'https://www.tamshai.com/sales',
      support: 'https://www.tamshai.com/support',
    },
    keycloak: 'https://www.tamshai.com/auth',
  },
};

// Directory for persisting TOTP secrets per environment
const TOTP_SECRETS_DIR = path.join(__dirname, '..', '.totp-secrets');

// Test credentials
const TEST_USER = {
  username: process.env.TEST_USERNAME || 'test-user.journey',
  password: process.env.TEST_USER_PASSWORD || '',
  totpSecret: process.env.TEST_USER_TOTP_SECRET || '',
};

/**
 * Load previously saved TOTP secret from file
 */
function loadTotpSecret(username: string, environment: string): string | null {
  try {
    const secretFile = path.join(TOTP_SECRETS_DIR, `${username}-${environment}.secret`);
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf-8').trim();
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Check if oathtool is available
 */
function isOathtoolAvailable(): boolean {
  try {
    execSync('oathtool --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Track last used TOTP code to avoid reuse
let lastUsedTotpCode: string | null = null;

/**
 * Wait for TOTP to rotate to a new code (if current code was already used)
 */
async function waitForFreshTotp(secret: string): Promise<string> {
  const currentCode = generateTotpCodeInternal(secret);

  if (currentCode === lastUsedTotpCode) {
    // Current code was already used, wait for rotation
    console.log('Waiting for TOTP rotation (30s window)...');
    const startTime = Date.now();
    let newCode = currentCode;

    // Poll every 2 seconds until we get a new code (max 35 seconds)
    while (newCode === lastUsedTotpCode && Date.now() - startTime < 35000) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      newCode = generateTotpCodeInternal(secret);
    }

    if (newCode === lastUsedTotpCode) {
      throw new Error('TOTP code did not rotate after 35 seconds');
    }

    console.log(`TOTP rotated after ${Math.round((Date.now() - startTime) / 1000)}s`);
    return newCode;
  }

  return currentCode;
}

/**
 * Internal TOTP generation (without tracking)
 */
function generateTotpCodeInternal(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required');
  }

  if (isOathtoolAvailable()) {
    try {
      return execSync('oathtool "$TOTP_SECRET"', {
        encoding: 'utf-8',
        env: { ...process.env, TOTP_SECRET: secret },
        shell: '/bin/bash',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // Fall through to otplib
    }
  }

  authenticator.options = { digits: 6, step: 30, algorithm: 'sha1' };
  return authenticator.generate(secret);
}

/**
 * Generate TOTP code (and mark as used)
 */
function generateTotpCode(secret: string): string {
  const code = generateTotpCodeInternal(secret);
  lastUsedTotpCode = code;
  return code;
}

/**
 * Complete Keycloak authentication flow
 */
async function authenticateUser(page: Page): Promise<void> {
  const urls = BASE_URLS[ENV];

  // Throw if no credentials - caller should handle
  if (!TEST_USER.password) {
    throw new Error('No test credentials configured');
  }

  // Navigate to employee login
  await page.goto(`${urls.site}/employee-login.html`);

  // Click SSO button
  const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
  await ssoButton.first().click();

  // Wait for Keycloak login page
  await page.waitForSelector('#username, input[name="username"]', {
    state: 'visible',
    timeout: 30000,
  });

  // Enter credentials
  await page.fill('#username, input[name="username"]', TEST_USER.username);
  await page.fill('#password, input[name="password"]', TEST_USER.password);
  await page.click('#kc-login, button[type="submit"]');

  // Handle TOTP if required
  try {
    const otpInput = await page.waitForSelector('#otp, input[name="otp"]', {
      state: 'visible',
      timeout: 5000,
    });

    if (otpInput) {
      const totpSecret = TEST_USER.totpSecret || loadTotpSecret(TEST_USER.username, ENV) || '';
      if (!totpSecret) {
        throw new Error('TOTP required but no secret available');
      }
      // Wait for fresh TOTP code if current one was already used
      const totpCode = await waitForFreshTotp(totpSecret);
      lastUsedTotpCode = totpCode; // Mark as used
      await page.fill('#otp, input[name="otp"]', totpCode);
      await page.click('#kc-login, button[type="submit"]');
    }
  } catch {
    // TOTP not required - continue
  }

  // Wait for portal to fully load with authentication tokens
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // Verify we're on the portal by checking for portal-specific content
  // This ensures the OAuth callback completed and tokens are stored in localStorage
  const portalHeading = page.locator('h2:has-text("Available Applications")');
  await expect(portalHeading).toBeVisible({ timeout: 30000 });

  console.log(`Authentication completed for ${TEST_USER.username}`);
}

/**
 * Helper to authenticate and navigate to an app page
 * Each app has its own OAuth flow, so we authenticate via SSO redirect
 */
async function authenticateAndNavigateToApp(page: Page, appUrl: string): Promise<void> {
  // Skip if no credentials
  if (!TEST_USER.password) {
    throw new Error('No test credentials configured');
  }

  // Navigate to app - it will redirect to Keycloak for auth
  await page.goto(appUrl);
  await page.waitForLoadState('networkidle');

  // Check if we're on Keycloak login page
  const usernameInput = page.locator('#username, input[name="username"]');
  const isOnKeycloak = await usernameInput.isVisible({ timeout: 10000 }).catch(() => false);

  if (isOnKeycloak) {
    // Wait for form to be ready
    await usernameInput.waitFor({ state: 'visible', timeout: 10000 });

    // Need to authenticate
    await page.fill('#username', TEST_USER.username);
    await page.fill('#password', TEST_USER.password);
    await page.click('#kc-login');

    // Handle TOTP if required
    try {
      const otpInput = await page.waitForSelector('#otp, input[name="otp"]', {
        state: 'visible',
        timeout: 5000,
      });

      if (otpInput) {
        const totpSecret = TEST_USER.totpSecret || loadTotpSecret(TEST_USER.username, ENV) || '';
        if (!totpSecret) {
          throw new Error('TOTP required but no secret available');
        }
        const totpCode = generateTotpCode(totpSecret);
        await page.fill('#otp, input[name="otp"]', totpCode);
        await page.click('#kc-login, button[type="submit"]');
      }
    } catch {
      // TOTP not required
    }
  }

  // Wait for app to load
  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

test.describe('Sample Apps - Phase 2 Pages', () => {

  test.describe('HR App', () => {
    // Share a single authenticated context across all tests in this describe block
    // This avoids TOTP reuse issues
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
      sharedPage = await sharedContext.newPage();
      await authenticateUser(sharedPage);
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('OrgChartPage - displays organization chart', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      // Navigate directly to HR app
      await sharedPage.goto(`${urls.apps.hr}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Should be on HR app now - click Org Chart nav link
      await sharedPage.click('a:has-text("Org Chart")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title (page header)
      await expect(sharedPage.locator('.page-title:has-text("Organization Chart"), h2:has-text("Organization Chart")')).toBeVisible({ timeout: 10000 });

      // Verify control buttons exist
      await expect(sharedPage.locator('button:has-text("Expand All")')).toBeVisible();
      await expect(sharedPage.locator('button:has-text("Collapse All")')).toBeVisible();

      // Verify search input exists
      await expect(sharedPage.locator('input[placeholder*="Search" i]')).toBeVisible();
    });

    test('TimeOffPage - displays time off management', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.hr}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Time Off nav link
      await sharedPage.click('a:has-text("Time Off")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page content
      await expect(sharedPage.locator('.page-title:has-text("Time Off"), h2:has-text("Time Off")')).toBeVisible({ timeout: 10000 });

      // Verify request button
      await expect(sharedPage.locator('button:has-text("Request Time Off")')).toBeVisible();
    });

    test('TimeOffPage - can open request modal', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.hr}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Time Off nav link
      await sharedPage.click('a:has-text("Time Off")');
      await sharedPage.waitForLoadState('networkidle');

      // Click request button
      await sharedPage.click('button:has-text("Request Time Off")');

      // Verify wizard opens (the wizard component should appear)
      await expect(sharedPage.locator('[role="dialog"], .modal, .wizard, [class*="TimeOffRequestWizard"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('EmployeeProfilePage - displays employee profile', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      // Navigate to Employee Directory (the default HR page)
      await sharedPage.goto(`${urls.apps.hr}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Wait for employee data to load (requires MCP HR server + sample data)
      const employeeLink = sharedPage.locator('a[href*="/employees/"]').first();
      const hasEmployees = await employeeLink.isVisible({ timeout: 15000 }).catch(() => false);

      if (!hasEmployees) {
        // Skip if no employees are present (MCP HR not running or no sample data)
        test.skip(true, 'No employees in directory - MCP HR may not be running or sample data not loaded');
        return;
      }

      // Click on first employee link to navigate to profile
      await employeeLink.click();
      await sharedPage.waitForLoadState('networkidle');

      // Verify profile page loads - look for breadcrumb link back to directory
      await expect(
        sharedPage.locator('a:has-text("Employee Directory")').first()
      ).toBeVisible({ timeout: 10000 });

      // Verify profile tabs exist (tabs are lowercase: overview, employment, timeoff, documents)
      await expect(
        sharedPage.locator('button:has-text("overview")').or(sharedPage.locator('button:has-text("Overview")'))
      ).toBeVisible({ timeout: 5000 });

      await expect(
        sharedPage.locator('button:has-text("employment")').or(sharedPage.locator('button:has-text("Employment")'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Finance App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
      sharedPage = await sharedContext.newPage();
      await authenticateUser(sharedPage);
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('ARRDashboardPage - displays ARR metrics', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.finance}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link (labeled "ARR" in navigation)
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("ARR Dashboard"), h2:has-text("ARR Dashboard")')).toBeVisible({ timeout: 10000 });

      // Verify key metrics are displayed (actual card titles)
      await expect(sharedPage.locator('text=Annual Recurring Revenue')).toBeVisible({ timeout: 10000 });
      await expect(sharedPage.locator('text=Net New ARR')).toBeVisible();
    });

    test('ARRDashboardPage - displays movement table', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.finance}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify ARR movement section exists (actual heading)
      await expect(sharedPage.locator('h3:has-text("ARR Movement")')).toBeVisible({ timeout: 10000 });
    });

    test('ARRDashboardPage - displays cohort analysis', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.finance}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on ARR nav link
      await sharedPage.click('a:has-text("ARR")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify cohort analysis section (actual heading: "Cohort Retention Analysis")
      await expect(sharedPage.locator('h3:has-text("Cohort Retention Analysis")')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Sales App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
      sharedPage = await sharedContext.newPage();
      await authenticateUser(sharedPage);
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('LeadsPage - displays lead list', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.sales}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Leads nav link
      await sharedPage.click('a:has-text("Leads")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Lead Management"), h2:has-text("Lead Management")')).toBeVisible({ timeout: 10000 });

      // Verify stats card for Total Leads exists
      await expect(sharedPage.locator('[data-testid="total-leads"]').or(sharedPage.locator('text=Total Leads')).first()).toBeVisible({ timeout: 10000 });
    });

    test('LeadsPage - has filtering controls', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.sales}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Leads nav link
      await sharedPage.click('a:has-text("Leads")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify filter controls exist (search input and status select)
      await expect(sharedPage.locator('[data-testid="search-filter"]').or(sharedPage.locator('input[placeholder*="Company" i]')).first()).toBeVisible({ timeout: 10000 });
      await expect(sharedPage.locator('[data-testid="status-filter"]').or(sharedPage.locator('select')).first()).toBeVisible();
    });

    test('ForecastingPage - displays forecast summary', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.sales}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Forecast nav link
      await sharedPage.click('a:has-text("Forecast")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Sales Forecast"), h2:has-text("Sales Forecast")')).toBeVisible({ timeout: 10000 });

      // Verify team summary cards exist
      await expect(sharedPage.locator('[data-testid="team-quota"]').or(sharedPage.locator('text=Team Quota')).first()).toBeVisible({ timeout: 10000 });
    });

    test('ForecastingPage - has period selector', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.sales}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Forecast nav link
      await sharedPage.click('a:has-text("Forecast")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify period selection control exists
      await expect(sharedPage.locator('[data-testid="period-select"]').or(sharedPage.locator('select.input')).first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Support App', () => {
    let sharedContext: BrowserContext;
    let sharedPage: Page;

    test.beforeAll(async ({ browser }) => {
      if (!TEST_USER.password) return;
      sharedContext = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
      sharedPage = await sharedContext.newPage();
      await authenticateUser(sharedPage);
    });

    test.afterAll(async () => {
      if (sharedContext) await sharedContext.close();
    });

    test('SLAPage - displays SLA compliance', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("SLA Tracking"), h2:has-text("SLA Tracking")')).toBeVisible({ timeout: 10000 });

      // Verify Overall Compliance card exists
      await expect(sharedPage.locator('[data-testid="overall-compliance"]').or(sharedPage.locator('text=Overall Compliance')).first()).toBeVisible({ timeout: 10000 });
    });

    test('SLAPage - displays tier breakdown', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify tier breakdown section (SLA Policies by Tier)
      await expect(sharedPage.locator('h3:has-text("SLA Policies by Tier")')).toBeVisible({ timeout: 10000 });
      // Verify tier labels exist (Starter, Professional, Enterprise)
      await expect(sharedPage.locator('text=Starter').first()).toBeVisible();
    });

    test('SLAPage - displays at-risk tickets', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on SLA nav link
      await sharedPage.click('a:has-text("SLA")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify At Risk card exists
      await expect(sharedPage.locator('[data-testid="tickets-at-risk"]').or(sharedPage.locator('text=At Risk')).first()).toBeVisible({ timeout: 10000 });
      // Also verify Breached card exists
      await expect(sharedPage.locator('[data-testid="tickets-breached"]').or(sharedPage.locator('text=Breached')).first()).toBeVisible();
    });

    test('AgentMetricsPage - displays agent performance', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link
      await sharedPage.click('a:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify page title
      await expect(sharedPage.locator('.page-title:has-text("Agent Performance"), h2:has-text("Agent Performance")')).toBeVisible({ timeout: 10000 });

      // Verify team summary cards exist
      await expect(sharedPage.locator('[data-testid="team-resolved"]').or(sharedPage.locator('text=Team Resolved')).first()).toBeVisible({ timeout: 10000 });
    });

    test('AgentMetricsPage - displays agent leaderboard', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link
      await sharedPage.click('a:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify Agent Leaderboard section exists
      await expect(sharedPage.locator('h3:has-text("Agent Leaderboard")')).toBeVisible({ timeout: 10000 });
    });

    test('AgentMetricsPage - has period selector', async () => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const urls = BASE_URLS[ENV];

      await sharedPage.goto(`${urls.apps.support}/`);
      await sharedPage.waitForLoadState('networkidle');

      // Click on Performance nav link
      await sharedPage.click('a:has-text("Performance")');
      await sharedPage.waitForLoadState('networkidle');

      // Verify period selection control exists
      await expect(sharedPage.locator('[data-testid="period-select"]').or(sharedPage.locator('select.input')).first()).toBeVisible({ timeout: 10000 });
    });
  });
});

test.describe('Cross-App Navigation', () => {
  test('can navigate between apps via portal', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });
    const page = await context.newPage();
    const urls = BASE_URLS[ENV];

    try {
      // Skip if no credentials
      if (!TEST_USER.password) {
        test.skip(true, 'No test credentials configured');
      }

      // Authenticate
      await authenticateUser(page);

      // Verify we're on the portal
      await expect(page.locator('text=Available Applications')).toBeVisible({ timeout: 30000 });

      // Click HR app card (use correct href)
      const hrCard = page.locator('a[href*="/hr"], [data-app="hr"]').first();
      if (await hrCard.isVisible({ timeout: 5000 })) {
        await hrCard.click();
        await page.waitForLoadState('networkidle');

        // Verify HR app loaded (Employee Directory is the index page)
        await expect(page.locator('text=Employee Directory')).toBeVisible({ timeout: 10000 });
      }
    } finally {
      await context.close();
    }
  });
});
