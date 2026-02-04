# =============================================================================
# Terraform Dev Environment - Main Configuration
# =============================================================================
#
# Full-stack Terraform for local Docker Compose development
# Mimics VPS/production structure but targets Docker Desktop
#
# Services Managed (23 total):
#   - Infrastructure: PostgreSQL, MongoDB, Redis, Elasticsearch, MinIO
#   - Identity: Keycloak (via keycloak module)
#   - API Gateway: Kong, Caddy
#   - MCP Servers: Gateway, HR, Finance, Sales, Support, Journey, Payroll, Tax (8)
#   - Web Apps: Portal, HR, Finance, Sales, Support, Payroll, Tax, Website (8)
#
# Usage:
#   cd infrastructure/terraform/dev
#   terraform init
#   terraform plan -var-file=dev.tfvars
#   terraform apply -var-file=dev.tfvars
#
# Created: 2025-12-30
# Updated: 2026-02-02 - Added Payroll and Tax modules
# =============================================================================

# =============================================================================
# LOCALS
# =============================================================================

locals {
  compose_path = "${var.project_root}/${var.docker_compose_dir}"
  env_file     = "${local.compose_path}/.env"

  # Service URLs for outputs (tamshai-playground ports - offset from tamshai-dev)
  services = {
    keycloak = {
      url  = "http://localhost:8190/auth"
      port = 8190
    }
    kong_proxy = {
      url  = "http://localhost:8110"
      port = 8110
    }
    kong_admin = {
      url  = "http://localhost:8111"
      port = 8111
    }
    mcp_gateway = {
      url  = "http://localhost:3110"
      port = 3110
    }
    mcp_hr = {
      url  = "http://localhost:3111"
      port = 3111
    }
    mcp_finance = {
      url  = "http://localhost:3112"
      port = 3112
    }
    mcp_sales = {
      url  = "http://localhost:3113"
      port = 3113
    }
    mcp_support = {
      url  = "http://localhost:3114"
      port = 3114
    }
    mcp_journey = {
      url  = "http://localhost:3115"
      port = 3115
    }
    mcp_payroll = {
      url  = "http://localhost:3116"
      port = 3116
    }
    mcp_tax = {
      url  = "http://localhost:3117"
      port = 3117
    }
    web_portal = {
      url  = "http://localhost:4010"
      port = 4010
    }
    web_hr = {
      url  = "http://localhost:4011"
      port = 4011
    }
    web_finance = {
      url  = "http://localhost:4012"
      port = 4012
    }
    web_sales = {
      url  = "http://localhost:4013"
      port = 4013
    }
    web_support = {
      url  = "http://localhost:4014"
      port = 4014
    }
    web_payroll = {
      url  = "http://localhost:4015"
      port = 4015
    }
    web_tax = {
      url  = "http://localhost:4016"
      port = 4016
    }
    website = {
      url  = "http://localhost:8085"
      port = 8085
    }
    postgres = {
      url  = "postgresql://localhost:5443"
      port = 5443
    }
    mongodb = {
      url  = "mongodb://localhost:27028"
      port = 27028
    }
    redis = {
      url  = "redis://localhost:6390"
      port = 6390
    }
    elasticsearch = {
      url  = "http://localhost:9211"
      port = 9211
    }
    minio = {
      url  = "http://localhost:9110"
      port = 9110
    }
    caddy = {
      url  = "https://localhost:8443"
      port = 8443
    }
  }
}

# =============================================================================
# PRE-FLIGHT CHECKS
# =============================================================================

# Verify hosts file contains tamshai-playground.local entry
resource "null_resource" "hosts_file_check" {
  provisioner "local-exec" {
    interpreter = ["powershell", "-Command"]
    command     = <<-EOT
      $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
      if (Test-Path $hostsPath) {
        $hosts = Get-Content $hostsPath -Raw
        if ($hosts -match "tamshai\.local") {
          Write-Host "✓ tamshai-playground.local found in hosts file" -ForegroundColor Green
        } else {
          Write-Host "ERROR: tamshai-playground.local not found in hosts file" -ForegroundColor Red
          Write-Host ""
          Write-Host "Please add the following entry to your hosts file:" -ForegroundColor Yellow
          Write-Host "  127.0.0.1  tamshai-playground.local www.tamshai-playground.local" -ForegroundColor Cyan
          Write-Host ""
          Write-Host "Run this command as Administrator:" -ForegroundColor Yellow
          Write-Host "  Add-Content -Path C:\Windows\System32\drivers\etc\hosts -Value '127.0.0.1  tamshai-playground.local www.tamshai-playground.local'" -ForegroundColor Cyan
          exit 1
        }
      } else {
        Write-Host "WARNING: Could not find hosts file at $hostsPath" -ForegroundColor Yellow
      }
    EOT
  }
}

