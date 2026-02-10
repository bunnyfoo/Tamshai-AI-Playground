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

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const PAYROLL_URL = `${BASE_URLS[ENV]}/payroll`;

let authenticatedContext: BrowserContext | null = null;

/**
 * Warm up an authenticated context by visiting the app URL once.
 * This primes PrivateRoute OIDC checks so subsequent pages render immediately.
 */
async function warmUpContext(ctx: BrowserContext, url: string): Promise<void> {
  const warmup = await ctx.newPage();
  try {
    await warmup.goto(url, { timeout: 30000 });
    await warmup.waitForSelector('h1', { timeout: 30000 });
  } catch {
    // Warm-up failure is non-fatal; tests will retry
  }
  await warmup.close();
}

test.describe('Payroll App E2E Tests', () => {
  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${PAYROLL_URL}/`);
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
  });

  test.describe('Dashboard', () => {
    test('displays payroll dashboard with metrics', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Payroll Dashboard")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('text=Next Pay Date')).toBeVisible();
        await expect(page.locator('text=Total Payroll')).toBeVisible();
        await expect(page.locator('text=YTD Payroll')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('displays quick action buttons', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Run Payroll")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Runs', () => {
    test('displays pay runs list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-runs`);
        await page.waitForLoadState('networkidle');

        // h1 heading (unique vs sidebar "Pay Runs" link)
        await expect(page.locator('h1:has-text("Pay Runs")')).toBeVisible({ timeout: 10000 });
        // Table headers only show when data exists; check for table OR empty state
        const hasTable = await page.locator('th:has-text("Pay Period")').isVisible({ timeout: 3000 }).catch(() => false);
        if (hasTable) {
          await expect(page.locator('th:has-text("Pay Date")')).toBeVisible();
          await expect(page.locator('th:has-text("Status")')).toBeVisible();
        } else {
          await expect(page.locator('text=No pay runs found')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('displays new pay run button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-runs`);
        await page.waitForLoadState('networkidle');

        // New Pay Run is a Link wrapping a button (invalid HTML nesting)
        await expect(page.locator('a:has-text("New Pay Run"), button:has-text("New Pay Run")').first()).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Pay Stubs', () => {
    test('displays pay stubs list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays YTD summary', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/pay-stubs`);
        await page.waitForLoadState('networkidle');

        // YTD cards are always visible (h3 elements inside cards)
        await expect(page.locator('h3:has-text("YTD Gross")')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('h3:has-text("YTD Net")')).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Direct Deposit', () => {
    test('displays direct deposit settings', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("Direct Deposit")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays add account button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/direct-deposit`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Add Account")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('1099 Contractors', () => {
    test('displays contractors list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1:has-text("1099 Contractors")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays generate 1099s button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/1099`);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Generate 1099s")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Navigation', () => {
    test('can navigate between payroll sections via sidebar', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${PAYROLL_URL}/`);
        await page.waitForLoadState('networkidle');

        // Click Pay Runs in sidebar
        await page.click('a[href*="/pay-runs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Pay Runs")')).toBeVisible({ timeout: 10000 });

        // Click Pay Stubs in sidebar
        await page.click('a[href*="/pay-stubs"]');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });
  });
});

test.describe('Payroll User Journeys', () => {
  let journeyContext: BrowserContext | null = null;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    journeyContext = await createAuthenticatedContext(browser);
    await warmUpContext(journeyContext, `${PAYROLL_URL}/`);
  });

  test.afterAll(async () => {
    await journeyContext?.close();
  });

  test('Scenario: Employee views their pay stub', async () => {
    test.skip(!journeyContext, 'No test credentials configured');
    const page = await journeyContext!.newPage();

    try {
      // Navigate to pay stubs
      await page.goto(`${PAYROLL_URL}/pay-stubs`);
      await page.waitForLoadState('networkidle');

      // Verify pay stubs page is visible
      await expect(page.locator('h1:has-text("Pay Stubs")')).toBeVisible({ timeout: 10000 });

      // Check for pay stub data (table or empty state)
      const hasStubs = await page.locator('tbody tr').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (hasStubs) {
        // Verify table shows expected columns
        await expect(page.locator('th:has-text("Pay Period")')).toBeVisible();
        await expect(page.locator('th:has-text("Net Pay")')).toBeVisible();
      }
    } finally {
      await page.close();
    }
  });

  test('Scenario: Admin creates a new pay run', async () => {
    test.skip(!journeyContext, 'No test credentials configured');
    const page = await journeyContext!.newPage();

    try {
      // Navigate to pay runs
      await page.goto(`${PAYROLL_URL}/pay-runs`);
      await page.waitForLoadState('networkidle');

      // Click new pay run button (Link styled as button)
      const newPayRunButton = page.locator('a:has-text("New Pay Run"), button:has-text("New Pay Run")');
      await expect(newPayRunButton.first()).toBeVisible({ timeout: 10000 });
      await newPayRunButton.first().click();

      // Verify wizard step 1 appears (h2 rendered by Wizard component)
      await expect(page.locator('h2:has-text("Pay Period")')).toBeVisible({ timeout: 15000 });
    } finally {
      await page.close();
    }
  });
});
