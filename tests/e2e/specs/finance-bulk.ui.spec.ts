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
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const INVOICES_URL = `${BASE_URLS[ENV]}/finance/invoices`;

let authenticatedContext: BrowserContext | null = null;

/**
 * Warm up an authenticated context by visiting the app URL once.
 * This primes PrivateRoute OIDC checks so subsequent pages render immediately.
 */

test.describe('Finance Invoice Bulk Operations', () => {
  let snapshotId: string;
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
    authCreatedAt = Date.now();
    snapshotId = await createDatabaseSnapshot();
  });

  test.afterAll(async () => {
    await authenticatedContext?.close();
  });

  // Proactively refresh auth tokens before they expire.
  // Access tokens have a 5-minute lifetime; re-warm after 4 minutes.
  test.beforeEach(async () => {
    if (!authenticatedContext) return;
    if (Date.now() - authCreatedAt > 3 * 60 * 1000) {
      await warmUpContext(authenticatedContext, `${BASE_URLS[ENV]}/finance/`);
      authCreatedAt = Date.now();
    }
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

        // After local confirm dialog, the MCP tool returns pending_confirmation
        // which renders an ApprovalCard for human-in-the-loop confirmation
        const apiConfirmation = page.locator('[data-testid="api-confirmation"]');
        await expect(apiConfirmation).toBeVisible({ timeout: 5000 });

        // Click "Approve" in the ApprovalCard and wait for confirmation API response
        const [confirmResponse] = await Promise.all([
          page.waitForResponse((res) => res.url().includes('/api/confirm/'), { timeout: 10000 }),
          apiConfirmation.locator('.btn-success').click(),
        ]);
        expect(confirmResponse.status()).toBe(200);

        // Wait for ApprovalCard to disappear and data to refresh
        await expect(apiConfirmation).not.toBeVisible({ timeout: 10000 });
        await page.waitForResponse(
          (res) => res.url().includes('list_invoices') && res.status() === 200,
          { timeout: 10000 }
        );

        // Allow React to re-render with new data
        await page.waitForTimeout(500);
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
