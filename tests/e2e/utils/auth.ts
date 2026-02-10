/**
 * Shared Authentication Utilities for E2E Tests
 *
 * Provides reusable TOTP handling and Keycloak SSO login flow
 * for specs that access protected app routes.
 *
 * TOTP secret priority (matches login-journey.ui.spec.ts):
 *   1. Cache file (.totp-secrets/) — globalSetup writes Base32-encoded bridge value
 *   2. Environment variable (TEST_USER_TOTP_SECRET) — raw fallback
 */

import { Page, Browser, BrowserContext } from '@playwright/test';
import { execSync } from 'child_process';
import { authenticator } from 'otplib';
import * as fs from 'fs';
import * as path from 'path';

const TOTP_SECRETS_DIR = path.join(__dirname, '..', '.totp-secrets');

export const ENV = process.env.TEST_ENV || 'dev';

export const BASE_URLS: Record<string, string> = {
  dev: `https://www.tamshai-playground.local:${process.env.PORT_CADDY_HTTPS || '8443'}`,
  stage: 'https://www.tamshai.com',
  prod: 'https://app.tamshai.com',
};

export const TEST_USER = {
  username: process.env.TEST_USERNAME || 'test-user.journey',
  password: process.env.TEST_USER_PASSWORD || '',
  totpSecret: process.env.TEST_USER_TOTP_SECRET || '',
};

export function loadTotpSecret(username: string, environment: string): string | null {
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

export function generateTotpCode(secret: string): string {
  if (!secret) throw new Error('TOTP secret required');

  if (isOathtoolAvailable()) {
    try {
      return execSync('oathtool "$TOTP_SECRET"', {
        encoding: 'utf-8',
        env: { ...process.env, TOTP_SECRET: secret },
        shell: '/bin/bash',
      }).trim();
    } catch {
      // Fall through to otplib
    }
  }

  authenticator.options = { digits: 6, step: 30, algorithm: 'sha1' };
  return authenticator.generate(secret);
}

/**
 * Authenticate via Keycloak SSO.
 * Navigates to portal, enters credentials + TOTP, waits for auth to complete.
 * After return, the page's browser context holds the authenticated session cookies.
 */
export async function authenticateUser(page: Page): Promise<void> {
  const baseUrl = BASE_URLS[ENV];

  // Navigate to portal — auto-redirects to Keycloak SSO
  await page.goto(`${baseUrl}/app/`);

  await page.waitForSelector('#username, input[name="username"]', {
    state: 'visible',
    timeout: 30000,
  });
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
      // Cache file first (globalSetup writes Base32-encoded bridge value),
      // then fall back to raw env var
      const totpSecret = loadTotpSecret(TEST_USER.username, ENV) || TEST_USER.totpSecret || '';
      if (!totpSecret) {
        throw new Error('TOTP required but no secret available');
      }
      const totpCode = generateTotpCode(totpSecret);
      await page.fill('#otp, input[name="otp"]', totpCode);
      await page.click('#kc-login, button[type="submit"]');
    }
  } catch {
    // TOTP not required — continue
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 });
}

/**
 * Track the last TOTP 30-second window used for authentication.
 * Keycloak rejects reused TOTP codes within the same window, so we must
 * wait for the next window before creating a new auth context.
 */
let lastTotpWindow = 0;

async function ensureFreshTotpWindow(): Promise<void> {
  const currentWindow = Math.floor(Date.now() / 1000 / 30);
  if (lastTotpWindow > 0 && currentWindow <= lastTotpWindow) {
    const secondsUntilNextWindow = 30 - (Math.floor(Date.now() / 1000) % 30);
    await new Promise(resolve => setTimeout(resolve, (secondsUntilNextWindow + 1) * 1000));
  }
  lastTotpWindow = Math.floor(Date.now() / 1000 / 30);
}

/**
 * Create an authenticated browser context.
 * Authenticates once via Keycloak SSO, then returns a context
 * whose session is available to all subsequent pages.
 *
 * IMPORTANT: The @tamshai/auth library stores OIDC tokens in sessionStorage
 * (per-tab). Playwright's context.newPage() creates new tabs with empty
 * sessionStorage. We capture the sessionStorage after auth and inject it
 * into all future pages via context.addInitScript() so every new page
 * starts with valid tokens.
 *
 * TOTP WINDOW GUARD: Each call waits for a fresh 30-second TOTP window
 * to prevent Keycloak from rejecting a reused code.
 *
 * Usage in specs:
 *   let ctx: BrowserContext;
 *   test.beforeAll(async ({ browser }) => { ctx = await createAuthenticatedContext(browser); });
 *   test.afterAll(async () => { await ctx?.close(); });
 *   test('...', async () => { const page = await ctx.newPage(); ... await page.close(); });
 */
export async function createAuthenticatedContext(browser: Browser): Promise<BrowserContext> {
  await ensureFreshTotpWindow();
  const context = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
  const page = await context.newPage();
  await authenticateUser(page);

  // Capture sessionStorage (contains OIDC tokens) from the authenticated page
  const sessionData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      data[key] = sessionStorage.getItem(key)!;
    }
    return data;
  });

  await page.close();

  // Inject captured sessionStorage into every new page created in this context.
  // This runs before the app's scripts, so the auth provider finds valid tokens
  // immediately and skips the Keycloak redirect.
  if (Object.keys(sessionData).length > 0) {
    await context.addInitScript((data: Record<string, string>) => {
      for (const [key, value] of Object.entries(data)) {
        sessionStorage.setItem(key, value);
      }
    }, sessionData);
  }

  return context;
}

/**
 * Warm up an authenticated context by visiting an app URL.
 *
 * The initial tokens captured by createAuthenticatedContext come from the
 * portal page. When a sub-app (e.g. /support/, /payroll/) loads, its OIDC
 * client may not accept portal-scoped tokens and will silently redirect
 * through Keycloak SSO to obtain app-specific tokens.
 *
 * This function completes that redirect cycle and re-captures the resulting
 * sessionStorage so every subsequent page in the context starts with the
 * correct tokens — eliminating further redirects.
 *
 * @param ctx - Authenticated browser context from createAuthenticatedContext
 * @param url - Target app URL to warm up (e.g. BASE_URLS[ENV] + '/support/sla')
 * @param selectors - Optional CSS selector to wait for (default: '[data-testid], .page-container')
 */
export async function warmUpContext(
  ctx: BrowserContext,
  url: string,
  selectors: string = '[data-testid], .page-container, h1, h2',
): Promise<void> {
  const warmup = await ctx.newPage();
  try {
    await warmup.goto(url, { timeout: 60000 });
    // Wait for the app to fully render (after potential OIDC redirect cycle)
    try {
      await warmup.waitForSelector(selectors, { timeout: 45000 });
    } catch {
      // Selector wait failed, but OIDC redirect may have completed.
      // Wait a bit more for tokens to settle in sessionStorage.
      await warmup.waitForTimeout(3000);
    }

    // Re-capture sessionStorage which now contains app-specific OIDC tokens
    const sessionData = await warmup.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        data[key] = sessionStorage.getItem(key)!;
      }
      return data;
    });

    // Add new initScript with app-specific tokens (addInitScript accumulates;
    // the last write to each sessionStorage key wins)
    if (Object.keys(sessionData).length > 0) {
      await ctx.addInitScript((data: Record<string, string>) => {
        for (const [key, value] of Object.entries(data)) {
          sessionStorage.setItem(key, value);
        }
      }, sessionData);
    }
  } catch {
    // Warm-up failure is non-fatal; tests may still pass via Keycloak SSO cookies
  }
  await warmup.close();
}
