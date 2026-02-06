/**
 * Jest Integration Test Configuration
 *
 * Separate config for integration tests that require running services
 * (PostgreSQL, Redis, etc.)
 *
 * Environment variables can be provided via:
 * 1. Shell environment (highest priority)
 * 2. infrastructure/docker/.env file (auto-loaded if exists)
 * 3. Defaults in setup.ts (lowest priority)
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env file
// IMPORTANT: Use override: true to ensure .env values take precedence
// This handles stale env vars from previous Terraform runs
const envPath = path.resolve(__dirname, '../../infrastructure/docker/.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
}

// Validate required environment variables for integration tests
// Note: TAMSHAI_APP_PASSWORD is optional (defaults to 'changeme' matching sample-data/*.sql)
const REQUIRED_ENV_VARS = ['DEV_USER_PASSWORD', 'TAMSHAI_DB_PASSWORD', 'MONGODB_PASSWORD'];
const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.warn(`\n⚠️  Missing environment variables: ${missing.join(', ')}`);
  console.warn(`   Set them via shell or ensure infrastructure/docker/.env exists`);
  console.warn(`   Example: DEV_USER_PASSWORD=xxx npm run test:integration\n`);
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 1, // Run serially to avoid database conflicts
  testMatch: [
    '**/integration/**/*.test.ts',
    '**/integration/**/*.spec.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.ts'],
  testTimeout: 30000, // 30 second timeout for database operations
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)',
  ],
  // Integration tests are slower, disable coverage thresholds
  coverageThreshold: undefined,
};
