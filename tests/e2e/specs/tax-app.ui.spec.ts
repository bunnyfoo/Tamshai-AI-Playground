/**
 * E2E Tests for Tax App
 *
 * Tests the key user journeys for the Tax module:
 * - Dashboard viewing with compliance status
 * - Sales tax rates lookup
 * - Quarterly tax estimates management
 * - Annual filings (1099s, W-2s) tracking
 * - State tax registrations
 * - Audit log viewing
 * - AI query for tax questions
 *
 * Prerequisites:
 * - User must be authenticated with tax-read/tax-write roles
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';
import * as fs from 'fs';
import * as path from 'path';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';

const BASE_URLS: Record<string, { site: string; tax: string }> = {
  dev: {
    site: 'https://www.tamshai-playground.local:8443',
    tax: 'https://www.tamshai-playground.local:8443/app/tax',
  },
  stage: {
    site: 'https://www.tamshai.com',
    tax: 'https://www.tamshai.com/app/tax',
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

  await page.goto(`${urls.site}/employee-login.html`);

  const ssoButton = page.locator('a.sso-btn, a:has-text("Sign in with SSO")');
  await ssoButton.first().click();

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
      const totpSecret = TEST_USER.totpSecret || loadTotpSecret(TEST_USER.username, ENV) || '';
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

test.describe('Tax App E2E Tests', () => {
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
    test('displays tax dashboard with compliance status', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Tax Dashboard')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Total Tax Liability')).toBeVisible();
        await expect(page.locator('text=Paid to Date')).toBeVisible();
        await expect(page.locator('text=Remaining Balance')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays compliance status badge', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        // Check for one of the possible compliance statuses
        const complianceStatus = page.locator('text=Compliant, text=At Risk, text=Non-Compliant');
        await expect(complianceStatus.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays upcoming deadlines section', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Upcoming Deadlines')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays state tax breakdown', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=State Tax Breakdown')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Sales Tax Rates', () => {
    test('displays sales tax rates table', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/sales-tax`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Sales Tax Rates')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=State')).toBeVisible();
        await expect(page.locator('text=Base Rate')).toBeVisible();
        await expect(page.locator('text=Combined Rate')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays state filter or search', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/sales-tax`);
        await page.waitForLoadState('networkidle');

        // Check for search input or filter dropdown
        const searchOrFilter = page.locator('input[placeholder*="Search"], select, input[type="search"]');
        await expect(searchOrFilter.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Quarterly Estimates', () => {
    test('displays quarterly estimates list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Quarterly Tax Estimates')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Quarter')).toBeVisible();
        await expect(page.locator('text=Federal')).toBeVisible();
        await expect(page.locator('text=State')).toBeVisible();
        await expect(page.locator('text=Total')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays due dates for estimates', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Due Date')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays payment status for estimates', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/quarterly`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Status')).toBeVisible({ timeout: 10000 });
        // Check for one of the possible statuses
        const statusBadge = page.locator('text=Paid, text=Pending, text=Overdue, text=Partial');
        await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Annual Filings', () => {
    test('displays annual filings list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Annual Tax Filings')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Year')).toBeVisible();
        await expect(page.locator('text=Type')).toBeVisible();
        await expect(page.locator('text=Entity')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays filing types (1099, W-2, etc)', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/filings`);
        await page.waitForLoadState('networkidle');

        // Check for filing type badges
        const filingTypes = page.locator('text=1099, text=W-2, text=941');
        await expect(filingTypes.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays filing status', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/filings`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Status')).toBeVisible({ timeout: 10000 });
        // Check for one of the possible statuses
        const statusBadge = page.locator('text=Filed, text=Accepted, text=Draft, text=Amended');
        await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays confirmation numbers for filed returns', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/filings`);
        await page.waitForLoadState('networkidle');

        // Look for confirmation number pattern (IRS-, SSA-, etc)
        const confirmationNumber = page.locator('text=/IRS-|SSA-|CONF-/');
        await expect(confirmationNumber.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('State Registrations', () => {
    test('displays state registrations list', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=State Tax Registrations')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=State')).toBeVisible();
        await expect(page.locator('text=Type')).toBeVisible();
        await expect(page.locator('text=Registration')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays registration types', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/registrations`);
        await page.waitForLoadState('networkidle');

        // Check for registration type badges
        const regTypes = page.locator('text=Sales Tax, text=Income Tax, text=Franchise Tax');
        await expect(regTypes.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays registration status', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Status')).toBeVisible({ timeout: 10000 });
        // Check for one of the possible statuses
        const statusBadge = page.locator('text=Active, text=Pending, text=Expired');
        await expect(statusBadge.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays filing frequency', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/registrations`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Filing Frequency')).toBeVisible({ timeout: 10000 });
        // Check for frequency values
        const frequency = page.locator('text=Monthly, text=Quarterly, text=Annually');
        await expect(frequency.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Audit Log', () => {
    test('displays audit log entries', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/audit-log`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Audit Log')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Timestamp')).toBeVisible();
        await expect(page.locator('text=Action')).toBeVisible();
        await expect(page.locator('text=User')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays action types', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/audit-log`);
        await page.waitForLoadState('networkidle');

        // Check for action type badges
        const actionTypes = page.locator('text=Create, text=Update, text=Submit, text=Approve');
        await expect(actionTypes.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays entity types', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/audit-log`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Entity Type')).toBeVisible({ timeout: 10000 });
        // Check for entity type badges
        const entityTypes = page.locator('text=Filing, text=Estimate, text=Registration');
        await expect(entityTypes.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('AI Query', () => {
    test('displays AI query interface', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/ai-query`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('text=Tax AI Assistant, text=AI Query')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays query input textarea', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/ai-query`);
        await page.waitForLoadState('networkidle');

        const textarea = page.locator('textarea, input[type="text"]');
        await expect(textarea.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays submit button', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/ai-query`);
        await page.waitForLoadState('networkidle');

        const submitButton = page.locator('button:has-text("Ask"), button:has-text("Submit"), button:has-text("Send")');
        await expect(submitButton.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays example queries', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/ai-query`);
        await page.waitForLoadState('networkidle');

        // Check for example query suggestions
        const examples = page.locator('text=Example, text=Try asking, text=Suggested');
        await expect(examples.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between tax sections via sidebar', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        // Click Sales Tax in sidebar
        await page.click('a:has-text("Sales Tax"), [href*="/sales-tax"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Sales Tax Rates')).toBeVisible({ timeout: 10000 });

        // Click Quarterly Estimates in sidebar
        await page.click('a:has-text("Quarterly"), [href*="/quarterly"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Quarterly Tax Estimates')).toBeVisible({ timeout: 10000 });

        // Click Annual Filings in sidebar
        await page.click('a:has-text("Filings"), [href*="/filings"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('text=Annual Tax Filings')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays back to portal link', async () => {
      if (!authenticatedContext) test.skip(true, 'No authenticated context');
      const page = await authenticatedContext!.newPage();
      const urls = BASE_URLS[ENV];

      try {
        await page.goto(`${urls.tax}/`);
        await page.waitForLoadState('networkidle');

        const portalLink = page.locator('a:has-text("Portal"), a:has-text("Home"), a[href="/"]');
        await expect(portalLink.first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });
});

test.describe('Tax User Journeys', () => {
  test('Scenario: Finance user reviews quarterly tax estimates', async ({ browser }) => {
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

      // Navigate to quarterly estimates
      await page.goto(`${urls.tax}/quarterly`);
      await page.waitForLoadState('networkidle');

      // Verify quarterly estimates are visible
      await expect(page.locator('text=Quarterly Tax Estimates')).toBeVisible({ timeout: 10000 });

      // Check that estimates show federal and state breakdown
      await expect(page.locator('text=Federal')).toBeVisible();
      await expect(page.locator('text=State')).toBeVisible();

      // Verify we can see upcoming due dates
      await expect(page.locator('text=Due Date')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Scenario: Tax accountant checks annual filings status', async ({ browser }) => {
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

      // Navigate to annual filings
      await page.goto(`${urls.tax}/filings`);
      await page.waitForLoadState('networkidle');

      // Verify filings are visible
      await expect(page.locator('text=Annual Tax Filings')).toBeVisible({ timeout: 10000 });

      // Check for 1099 filings
      const filings1099 = page.locator('text=1099');
      await expect(filings1099.first()).toBeVisible({ timeout: 10000 });

      // Check for W-2 filings
      const filingsW2 = page.locator('text=W-2');
      await expect(filingsW2.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('Scenario: Compliance officer reviews audit log', async ({ browser }) => {
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

      // Navigate to audit log
      await page.goto(`${urls.tax}/audit-log`);
      await page.waitForLoadState('networkidle');

      // Verify audit log is visible
      await expect(page.locator('text=Audit Log')).toBeVisible({ timeout: 10000 });

      // Check that we can see who made changes
      await expect(page.locator('text=User')).toBeVisible();

      // Check that timestamps are visible
      await expect(page.locator('text=Timestamp')).toBeVisible();

      // Check for action types
      await expect(page.locator('text=Action')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Scenario: User asks AI about sales tax rates', async ({ browser }) => {
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

      // Navigate to AI query page
      await page.goto(`${urls.tax}/ai-query`);
      await page.waitForLoadState('networkidle');

      // Verify AI query interface is visible
      await expect(page.locator('text=Tax AI Assistant, text=AI Query')).toBeVisible({ timeout: 10000 });

      // Check for input field
      const textarea = page.locator('textarea, input[type="text"]');
      await expect(textarea.first()).toBeVisible({ timeout: 10000 });

      // Type a question (but don't submit to avoid API calls in E2E tests)
      await textarea.first().fill('What is the sales tax rate in California?');

      // Verify submit button is available
      const submitButton = page.locator('button:has-text("Ask"), button:has-text("Submit"), button:has-text("Send")');
      await expect(submitButton.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });

  test('Scenario: User views state tax registration details', async ({ browser }) => {
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

      // Navigate to state registrations
      await page.goto(`${urls.tax}/registrations`);
      await page.waitForLoadState('networkidle');

      // Verify registrations are visible
      await expect(page.locator('text=State Tax Registrations')).toBeVisible({ timeout: 10000 });

      // Check for California registration (from sample data)
      const californiaReg = page.locator('text=California, text=CA');
      await expect(californiaReg.first()).toBeVisible({ timeout: 10000 });

      // Check for registration number format
      const regNumber = page.locator('text=/[A-Z]{2}-[A-Z]+-\\d+/');
      await expect(regNumber.first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });
});