# =============================================================================
# GITHUB SECRETS FETCH (Environment-Specific)
# =============================================================================
#
# Fetches user passwords from GitHub Secrets based on environment:
#   - dev   -> DEV_USER_PASSWORD, TEST_USER_PASSWORD
#   - stage -> STAGE_USER_PASSWORD, TEST_USER_PASSWORD
#   - prod  -> PROD_USER_PASSWORD, TEST_USER_PASSWORD
#
# =============================================================================

data "external" "github_secrets" {
  program = ["powershell", "-ExecutionPolicy", "Bypass", "-File", "${path.module}/scripts/fetch-github-secrets.ps1"]

  query = {
    environment = var.environment
  }
}

# =============================================================================
# GITHUB SECRETS VALIDATION
# =============================================================================
# All GitHub secrets are REQUIRED. Terraform will fail if any are missing.
# This ensures the environment is fully configured before deployment.
#
# Required secrets:
#   - DEV_USER_PASSWORD (or STAGE_USER_PASSWORD/PROD_USER_PASSWORD)
#   - TEST_USER_PASSWORD
#   - CLAUDE_API_KEY
# =============================================================================

resource "null_resource" "validate_github_secrets" {
  lifecycle {
    precondition {
      condition     = length(data.external.github_secrets.result.user_password) > 0
      error_message = "GitHub secret ${upper(var.environment)}_USER_PASSWORD is required but not set. Run: gh secret set ${upper(var.environment)}_USER_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.test_user_password) > 0
      error_message = "GitHub secret TEST_USER_PASSWORD is required but not set. Run: gh secret set TEST_USER_PASSWORD --body '<password>'"
    }
    precondition {
      condition     = length(data.external.github_secrets.result.claude_api_key) > 0
      error_message = "GitHub secret CLAUDE_API_KEY is required but not set. Run: gh secret set CLAUDE_API_KEY --body '<api-key>'"
    }
  }
}

# =============================================================================
# ENVIRONMENT FILE GENERATION
# =============================================================================

resource "local_file" "docker_env" {
  depends_on = [null_resource.validate_github_secrets]

  filename = local.env_file
  content = templatefile("${path.module}/templates/docker.env.tftpl", {
    # Database credentials
    postgres_password    = var.postgres_password
    tamshai_db_password  = var.tamshai_db_password
    keycloak_db_password = var.keycloak_db_password
    mongodb_password     = var.mongodb_root_password

    # Keycloak
    keycloak_admin          = "admin"
    keycloak_admin_password = var.keycloak_admin_password

    # MinIO
    minio_root_user     = var.minio_root_user
    minio_root_password = var.minio_root_password

    # Redis
    redis_password = var.redis_password

    # MCP Gateway
    # Use fetched key from GitHub secrets (CLAUDE_API_KEY), fallback to variable
    # Note: coalesce fails on all-empty, so we provide "not-set" as final fallback
    claude_api_key = coalesce(
      data.external.github_secrets.result.claude_api_key,
      var.claude_api_key,
      "not-set"
    )

    # MCP Journey (Project History Agent)
    # Use fetched key from GitHub secrets, fallback to variable
    # Empty string is valid (disables Gemini features)
    gemini_api_key = try(
      coalesce(data.external.github_secrets.result.gemini_api_key, var.gemini_api_key),
      ""
    )

    # Environment
    environment = var.environment

    # User passwords (from GitHub Secrets - environment-specific)
    dev_user_password  = data.external.github_secrets.result.user_password
    test_user_password = data.external.github_secrets.result.test_user_password
  })

  file_permission = "0600"
}

