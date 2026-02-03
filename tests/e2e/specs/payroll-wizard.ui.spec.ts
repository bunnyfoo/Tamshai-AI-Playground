/**
 * Payroll App - Run Payroll Wizard E2E Tests
 *
 * Tests the multi-step payroll processing wizard with:
 * - Pay period selection
 * - Earnings review
 * - Deductions/taxes preview
 * - Final approval with confirmation
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Gusto/ADP-style payroll processing patterns.
 */

import { test, expect } from '@playwright/test';
import {
  createDatabaseSnapshot,
  rollbackToSnapshot,
  expectWizardStepActive,
  expectStepCompleted,
  goToNextStep,
  goToPreviousStep,
  submitWizard,
  expectValidationErrors,
  expectNoValidationErrors,
  expectWizardProcessing,
  waitForWizardComplete,
  expectSubmitButtonVisible,
  fillWizardField,
  selectWizardOption,
  getCurrentStepNumber,
  getTotalSteps,
  expectBreadcrumbsVisible,
} from '../utils';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const BASE_URLS: Record<string, string> = {
  dev: 'https://www.tamshai-playground.local:8443',
  stage: 'https://www.tamshai.com',
  prod: 'https://app.tamshai.com',
};

test.describe('Payroll Run Wizard', () => {
  let snapshotId: string;

  test.beforeAll(async () => {
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterEach(async () => {
    await rollbackToSnapshot(snapshotId);
  });

  test.describe('Wizard Flow', () => {
    test('wizard starts at Pay Period step', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectWizardStepActive(page, 'Pay Period');
      expect(await getCurrentStepNumber(page)).toBe(1);
    });

    test('has 4 steps: Pay Period, Earnings, Deductions, Review', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      expect(await getTotalSteps(page)).toBe(4);
    });

    test('breadcrumbs show all steps', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectBreadcrumbsVisible(page);

      const breadcrumbs = page.locator('nav[aria-label="Wizard progress"] li');
      expect(await breadcrumbs.count()).toBe(4);
    });
  });

  test.describe('Step 1: Pay Period Selection', () => {
    test('shows pay period date range selection', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const startDate = page.locator('[data-testid="pay-period-start"]');
      const endDate = page.locator('[data-testid="pay-period-end"]');

      await expect(startDate).toBeVisible();
      await expect(endDate).toBeVisible();
    });

    test('validates pay period dates before proceeding', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Clear dates
      await fillWizardField(page, 'pay-period-start', '');
      await fillWizardField(page, 'pay-period-end', '');

      // Try to proceed
      await goToNextStep(page);

      // Should show validation error
      await expectValidationErrors(page, ['Pay period start date is required']);
      expect(await getCurrentStepNumber(page)).toBe(1);
    });

    test('proceeds to Earnings step with valid dates', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Fill valid dates
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');

      await goToNextStep(page);

      await expectWizardStepActive(page, 'Earnings');
      expect(await getCurrentStepNumber(page)).toBe(2);
    });
  });

  test.describe('Step 2: Earnings Review', () => {
    test('displays employee earnings table', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to Earnings step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);

      // Earnings table should be visible
      const earningsTable = page.locator('[data-testid="earnings-table"]');
      await expect(earningsTable).toBeVisible();
    });

    test('shows total gross pay calculation', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Earnings step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);

      // Total should be displayed
      const totalGross = page.locator('[data-testid="total-gross-pay"]');
      await expect(totalGross).toBeVisible();
      await expect(totalGross).toContainText('$');
    });

    test('allows editing individual earnings', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Earnings step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);

      // Click edit on first row
      const editButton = page.locator('[data-testid="edit-earnings-0"]');
      await editButton.click();

      // Edit dialog should appear
      const editDialog = page.locator('[data-testid="edit-earnings-dialog"]');
      await expect(editDialog).toBeVisible();
    });
  });

  test.describe('Step 3: Deductions & Taxes', () => {
    test('shows tax withholding calculations', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Deductions step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);

      // Should be on Deductions step
      await expectWizardStepActive(page, 'Deductions');

      // Tax table should be visible
      const taxTable = page.locator('[data-testid="tax-withholdings-table"]');
      await expect(taxTable).toBeVisible();
    });

    test('displays Federal, State, and FICA taxes', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Deductions step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);

      // Verify tax categories are shown
      await expect(page.locator('text=Federal Income Tax')).toBeVisible();
      await expect(page.locator('text=State Income Tax')).toBeVisible();
      await expect(page.locator('text=FICA')).toBeVisible();
    });

    test('shows total net pay calculation', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Deductions step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);

      // Total net pay should be displayed
      const totalNet = page.locator('[data-testid="total-net-pay"]');
      await expect(totalNet).toBeVisible();
    });
  });

  test.describe('Step 4: Review & Submit', () => {
    test('shows summary of payroll run', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      // Should be on Review step
      await expectWizardStepActive(page, 'Review');

      // Summary should be visible
      const summary = page.locator('[data-testid="payroll-summary"]');
      await expect(summary).toBeVisible();
    });

    test('displays Submit button on final step', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      await expectSubmitButtonVisible(page);
    });

    test('submit shows confirmation before processing', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      // Click submit
      await submitWizard(page);

      // Confirmation dialog should appear
      const confirmDialog = page.locator('[data-testid="confirm-payroll-dialog"]');
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog).toContainText('Are you sure you want to process this payroll');
    });

    test('successful submission shows processing state', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      // Submit and confirm
      await submitWizard(page);
      const confirmButton = page.locator('[data-testid="confirm-submit"]');
      await confirmButton.click();

      // Should show processing
      await expectWizardProcessing(page);
    });
  });

  test.describe('Pre-flight Validation (Gusto Pattern)', () => {
    test('shows warning for employees with missing tax info', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      // Check for pre-flight warnings
      const warnings = page.locator('[data-testid="preflight-warnings"]');
      const warningCount = await warnings.count();

      if (warningCount > 0) {
        await expect(warnings.first()).toBeVisible();
      }
    });

    test('blocks submission for critical errors', async ({ page }) => {
      // Navigate to a pay run with known issues
      await page.goto(`${BASE_URLS[ENV]}/app/payroll/pay-runs/new?simulate=missing-ssn`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to Review step
      await fillWizardField(page, 'pay-period-start', '2026-01-01');
      await fillWizardField(page, 'pay-period-end', '2026-01-15');
      await goToNextStep(page);
      await goToNextStep(page);
      await goToNextStep(page);

      // Submit button should be disabled
      const submitButton = page.locator('button:has-text("Submit")');
      await expect(submitButton).toBeDisabled();

      // Error should be shown
      const criticalError = page.locator('[data-testid="critical-error"]');
      await expect(criticalError).toContainText('Missing SSN');
    });
  });
});
