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
 * Create an authenticated browser context.
 * Authenticates once via Keycloak SSO, then returns a context
 * whose cookies are valid for all subsequent page navigations.
 *
 * Usage in specs:
 *   let ctx: BrowserContext;
 *   test.beforeAll(async ({ browser }) => { ctx = await createAuthenticatedContext(browser); });
 *   test.afterAll(async () => { await ctx?.close(); });
 *   test('...', async () => { const page = await ctx.newPage(); ... await page.close(); });
 */
export async function createAuthenticatedContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ ignoreHTTPSErrors: ENV === 'dev' });
  const page = await context.newPage();
  await authenticateUser(page);
  await page.close();
  return context;
}
