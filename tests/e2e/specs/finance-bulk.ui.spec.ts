/**
 * Finance App - Bulk Invoice Operations E2E Tests
 *
 * Tests the invoice batch approval flow with:
 * - Bulk row selection
 * - Bulk action toolbar behavior
 * - Confirmation dialogs
 * - State reversion after tests
 *
 * Architecture v1.5 - Enterprise UX Hardening
 *
 * Following Salesforce Lightning patterns for bulk operations.
 */

import { test, expect } from '@playwright/test';
import {
  createDatabaseSnapshot,
  rollbackToSnapshot,
  expectBulkMenuEnabled,
  expectBulkMenuDisabled,
  selectTableRows,
  deselectTableRows,
  selectAllRows,
  deselectAllRows,
  getSelectedRowCount,
  clickBulkAction,
  confirmBulkAction,
  cancelBulkAction,
  expectSelectedCount,
  expectBulkActionsAvailable,
} from '../utils';

// Environment configuration
const ENV = process.env.TEST_ENV || 'dev';
const BASE_URLS: Record<string, string> = {
  dev: 'https://www.tamshai-playground.local:8443',
  stage: 'https://www.tamshai.com',
  prod: 'https://app.tamshai.com',
};

test.describe('Finance Invoice Bulk Operations', () => {
  let snapshotId: string;

  test.beforeAll(async () => {
    // Create snapshot before test suite for rollback
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterEach(async () => {
    // Rollback to clean state after each test
    await rollbackToSnapshot(snapshotId);
  });

  test.describe('Bulk Action Toolbar State', () => {
    test('bulk action menu is disabled when no rows are selected', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);

      // Wait for table to load
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Initially, no rows are selected
      await expectBulkMenuDisabled(page);
    });

    test('bulk action menu enables when rows are selected', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select first row
      await selectTableRows(page, [0]);

      // Bulk menu should now be enabled
      await expectBulkMenuEnabled(page);
    });

    test('bulk action menu disables when all rows are deselected', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select then deselect
      await selectTableRows(page, [0]);
      await expectBulkMenuEnabled(page);

      await deselectTableRows(page, [0]);
      await expectBulkMenuDisabled(page);
    });

    test('shows correct selected count in toolbar', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select 3 rows
      await selectTableRows(page, [0, 1, 2]);

      // Verify count display
      await expectSelectedCount(page, 3);
    });
  });

  test.describe('Row Selection Behavior', () => {
    test('individual row checkboxes toggle selection', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select first row
      await selectTableRows(page, [0]);
      expect(await getSelectedRowCount(page)).toBe(1);

      // Select second row
      await selectTableRows(page, [1]);
      expect(await getSelectedRowCount(page)).toBe(2);

      // Deselect first row
      await deselectTableRows(page, [0]);
      expect(await getSelectedRowCount(page)).toBe(1);
    });

    test('header checkbox selects all visible rows', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Get row count
      const rowCount = await page.locator('tbody tr').count();

      // Select all
      await selectAllRows(page);

      // Verify all selected
      expect(await getSelectedRowCount(page)).toBe(rowCount);
    });

    test('header checkbox deselects all when all are selected', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select all
      await selectAllRows(page);
      expect(await getSelectedRowCount(page)).toBeGreaterThan(0);

      // Deselect all
      await deselectAllRows(page);
      expect(await getSelectedRowCount(page)).toBe(0);
    });
  });

  test.describe('Bulk Approval Flow', () => {
    test('approve action is available for pending invoices', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select pending invoices
      await selectTableRows(page, [0, 1]);

      // Verify approve action is available
      await expectBulkActionsAvailable(page, ['approve']);
    });

    test('shows confirmation dialog before bulk approval', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select invoices
      await selectTableRows(page, [0, 1, 2]);

      // Click approve action
      await clickBulkAction(page, 'approve');

      // Confirmation dialog should appear
      const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
      await expect(dialog).toBeVisible();

      // Dialog should show count of items being approved
      await expect(dialog).toContainText('3');
    });

    test('canceling confirmation does not modify data', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Get initial pending count
      const initialCount = await page.locator('tbody tr').count();

      // Select and attempt to approve
      await selectTableRows(page, [0]);
      await clickBulkAction(page, 'approve');

      // Cancel the action
      await cancelBulkAction(page);

      // Count should be unchanged
      const finalCount = await page.locator('tbody tr').count();
      expect(finalCount).toBe(initialCount);
    });

    test('confirming approval updates invoice statuses', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Get initial pending count
      const initialCount = await page.locator('tbody tr').count();

      // Select and approve
      await selectTableRows(page, [0, 1]);
      await clickBulkAction(page, 'approve');
      await confirmBulkAction(page);

      // Wait for UI to update
      await page.waitForLoadState('networkidle');

      // Pending count should decrease by 2
      const finalCount = await page.locator('tbody tr').count();
      expect(finalCount).toBe(initialCount - 2);
    });
  });

  test.describe('Bulk Rejection Flow', () => {
    test('reject action is available for pending invoices', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      await selectTableRows(page, [0]);
      await expectBulkActionsAvailable(page, ['reject']);
    });

    test('rejection requires reason input', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices?status=pending`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      await selectTableRows(page, [0]);
      await clickBulkAction(page, 'reject');

      // Dialog should have reason field
      const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
      await expect(dialog).toBeVisible();

      const reasonInput = dialog.locator('textarea, input[name="reason"]');
      await expect(reasonInput).toBeVisible();
    });
  });

  test.describe('Bulk Export Flow', () => {
    test('export action is available for any selection', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      await selectTableRows(page, [0, 1, 2]);
      await expectBulkActionsAvailable(page, ['export']);
    });

    test('export downloads file for selected invoices', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      // Select invoices
      await selectTableRows(page, [0, 1]);

      // Start waiting for download before clicking
      const downloadPromise = page.waitForEvent('download');

      // Click export
      await clickBulkAction(page, 'export');

      // Wait for download to complete
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('invoices');
    });
  });

  test.describe('Accessibility', () => {
    test('bulk action toolbar has proper ARIA attributes', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      await selectTableRows(page, [0]);

      const toolbar = page.locator('[data-testid="bulk-action-toolbar"]');
      await expect(toolbar).toHaveAttribute('role', 'toolbar');
      await expect(toolbar).toHaveAttribute('aria-label');
    });

    test('selected row count is announced to screen readers', async ({ page }) => {
      await page.goto(`${BASE_URLS[ENV]}/app/finance/invoices`);
      await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });

      await selectTableRows(page, [0, 1]);

      const liveRegion = page.locator('[aria-live="polite"], [role="status"]');
      await expect(liveRegion).toContainText(/2.*selected/i);
    });
  });
});
