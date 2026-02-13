# ============================================================
# CI Environment Configuration (GitHub Actions)
# ============================================================
#
# SECRETS: The following variables must be passed via -var flags from GitHub secrets:
#   - keycloak_admin_password (from DEV_KEYCLOAK_ADMIN_PASSWORD)
#   - test_user_password (from DEV_USER_PASSWORD)
#   - mcp_gateway_client_secret (from DEV_MCP_GATEWAY_CLIENT_SECRET)
#   - mcp_integration_runner_secret (from MCP_INTEGRATION_RUNNER_SECRET)
#
# ============================================================

# Keycloak connection settings (CI uses localhost, no /auth prefix)
# Note: CI Keycloak runs at root path, dev uses /auth due to KC_HTTP_RELATIVE_PATH
# IMPORTANT: In CI, keycloak_url is overridden via -var flag using ${{ vars.DEV_PG_KEYCLOAK }}
# The port here is a fallback; the CI workflow passes the actual port via -var flag.
keycloak_url        = "http://localhost:8190"
keycloak_admin_user = "admin"
# keycloak_admin_password - MUST be passed via -var flag from GitHub secret

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - CI"

# mcp_gateway_client_secret - MUST be passed via -var flag from GitHub secret
# test_user_password - MUST be passed via -var flag from GitHub secret
# mcp_integration_runner_secret - MUST be passed via -var flag from GitHub secret

# Environment
environment = "ci"

# TLS settings (skip verification for CI)
tls_insecure_skip_verify = true

# Valid redirect URIs for CI
# IMPORTANT: In CI, overridden via -var flag using ${{ vars.DEV_PG_MCP_GATEWAY }}
# The port here is a fallback; the CI workflow passes the actual port via -var flag.
valid_redirect_uris = [
  "http://localhost:3110/*",
]

# Explicit CORS origins (no wildcard paths)
web_origins = [
  "http://localhost:3110",
]

# OAuth Flows
# ROPC (Resource Owner Password Credentials) DISABLED - migration complete (2026-02-13)
# Tests use token exchange (mcp-integration-runner) and client credentials (admin-cli)
# See docs/security/ROPC_ASSESSMENT.md for security rationale
direct_access_grants_enabled = false
