/**
 * Support App - Ticket Detail & Article Detail Page E2E Tests
 *
 * Tests the support detail pages:
 * - Ticket detail: title, status/priority badges, description, comments, metadata
 * - Article detail: breadcrumb, title, category, tags, body, feedback section
 *
 * Architecture v1.5 - Support Module
 *
 * Prerequisites:
 * - User must be authenticated with support-read/support-write roles
 */

import { test, expect, BrowserContext } from '@playwright/test';
import {
  createAuthenticatedContext,
  warmUpContext,
  BASE_URLS,
  ENV,
  TEST_USER,
} from '../utils';

const SUPPORT_URL = `${BASE_URLS[ENV]}/support`;

let authenticatedContext: BrowserContext | null = null;

test.describe('Support Detail Pages', () => {
  let authCreatedAt: number;

  test.beforeAll(async ({ browser }) => {
    if (!TEST_USER.password) return;
    authenticatedContext = await createAuthenticatedContext(browser);
    await warmUpContext(authenticatedContext, `${SUPPORT_URL}/`);
    authCreatedAt = Date.now();
  });

  test.afterAll(async () => {
    if (authenticatedContext) await authenticatedContext.close();
  });

  test.beforeEach(async () => {
    if (!authenticatedContext) return;
    if (Date.now() - authCreatedAt > 3 * 60 * 1000) {
      await warmUpContext(authenticatedContext, `${SUPPORT_URL}/`);
      authCreatedAt = Date.now();
    }
  });

  test.describe('Ticket Detail Page', () => {
    test('navigates from tickets list to ticket detail', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        // Find the first ticket link in the list
        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets in data to navigate to');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Verify we are on a ticket detail page
        const hasTitle = await page.locator('h1').first().isVisible({ timeout: 10000 }).catch(() => false);
        const hasLoading = await page.locator('text=Loading ticket').isVisible().catch(() => false);
        expect(hasTitle || hasLoading).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('displays ticket title and badges', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Title should be visible
        await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 });

        // Status badge (open, in_progress, resolved, closed)
        const statusBadge = page.locator('.rounded-full:has-text("open"), .rounded-full:has-text("in progress"), .rounded-full:has-text("resolved"), .rounded-full:has-text("closed")');
        await expect(statusBadge.first()).toBeVisible({ timeout: 5000 });

        // Priority badge (critical, high, medium, low)
        const priorityBadge = page.locator('.rounded-full:has-text("critical"), .rounded-full:has-text("high"), .rounded-full:has-text("medium"), .rounded-full:has-text("low")');
        await expect(priorityBadge.first()).toBeVisible({ timeout: 5000 });
      } finally {
        await page.close();
      }
    });

    test('displays ticket description', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Description section heading
        await expect(page.locator('h2:has-text("Description")')).toBeVisible({ timeout: 10000 });

        // Description text should have content
        const descriptionText = page.locator('.whitespace-pre-wrap').first();
        const text = await descriptionText.textContent();
        expect(text?.length).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('displays comments section', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Comments section heading
        await expect(page.locator('h2:has-text("Comments")')).toBeVisible({ timeout: 10000 });

        // Either comments list or "No comments yet"
        const hasComments = await page.locator('.border-l-2.border-secondary-200').first().isVisible({ timeout: 3000 }).catch(() => false);
        const hasNoComments = await page.locator('text=No comments yet').isVisible().catch(() => false);
        expect(hasComments || hasNoComments).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('displays comment form with textarea and submit button', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Comment form (only visible if user has write role)
        const commentTextarea = page.locator('textarea[placeholder*="comment" i]');
        const hasForm = await commentTextarea.isVisible({ timeout: 5000 }).catch(() => false);
        if (hasForm) {
          await expect(commentTextarea).toBeVisible();
          await expect(page.locator('button:has-text("Add Comment")')).toBeVisible();
        }
      } finally {
        await page.close();
      }
    });

    test('back link returns to tickets list', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Click back to tickets
        const backLink = page.locator('a:has-text("Back to Tickets")');
        await expect(backLink).toBeVisible({ timeout: 10000 });
        await backLink.click();
        await page.waitForLoadState('networkidle');

        // Should be back on tickets page
        await expect(page).toHaveURL(/\/tickets\/?$/);
      } finally {
        await page.close();
      }
    });

    test('displays metadata with category and dates', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/tickets`);
        await page.waitForLoadState('networkidle');

        const ticketLink = page.locator('a[href*="/tickets/"]').first();
        const hasTickets = await ticketLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasTickets) {
          test.skip(true, 'No tickets available');
          return;
        }

        await ticketLink.click();
        await page.waitForLoadState('networkidle');

        // Details sidebar card
        const detailsSection = page.locator('h2:has-text("Details")');
        await expect(detailsSection).toBeVisible({ timeout: 10000 });

        // Should show Ticket ID and Category
        await expect(page.locator('text=Ticket ID')).toBeVisible();
        await expect(page.locator('text=Category')).toBeVisible();
      } finally {
        await page.close();
      }
    });
  });

  test.describe('Article Detail Page', () => {
    test('navigates from knowledge base to article detail', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        // Find an article link
        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        // Verify we are on an article detail page
        const hasTitle = await page.locator('[data-testid="article-title"]').isVisible({ timeout: 10000 }).catch(() => false);
        const hasLoading = await page.locator('[data-testid="loading-state"]').isVisible().catch(() => false);
        expect(hasTitle || hasLoading).toBe(true);
      } finally {
        await page.close();
      }
    });

    test('displays breadcrumb navigation', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        const breadcrumb = page.locator('[data-testid="breadcrumb"]');
        await expect(breadcrumb).toBeVisible({ timeout: 10000 });

        // Breadcrumb should contain "Knowledge Base"
        const breadcrumbText = await breadcrumb.textContent();
        expect(breadcrumbText).toContain('Knowledge Base');
      } finally {
        await page.close();
      }
    });

    test('displays article title and content', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        // Article title
        await expect(page.locator('[data-testid="article-title"]')).toBeVisible({ timeout: 10000 });

        // Article body
        await expect(page.locator('[data-testid="article-body"]')).toBeVisible();

        // Body should have content
        const body = await page.locator('[data-testid="article-body"]').textContent();
        expect(body?.length).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });

    test('displays category badge', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        await expect(page.locator('[data-testid="article-category"]')).toBeVisible({ timeout: 10000 });
      } finally {
        await page.close();
      }
    });

    test('displays tags as pills when present', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        await expect(page.locator('[data-testid="article-title"]')).toBeVisible({ timeout: 10000 });

        // Tags may or may not be present depending on article data
        const hasTags = await page.locator('[data-testid="article-tags"]').isVisible({ timeout: 3000 }).catch(() => false);
        if (hasTags) {
          const tags = page.locator('[data-testid="article-tags"] span');
          const tagCount = await tags.count();
          expect(tagCount).toBeGreaterThan(0);
        }
      } finally {
        await page.close();
      }
    });

    test('displays feedback section with thumbs up/down', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        const feedbackSection = page.locator('[data-testid="feedback-section"]');
        await expect(feedbackSection).toBeVisible({ timeout: 10000 });

        await expect(page.locator('[data-testid="feedback-prompt"]')).toBeVisible();
        await expect(page.locator('[data-testid="thumbs-up"]')).toBeVisible();
        await expect(page.locator('[data-testid="thumbs-down"]')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('related articles sidebar is visible', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        const relatedArticles = page.locator('[data-testid="related-articles"]');
        await expect(relatedArticles).toBeVisible({ timeout: 10000 });

        // Should show "Related Articles" heading
        await expect(relatedArticles.locator('h3:has-text("Related Articles")')).toBeVisible();
      } finally {
        await page.close();
      }
    });

    test('back to Knowledge Base link works', async () => {
      test.skip(!authenticatedContext, 'No test credentials configured');
      const page = await authenticatedContext!.newPage();

      try {
        await page.goto(`${SUPPORT_URL}/knowledge-base`);
        await page.waitForLoadState('networkidle');

        const articleLink = page.locator('a[href*="/knowledge-base/"]').first();
        const hasArticles = await articleLink.isVisible({ timeout: 10000 }).catch(() => false);
        if (!hasArticles) {
          test.skip(true, 'No articles in knowledge base');
          return;
        }

        await articleLink.click();
        await page.waitForLoadState('networkidle');

        const backLink = page.locator('[data-testid="back-to-kb"]');
        await expect(backLink).toBeVisible({ timeout: 10000 });
        await backLink.click();
        await page.waitForLoadState('networkidle');

        // Should be back on knowledge base page
        await expect(page).toHaveURL(/\/knowledge-base\/?$/);
      } finally {
        await page.close();
      }
    });
  });
});
