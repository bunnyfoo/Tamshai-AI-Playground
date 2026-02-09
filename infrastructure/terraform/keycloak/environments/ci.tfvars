# ============================================================
# CI Environment Configuration (GitHub Actions)
# ============================================================
#
# SECRETS: The following variables must be passed via -var flags from GitHub secrets:
#   - keycloak_admin_password (from DEV_KEYCLOAK_ADMIN_PASSWORD)
#   - test_user_password (from DEV_USER_PASSWORD)
#   - mcp_gateway_client_secret (from DEV_MCP_GATEWAY_CLIENT_SECRET)
#
# ============================================================

# Keycloak connection settings (CI uses localhost, no /auth prefix)
# Note: CI Keycloak runs at root path, dev uses /auth due to KC_HTTP_RELATIVE_PATH
keycloak_url        = "http://localhost:8180"
keycloak_admin_user = "admin"
# keycloak_admin_password - MUST be passed via -var flag from GitHub secret

# Realm settings
realm_name         = "tamshai-corp"
realm_display_name = "Tamshai Corporation - CI"

# mcp_gateway_client_secret - MUST be passed via -var flag from GitHub secret
# test_user_password - MUST be passed via -var flag from GitHub secret

# Environment
environment = "ci"

# TLS settings (skip verification for CI)
tls_insecure_skip_verify = true

# Valid redirect URIs for CI
valid_redirect_uris = [
  "http://localhost:3100/*",
]