# =============================================================================
# DOCKER COMPOSE INFRASTRUCTURE
# =============================================================================

# Start Docker Compose services
resource "null_resource" "docker_compose_up" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [local_file.docker_env, null_resource.hosts_file_check, null_resource.validate_github_secrets]

  triggers = {
    env_file_hash = local_file.docker_env.content
    compose_dir   = local.compose_path
    project_name  = var.docker_compose_project
    always_run    = timestamp() # Always run on apply
  }

  provisioner "local-exec" {
    # First stop any existing containers and remove volumes to ensure clean state
    # Then rebuild all images (--no-cache ensures latest source files are used)
    # Finally start all services
    # This prevents race conditions and ensures Keycloak imports fresh realm config
    command     = "docker compose down -v --remove-orphans 2>/dev/null || true && docker compose build --no-cache && docker compose up -d"
    working_dir = local.compose_path
    environment = {
      COMPOSE_PROJECT_NAME = var.docker_compose_project
    }
  }
}

# Wait for services to be healthy
resource "null_resource" "wait_for_services" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.docker_compose_up]

  provisioner "local-exec" {
    command = <<-EOT
      echo "Waiting for services to be healthy..."

      # Wait for PostgreSQL (tamshai-pg-postgres for playground)
      for i in {1..30}; do
        if docker exec tamshai-pg-postgres pg_isready -U postgres > /dev/null 2>&1; then
          echo "PostgreSQL ready!"
          break
        fi
        echo "Waiting for PostgreSQL... ($i/30)"
        sleep 2
      done

      # Wait for Keycloak (port 8190 for playground)
      for i in {1..60}; do
        if curl -sf http://localhost:8190/health/ready > /dev/null 2>&1; then
          echo "Keycloak ready!"
          break
        fi
        echo "Waiting for Keycloak... ($i/60)"
        sleep 2
      done

      # Wait for Kong (port 8110 for playground)
      for i in {1..30}; do
        if curl -sf http://localhost:8110 > /dev/null 2>&1; then
          echo "Kong ready!"
          break
        fi
        echo "Waiting for Kong... ($i/30)"
        sleep 2
      done

      # Wait for MCP Gateway (port 3110 for playground)
      for i in {1..30}; do
        if curl -sf http://localhost:3110/health > /dev/null 2>&1; then
          echo "MCP Gateway ready!"
          break
        fi
        echo "Waiting for MCP Gateway... ($i/30)"
        sleep 2
      done

      # Wait for Caddy (HTTPS proxy on port 8443 for playground)
      for i in {1..30}; do
        if curl -sf -k https://localhost:8443 > /dev/null 2>&1; then
          echo "Caddy HTTPS ready!"
          break
        fi
        echo "Waiting for Caddy... ($i/30)"
        sleep 2
      done

      echo "All critical services are healthy!"
      echo ""
      echo "Access your dev environment at: https://www.tamshai-playground.local:8443"
      echo "(Accept the self-signed certificate warning in your browser)"
    EOT
  }
}

# =============================================================================
# KEYCLOAK REALM MANAGEMENT
# =============================================================================
#
# REMOVED: Terraform keycloak provider and module
#
# Keycloak realm is now managed via Docker's --import-realm flag for consistency
# across all environments (dev, stage, prod). The realm is loaded from:
#   - Dev/Stage: keycloak/realm-export-dev.json (includes test users)
#   - Production: keycloak/realm-export.json (no test users)
#
# This approach:
#   1. Ensures identical realm setup across all environments
#   2. Removes dependency on Terraform keycloak provider
#   3. Eliminates timing issues with provider initialization
#   4. Aligns with VPS deployment pattern
#
# To modify the realm:
#   1. Make changes in Keycloak admin UI
#   2. Export realm: Realm Settings > Action > Partial Export
#   3. Update keycloak/realm-export-dev.json or realm-export.json
#
# =============================================================================

# =============================================================================
# KEYCLOAK USER PASSWORD CONFIGURATION
# =============================================================================
#
# After Keycloak imports the realm from realm-export-dev.json, user passwords
# are placeholders. This resource sets actual passwords from GitHub Secrets.
#
# =============================================================================

