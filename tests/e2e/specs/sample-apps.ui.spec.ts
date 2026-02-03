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
 * - User must be authenticated with appropriate roles
 * - Uses test-user.journey account (has executive role for all apps)
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
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

/**
 * Generate TOTP code
 */
function generateTotpCode(secret: string): string {
  if (!secret) {
    throw new Error('TOTP secret is required');
  }

  if (isOathtoolAvailable()) {
    try {
      return execSync(`oathtool "${secret}"`, {
        encoding: 'utf-8',
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
      const totpCode = generateTotpCode(totpSecret);
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
    test('OrgChartPage - displays organization chart', async ({ browser }) => {
      if (!TEST_USER.password) test.skip(true, 'No test credentials configured');
      const context = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
      const page = await context.newPage();
      const urls = BASE_URLS[ENV];

      try {
        // Authenticate via portal first (same pattern as Cross-App Navigation test)
        await authenticateUser(page);

        // Navigate directly to HR app
        await page.goto(`${urls.apps.hr}/`);
        await page.waitForLoadState('networkidle');

        // Should be on HR app now - click Org Chart tab
        await page.click('text=Org Chart');
        await page.waitForLoadState('networkidle');

        // Verify page title (page header, not tab)
        await expect(page.locator('h1:has-text("Organization Chart"), h2:has-text("Organization Chart")')).toBeVisible({ timeout: 10000 });

        // Verify control buttons exist
        await expect(page.locator('text=Expand All')).toBeVisible();
        await expect(page.locator('text=Collapse All')).toBeVisible();

        // Verify search input exists
        await expect(page.locator('input[placeholder*="Search" i], input[placeholder*="name" i]')).toBeVisible();
      } finally {
        await context.close();
      }
    });

    test('TimeOffPage - displays time off management', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.hr}/time-off`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=Time Off')).toBeVisible({ timeout: 10000 });

        // Verify request button
        await expect(page.locator('text=Request Time Off')).toBeVisible();

        // Verify tabs exist
        await expect(page.locator('text=My Balances')).toBeVisible();
        await expect(page.locator('text=My Requests')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('TimeOffPage - can open request modal', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.hr}/time-off`);
        await page.waitForLoadState('networkidle');

        // Click request button
        await page.click('text=Request Time Off');

        // Verify modal opens with form fields
        await expect(page.locator('text=Time Off Type')).toBeVisible({ timeout: 5000 });
      } finally {
        await page.close();
      }
    });

    test('EmployeeProfilePage - displays employee profile', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        // First go to directory to get an employee ID
        await page.goto(`${urls.apps.hr}/`);
        await page.waitForLoadState('networkidle');

        // Click on first employee link
        const employeeLink = page.locator('a[href*="/employees/"]').first();
        if (await employeeLink.isVisible({ timeout: 10000 })) {
          await employeeLink.click();
          await page.waitForLoadState('networkidle');

          // Verify profile page loads with tabs
          await expect(page.locator('text=overview, text=Overview').first()).toBeVisible({ timeout: 10000 });
          await expect(page.locator('text=employment, text=Employment').first()).toBeVisible();
          await expect(page.locator('text=Time Off')).toBeVisible();
          await expect(page.locator('text=documents, text=Documents').first()).toBeVisible();
        } else {
          test.skip(true, 'No employees in directory');
        }
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Finance App', () => {
    test('ARRDashboardPage - displays ARR metrics', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.finance}/arr`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=ARR Dashboard')).toBeVisible({ timeout: 10000 });

        // Verify key metrics are displayed
        await expect(page.locator('text=Current ARR')).toBeVisible();
        await expect(page.locator('text=Net New ARR')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('ARRDashboardPage - displays movement table', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.finance}/arr`);
        await page.waitForLoadState('networkidle');

        // Verify ARR movement section exists
        await expect(page.locator('text=ARR Movement')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('ARRDashboardPage - displays cohort analysis', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.finance}/arr`);
        await page.waitForLoadState('networkidle');

        // Verify cohort analysis section
        await expect(page.locator('text=Cohort Analysis')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Sales App', () => {
    test('LeadsPage - displays lead list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.sales}/leads`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=Leads')).toBeVisible({ timeout: 10000 });

        // Verify stats summary
        await expect(page.locator('text=Total Leads')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('LeadsPage - has filtering controls', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.sales}/leads`);
        await page.waitForLoadState('networkidle');

        // Verify search input
        await expect(page.locator('input[placeholder*="Search" i]')).toBeVisible({ timeout: 10000 });

        // Verify status filter
        await expect(page.locator('select, [role="combobox"]').first()).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('ForecastingPage - displays forecast summary', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.sales}/forecast`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=Sales Forecasting')).toBeVisible({ timeout: 10000 });

        // Verify team summary section
        await expect(page.locator('text=Team Summary')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('ForecastingPage - has period selector', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.sales}/forecast`);
        await page.waitForLoadState('networkidle');

        // Verify period selection controls
        await expect(page.locator('select, [role="combobox"]').first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Support App', () => {
    test('SLAPage - displays SLA compliance', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/sla`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=SLA Monitoring')).toBeVisible({ timeout: 10000 });

        // Verify compliance overview
        await expect(page.locator('text=Overall Compliance')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('SLAPage - displays tier breakdown', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/sla`);
        await page.waitForLoadState('networkidle');

        // Verify tier breakdown section
        await expect(page.locator('text=Tier Breakdown')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('SLAPage - displays at-risk tickets', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/sla`);
        await page.waitForLoadState('networkidle');

        // Verify at-risk tickets section
        await expect(page.locator('text=At-Risk Tickets')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('AgentMetricsPage - displays agent performance', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/performance`);
        await page.waitForLoadState('networkidle');

        // Verify page title
        await expect(page.locator('text=Agent Performance')).toBeVisible({ timeout: 10000 });

        // Verify team summary
        await expect(page.locator('text=Team Summary')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('AgentMetricsPage - displays agent leaderboard', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/performance`);
        await page.waitForLoadState('networkidle');

        // Verify leaderboard section
        await expect(page.locator('text=Agent Leaderboard')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('AgentMetricsPage - has period selector', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.apps.support}/performance`);
        await page.waitForLoadState('networkidle');

        // Verify period selection
        await expect(page.locator('select, [role="combobox"]').first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
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

      // Click HR app card
      const hrCard = page.locator('a[href*="/app/hr"], [data-app="hr"]').first();
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
