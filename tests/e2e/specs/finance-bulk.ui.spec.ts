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

import { test, expect, BrowserContext } from '@playwright/test';
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
  createAuthenticatedContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const INVOICES_URL = `${BASE_URLS[ENV]}/app/finance/invoices`;

let authenticatedContext: BrowserContext | null = null;

test.describe('Finance Invoice Bulk Operations', () => {
  let snapshotId: string;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
  });

  test.afterEach(async () => {
    // Rollback to clean state after each test
    await rollbackToSnapshot(snapshotId);
  });

  test.describe('Bulk Action Toolbar State', () => {
    test('bulk action menu is disabled when no rows are selected', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await expectBulkMenuDisabled(page);
      } finally {
        await page.close();
      }
    });

    test('bulk action menu enables when rows are selected', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await expectBulkMenuEnabled(page);
      } finally {
        await page.close();
      }
    });

    test('bulk action menu disables when all rows are deselected', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await expectBulkMenuEnabled(page);
        await deselectTableRows(page, [0]);
        await expectBulkMenuDisabled(page);
      } finally {
        await page.close();
      }
    });

    test('shows correct selected count in toolbar', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1, 2]);
        await expectSelectedCount(page, 3);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Row Selection Behavior', () => {
    test('individual row checkboxes toggle selection', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        expect(await getSelectedRowCount(page)).toBe(1);
        await selectTableRows(page, [1]);
        expect(await getSelectedRowCount(page)).toBe(2);
        await deselectTableRows(page, [0]);
        expect(await getSelectedRowCount(page)).toBe(1);
      } finally {
        await page.close();
      }
    });

    test('header checkbox selects all visible rows', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        const rowCount = await page.locator('tbody tr').count();
        await selectAllRows(page);
        expect(await getSelectedRowCount(page)).toBe(rowCount);
      } finally {
        await page.close();
      }
    });

    test('header checkbox deselects all when all are selected', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectAllRows(page);
        expect(await getSelectedRowCount(page)).toBeGreaterThan(0);
        await deselectAllRows(page);
        expect(await getSelectedRowCount(page)).toBe(0);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Approval Flow', () => {
    test('approve action is available for pending invoices', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1]);
        await expectBulkActionsAvailable(page, ['approve']);
      } finally {
        await page.close();
      }
    });

    test('shows confirmation dialog before bulk approval', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1, 2]);
        await clickBulkAction(page, 'approve');
        const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText('3');
      } finally {
        await page.close();
      }
    });

    test('canceling confirmation does not modify data', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        const initialCount = await page.locator('tbody tr').count();
        await selectTableRows(page, [0]);
        await clickBulkAction(page, 'approve');
        await cancelBulkAction(page);
        const finalCount = await page.locator('tbody tr').count();
        expect(finalCount).toBe(initialCount);
      } finally {
        await page.close();
      }
    });

    test('confirming approval updates invoice statuses', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        const initialCount = await page.locator('tbody tr').count();
        await selectTableRows(page, [0, 1]);
        await clickBulkAction(page, 'approve');
        await confirmBulkAction(page);
        await page.waitForLoadState('networkidle');
        const finalCount = await page.locator('tbody tr').count();
        expect(finalCount).toBe(initialCount - 2);
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Rejection Flow', () => {
    test('reject action is available for pending invoices', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await expectBulkActionsAvailable(page, ['reject']);
      } finally {
        await page.close();
      }
    });

    test('rejection requires reason input', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(`${INVOICES_URL}?status=pending`);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        await clickBulkAction(page, 'reject');
        const dialog = page.locator('[role="dialog"][data-testid="confirm-dialog"]');
        await expect(dialog).toBeVisible();
        const reasonInput = dialog.locator('textarea, input[name="reason"]');
        await expect(reasonInput).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Bulk Export Flow', () => {
    test('export action is available for any selection', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1, 2]);
        await expectBulkActionsAvailable(page, ['export']);
      } finally {
        await page.close();
      }
    });

    test('export downloads file for selected invoices', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1]);
        const downloadPromise = page.waitForEvent('download');
        await clickBulkAction(page, 'export');
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('invoices');
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('bulk action toolbar has proper ARIA attributes', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0]);
        const toolbar = page.locator('[data-testid="bulk-action-toolbar"]');
        await expect(toolbar).toHaveAttribute('role', 'toolbar');
        await expect(toolbar).toHaveAttribute('aria-label');
      } finally {
        await page.close();
      }
    });

    test('selected row count is announced to screen readers', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();
      try {
        await page.goto(INVOICES_URL);
        await page.waitForSelector('[data-testid="data-table"]', { timeout: 10000 });
        await selectTableRows(page, [0, 1]);
        const liveRegion = page.locator('[aria-live="polite"], [role="status"]');
        await expect(liveRegion).toContainText(/2.*selected/i);
      } finally {
        await page.close();
      }
    });
  });
});