resource "null_resource" "keycloak_set_passwords" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.wait_for_services]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Setting Keycloak user passwords via REST API..."

      # Get admin token
      echo "Authenticating with Keycloak Admin API..."
      TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8190/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=admin" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

      TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to get admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
      fi
      echo "✓ Admin token obtained"

      # Set test-user.journey password from TEST_USER_PASSWORD
      if [ -n "$TEST_USER_PASSWORD" ]; then
        echo "Setting test-user.journey password..."

        # Get user ID via REST API
        USER_ID=$(curl -s "http://localhost:8190/auth/admin/realms/tamshai-corp/users?username=test-user.journey&exact=true" \
          -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')

        if [ -n "$USER_ID" ]; then
          # Set password via REST API with jq for proper JSON encoding (handles special chars like @)
          PASSWORD_JSON=$(jq -n --arg pass "$TEST_USER_PASSWORD" '{"type":"password","value":$pass,"temporary":false}')
          HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
            "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USER_ID/reset-password" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$PASSWORD_JSON")

          if [ "$HTTP_CODE" = "204" ]; then
            echo "✓ test-user.journey password set successfully"
          else
            echo "ERROR: Failed to set test-user.journey password (HTTP $HTTP_CODE)"
            exit 1
          fi
        else
          echo "WARNING: test-user.journey not found in Keycloak"
        fi
      else
        echo "WARNING: TEST_USER_PASSWORD not set - E2E tests will fail"
      fi

      # Set corporate user passwords from DEV_USER_PASSWORD
      if [ -n "$DEV_USER_PASSWORD" ]; then
        echo "Setting corporate user passwords..."

        # Get all users via REST API
        ALL_USERS=$(curl -s "http://localhost:8190/auth/admin/realms/tamshai-corp/users?max=500" \
          -H "Authorization: Bearer $TOKEN")

        # Build password JSON once (same for all corporate users)
        CORP_PASSWORD_JSON=$(jq -n --arg pass "$DEV_USER_PASSWORD" '{"type":"password","value":$pass,"temporary":false}')

        CORP_COUNT=0
        for row in $(echo "$ALL_USERS" | jq -r '.[] | @base64'); do
          USERNAME=$(echo "$row" | base64 -d | jq -r '.username')
          USERID=$(echo "$row" | base64 -d | jq -r '.id')

          # Skip test-user.journey (uses TEST_USER_PASSWORD)
          if [ "$USERNAME" != "test-user.journey" ] && [ -n "$USERID" ]; then
            # Set password
            HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X PUT \
              "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USERID/reset-password" \
              -H "Authorization: Bearer $TOKEN" \
              -H "Content-Type: application/json" \
              -d "$CORP_PASSWORD_JSON")

            if [ "$HTTP_CODE" = "204" ]; then
              # Also clear requiredActions (removes CONFIGURE_TOTP requirement)
              # This enables integration tests to authenticate without MFA
              curl -s -o /dev/null -X PUT \
                "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USERID" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d '{"requiredActions":[]}'
              CORP_COUNT=$((CORP_COUNT + 1))
            fi
          fi
        done

        echo "✓ $CORP_COUNT corporate user passwords set and requiredActions cleared"
      else
        echo "WARNING: DEV_USER_PASSWORD not set - corporate users will have placeholder passwords"
      fi

      echo "Keycloak password configuration complete!"
    EOT

    environment = {
      TEST_USER_PASSWORD = data.external.github_secrets.result.test_user_password
      DEV_USER_PASSWORD  = data.external.github_secrets.result.user_password
      MSYS_NO_PATHCONV   = "1" # Prevent Git Bash from converting Unix paths to Windows paths
    }
  }
}

# =============================================================================
# KEYCLOAK TOTP CONFIGURATION
# =============================================================================
#
# Sets up TOTP for test-user.journey using the raw secret from GitHub Secrets.
# This ensures the TOTP matches the GitHub secret (TEST_USER_TOTP_SECRET_RAW)
# and E2E tests can use the corresponding BASE32 secret (TEST_USER_TOTP_SECRET).
#
# Keycloak's --import-realm doesn't reliably import OTP credentials, so we
# provision TOTP via the Admin API after Keycloak starts.
#
# =============================================================================

