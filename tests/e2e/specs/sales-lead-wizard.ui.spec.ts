/**
 * Sales App - Lead Conversion Wizard E2E Tests
 *
 * Tests the multi-step lead conversion flow with:
 * - Wizard navigation
 * - Step validation
 * - Breadcrumb navigation
 * - Data persistence across steps
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Salesforce-style lead conversion wizard patterns.
 */

import { test, expect } from '@playwright/test';
import {
  createDatabaseSnapshot,
  rollbackToSnapshot,
  expectWizardStepActive,
  expectStepCompleted,
  expectStepDisabled,
  goToNextStep,
  goToPreviousStep,
  submitWizard,
  cancelWizard,
  goToStepByBreadcrumb,
  getCurrentStepNumber,
  getTotalSteps,
  expectValidationErrors,
  expectNoValidationErrors,
  expectWizardProcessing,
  waitForWizardComplete,
  expectPreviousButtonHidden,
  expectSubmitButtonVisible,
  expectNextButtonShowsStep,
  fillWizardField,
  selectWizardOption,
  expectBreadcrumbsVisible,
} from '../utils';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const BASE_URLS: Record<string, string> = {
  dev: 'https://www.tamshai-playground.local:8443',
  stage: 'https://www.tamshai.com',
  prod: 'https://app.tamshai.com',
};

test.describe('Sales Lead Conversion Wizard', () => {
  let snapshotId: string;

  test.beforeAll(async () => {
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterEach(async () => {
    await rollbackToSnapshot(snapshotId);
  });

  test.describe('Wizard Initialization', () => {
    test('wizard opens on first step (Lead Selection)', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);

      // Wait for wizard to load
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Should be on first step
      await expectWizardStepActive(page, 'Lead Selection');
      expect(await getCurrentStepNumber(page)).toBe(1);
    });

    test('shows correct total step count', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Lead conversion has 5 steps
      expect(await getTotalSteps(page)).toBe(5);
    });

    test('Previous button is hidden on first step', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectPreviousButtonHidden(page);
    });

    test('Next button shows upcoming step name', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectNextButtonShowsStep(page, 'Account Creation');
    });
  });

  test.describe('Breadcrumb Navigation', () => {
    test('breadcrumbs are visible', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectBreadcrumbsVisible(page);
    });

    test('current step is highlighted in breadcrumbs', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const currentStep = page.locator('[aria-current="step"]');
      await expect(currentStep).toContainText('Lead Selection');
    });

    test('future steps are disabled in breadcrumbs', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await expectStepDisabled(page, 'Account Creation');
      await expectStepDisabled(page, 'Contact Creation');
    });

    test('can navigate back to completed steps via breadcrumbs', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Complete step 1
      await goToNextStep(page);
      await expectWizardStepActive(page, 'Account Creation');

      // Step 1 should be marked complete
      await expectStepCompleted(page, 'Lead Selection');

      // Navigate back via breadcrumb
      await goToStepByBreadcrumb(page, 'Lead Selection');
      await expectWizardStepActive(page, 'Lead Selection');
    });
  });

  test.describe('Step Navigation', () => {
    test('Next button advances to next step', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      await goToNextStep(page);

      await expectWizardStepActive(page, 'Account Creation');
      expect(await getCurrentStepNumber(page)).toBe(2);
    });

    test('Previous button goes back to previous step', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to step 2
      await goToNextStep(page);
      expect(await getCurrentStepNumber(page)).toBe(2);

      // Go back to step 1
      await goToPreviousStep(page);
      expect(await getCurrentStepNumber(page)).toBe(1);
    });

    test('navigating back preserves entered data', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to Account Creation step
      await goToNextStep(page);

      // Enter account name
      await fillWizardField(page, 'account-name', 'Test Company Inc');

      // Go forward then back
      await goToNextStep(page);
      await goToPreviousStep(page);

      // Data should be preserved
      const accountNameField = page.locator('[data-testid="account-name"]');
      await expect(accountNameField).toHaveValue('Test Company Inc');
    });
  });

  test.describe('Step Validation', () => {
    test('blocks navigation when required fields are empty', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to Account Creation (step 2) where company name is required
      await goToNextStep(page);

      // Clear required field
      await fillWizardField(page, 'account-name', '');

      // Try to proceed
      await goToNextStep(page);

      // Should show validation error
      await expectValidationErrors(page, ['Account name is required']);

      // Should still be on step 2
      expect(await getCurrentStepNumber(page)).toBe(2);
    });

    test('clears validation errors when field is corrected', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to Account Creation step
      await goToNextStep(page);

      // Clear required field and try to proceed
      await fillWizardField(page, 'account-name', '');
      await goToNextStep(page);
      await expectValidationErrors(page, ['Account name is required']);

      // Correct the field
      await fillWizardField(page, 'account-name', 'Valid Company');

      // Errors should clear
      await expectNoValidationErrors(page);
    });

    test('allows going back without validation', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to Account Creation step
      await goToNextStep(page);

      // Clear required field
      await fillWizardField(page, 'account-name', '');

      // Going back should always work
      await goToPreviousStep(page);
      expect(await getCurrentStepNumber(page)).toBe(1);
    });
  });

  test.describe('Final Step & Submission', () => {
    test('final step shows Submit button instead of Next', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to final step (step 5: Review & Convert)
      for (let i = 0; i < 4; i++) {
        await goToNextStep(page);
      }

      expect(await getCurrentStepNumber(page)).toBe(5);
      await expectSubmitButtonVisible(page);
    });

    test('shows loading state during submission', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate to final step
      for (let i = 0; i < 4; i++) {
        await goToNextStep(page);
      }

      // Submit
      await submitWizard(page);

      // Should show processing state
      await expectWizardProcessing(page);
    });

    test('successful submission closes wizard', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Navigate through all steps
      for (let i = 0; i < 4; i++) {
        await goToNextStep(page);
      }

      // Submit
      await submitWizard(page);

      // Wait for completion
      await waitForWizardComplete(page);

      // Wizard should be closed
      const wizard = page.locator('[role="dialog"].wizard');
      await expect(wizard).not.toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Cancel Flow', () => {
    test('Cancel button is visible on all steps', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const cancelButton = page.locator('button:has-text("Cancel")');
      await expect(cancelButton).toBeVisible();

      // Check on step 2 as well
      await goToNextStep(page);
      await expect(cancelButton).toBeVisible();
    });

    test('Cancel closes wizard without saving', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      // Go to step 2 and enter data
      await goToNextStep(page);
      await fillWizardField(page, 'account-name', 'Test Company');

      // Cancel
      await cancelWizard(page);

      // Wizard should close
      const wizard = page.locator('[role="dialog"].wizard');
      await expect(wizard).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Accessibility', () => {
    test('wizard has proper dialog role and label', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const wizard = page.locator('[role="dialog"].wizard');
      await expect(wizard).toHaveAttribute('aria-labelledby');
    });

    test('step content has live region for updates', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const main = page.locator('main[role="main"]');
      await expect(main).toHaveAttribute('aria-live', 'polite');
    });

    test('breadcrumb navigation has proper ARIA attributes', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/sales/leads/convert/lead-001?showBreadcrumbs=true`);
      await page.waitForSelector('[role="dialog"].wizard', { timeout: 10000 });

      const nav = page.locator('nav[aria-label="Wizard progress"]');
      await expect(nav).toBeVisible();
    });
  });
});
