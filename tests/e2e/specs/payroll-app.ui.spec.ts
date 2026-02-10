/**
 * E2E Tests for Payroll App - RED Phase
 *
 * Tests the key user journeys for the Payroll module:
 * - Dashboard viewing
 * - Pay run processing
 * - Pay stub viewing
 * - Direct deposit management
 * - 1099 contractor management
 *
 * Prerequisites:
 * - User must be authenticated with payroll-read/payroll-write roles
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';

const BASE_URLS: Record<string, { site: string; payroll: string }> = {
  dev: {
    site: 'https://www.tamshai-playground.local:8443',
    payroll: 'https://www.tamshai-playground.local:8443/payroll',
  },
  stage: {
    site: 'https://www.tamshai.com',
    payroll: 'https://www.tamshai.com/payroll',
  },
};

// Test credentials
const TEST_USER = {
  username: process.env.TEST_USERNAME || 'test-user.journey',
  password: process.env.TEST_USER_PASSWORD || '',
  totpSecret: process.env.TEST_USER_TOTP_SECRET || '',
};

// TOTP helpers
const TOTP_SECRETS_DIR = path.join(__dirname, '..', '.totp-secrets');

function loadTotpSecret(username: string, environment: string): string | null {
  try {
    const secretFile = path.join(TOTP_SECRETS_DIR, `${username}-${environment}.secret`);
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf-8').trim();
    }
  } catch {
    // Ignore
  }
  return null;
}

function isOathtoolAvailable(): boolean {
  try {
    execSync('oathtool --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function generateTotpCode(secret: string): string {
  if (!secret) throw new Error('TOTP secret required');

  if (isOathtoolAvailable()) {
    try {
      return execSync('oathtool "$TOTP_SECRET"', { encoding: 'utf-8', env: { ...process.env, TOTP_SECRET: secret }, shell: '/bin/bash' }).trim();
    } catch {
      // Fall through
    }
  }

  authenticator.options = { digits: 6, step: 30, algorithm: 'sha1' };
  return authenticator.generate(secret);
}

async function authenticateUser(page: Page): Promise<void> {
  const urls = BASE_URLS[ENV];

  if (!TEST_USER.password) {
    test.skip(true, 'No test credentials configured');
  }

  // Navigate to portal — auto-redirects to Keycloak SSO
  await page.goto(`${urls.site}/app/`);

  await page.waitForSelector('#username', { state: 'visible', timeout: 30000 });
  await page.fill('#username', TEST_USER.username);
  await page.fill('#password', TEST_USER.password);
  await page.click('#kc-login, button[type="submit"]');

  try {
    const otpInput = await page.waitForSelector('#otp, input[name="otp"]', {
      state: 'visible',
      timeout: 5000,
    });

    if (otpInput) {
      // Cache file first (globalSetup writes Base32-encoded bridge value),
      // then fall back to raw env var
      const totpSecret = loadTotpSecret(TEST_USER.username, ENV) || TEST_USER.totpSecret || '';
      const totpCode = generateTotpCode(totpSecret);
      await page.fill('#otp, input[name="otp"]', totpCode);
      await page.click('#kc-login, button[type="submit"]');
    }
  } catch {
    // TOTP not required
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

let authenticatedContext: BrowserContext | null = null;

test.describe('Payroll App E2E Tests', () => {
  test.beforeAll(async ({ browser }) => {
    authenticatedContext = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });
    const page = await authenticatedContext.newPage();
    await authenticateUser(page);
    await page.close();
  });

  test.afterAll(async () => {
    if (authenticatedContext) {
      await authenticatedContext.close();
    }
  });

  test.describe('Dashboard', () => {
    test('displays payroll dashboard with metrics', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Payroll Dashboard')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Next Pay Date')).toBeVisible();
        await expect(page.locator('text=Total Payroll')).toBeVisible();
        await expect(page.locator('text=YTD Payroll')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays quick action buttons', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Run Payroll")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Runs', () => {
    test('displays pay runs list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/pay-runs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Pay Runs')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Pay Period')).toBeVisible();
        await expect(page.locator('text=Pay Date')).toBeVisible();
        await expect(page.locator('text=Status')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays new pay run button', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/pay-runs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("New Pay Run")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Stubs', () => {
    test('displays pay stubs list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Pay Stubs')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Gross Pay')).toBeVisible();
        await expect(page.locator('text=Net Pay')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays YTD summary', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=YTD Gross')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=YTD Net')).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Direct Deposit', () => {
    test('displays direct deposit settings', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Direct Deposit')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays add account button', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Add Account")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('1099 Contractors', () => {
    test('displays contractors list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=1099 Contractors')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Name')).toBeVisible();
        await expect(page.locator('text=YTD Payments')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays generate 1099s button', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Generate 1099s")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between payroll sections via sidebar', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.payroll}/`);
        await page.waitForLoadState('networkidle');

        // Click Pay Runs in sidebar
        await page.click('a:has-text("Pay Runs"), [href*="/pay-runs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Pay Runs')).toBeVisible({ timeout: 10000 });

        // Click Pay Stubs in sidebar
        await page.click('a:has-text("Pay Stubs"), [href*="/pay-stubs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Pay Stubs')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });
});

test.describe('Payroll User Journeys', () => {
  test('Scenario: Employee views their pay stub', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });
    const page = await context.newPage();
    const urls = BASE_URLS[ENV];

    try {
      if (!TEST_USER.password) {
        test.skip(true, 'No test credentials configured');
      }

      await authenticateUser(page);

      // Navigate to pay stubs
      await page.goto(`${urls.payroll}/pay-stubs`);
      await page.waitForLoadState('networkidle');

      // Verify pay stubs are visible
      await expect(page.locator('text=Pay Stubs')).toBeVisible({ timeout: 10000 });

      // Click on first pay stub to view details (if available)
      const viewButton = page.locator('button:has-text("View")').first();
      if (await viewButton.isVisible({ timeout: 5000 })) {
        await viewButton.click();
        await page.waitForLoadState('networkidle');

        // Verify pay stub detail shows earnings and deductions
        await expect(page.locator('text=Earnings, text=EARNINGS').first()).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Deductions, text=DEDUCTIONS').first()).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test('Scenario: Admin creates a new pay run', async ({ browser }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: ENV === 'dev',
    });
    const page = await context.newPage();
    const urls = BASE_URLS[ENV];

    try {
      if (!TEST_USER.password) {
        test.skip(true, 'No test credentials configured');
      }

      await authenticateUser(page);

      // Navigate to pay runs
      await page.goto(`${urls.payroll}/pay-runs`);
      await page.waitForLoadState('networkidle');

      // Click new pay run button
      const newPayRunButton = page.locator('button:has-text("New Pay Run")');
      await expect(newPayRunButton).toBeVisible({ timeout: 10000 });
      await newPayRunButton.click();

      // Verify wizard step 1 appears
      await expect(page.locator('text=Pay Period Selection, text=Select Pay Period').first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });
});