resource "null_resource" "keycloak_set_totp" {
  count = var.auto_start_services ? 1 : 0

  depends_on = [null_resource.keycloak_set_passwords]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      echo "Configuring TOTP for test-user.journey..."

      if [ -z "$TEST_USER_TOTP_SECRET_RAW" ]; then
        echo "WARNING: TEST_USER_TOTP_SECRET_RAW not set - TOTP will be auto-captured by E2E tests"
        exit 0
      fi

      # Get admin token
      echo "Getting admin token..."
      TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8190/auth/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=admin" \
        -d "password=admin" \
        -d "grant_type=password" \
        -d "client_id=admin-cli")

      TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to get admin token"
        echo "Response: $TOKEN_RESPONSE"
        exit 1
      fi

      # Get test-user.journey user ID
      echo "Finding test-user.journey..."
      USER_RESPONSE=$(curl -s "http://localhost:8190/auth/admin/realms/tamshai-corp/users?username=test-user.journey&exact=true" \
        -H "Authorization: Bearer $TOKEN")

      USER_ID=$(echo "$USER_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

      if [ -z "$USER_ID" ]; then
        echo "WARNING: test-user.journey not found in Keycloak"
        exit 0
      fi

      echo "User ID: $USER_ID"

      # Delete existing OTP credentials
      echo "Checking existing OTP credentials..."
      EXISTING_CREDS=$(curl -s "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials" \
        -H "Authorization: Bearer $TOKEN")

      for CRED_ID in $(echo "$EXISTING_CREDS" | grep -o '"id":"[^"]*"[^}]*"type":"otp"' | grep -o '"id":"[^"]*' | cut -d'"' -f4); do
        echo "Deleting existing OTP credential: $CRED_ID"
        curl -s -X DELETE "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials/$CRED_ID" \
          -H "Authorization: Bearer $TOKEN"
      done

      # Create new OTP credential with the known secret
      echo "Creating OTP credential with secret: $${TEST_USER_TOTP_SECRET_RAW:0:4}****"

      CREDENTIAL_JSON=$(cat <<EOF
{
  "type": "otp",
  "userLabel": "Terraform Provisioned",
  "secretData": "{\"value\":\"$TEST_USER_TOTP_SECRET_RAW\"}",
  "credentialData": "{\"subType\":\"totp\",\"period\":30,\"digits\":6,\"algorithm\":\"HmacSHA1\",\"counter\":0}"
}
EOF
)

      HTTP_CODE=$(curl -s -o /dev/null -w "%%{http_code}" -X POST \
        "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USER_ID/credentials" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$CREDENTIAL_JSON")

      if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        echo "✓ OTP credential created successfully (HTTP $HTTP_CODE)"
      else
        echo "WARNING: Direct credential creation returned HTTP $HTTP_CODE"
        echo "TOTP may need to be auto-captured by E2E tests"
      fi

      # Clear required actions to prevent TOTP setup prompt
      echo "Clearing required actions..."
      curl -s -X PUT \
        "http://localhost:8190/auth/admin/realms/tamshai-corp/users/$USER_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"requiredActions":[]}' > /dev/null

      echo "TOTP configuration complete!"
    EOT

    environment = {
      TEST_USER_TOTP_SECRET_RAW = data.external.github_secrets.result.test_user_totp_secret_raw
      MSYS_NO_PATHCONV          = "1"
    }
  }
}

# =============================================================================
# CLEANUP ON DESTROY
# =============================================================================

resource "null_resource" "docker_compose_down" {
  count = var.auto_stop_services ? 1 : 0

  triggers = {
    compose_dir    = local.compose_path
    project_name   = var.docker_compose_project
    remove_volumes = var.auto_remove_volumes
  }

  provisioner "local-exec" {
    when        = destroy
    command     = try(self.triggers.remove_volumes, "true") == "true" ? "docker compose down -v" : "docker compose down"
    working_dir = self.triggers.compose_dir
    environment = {
      COMPOSE_PROJECT_NAME = self.triggers.project_name
    }
  }
}
