# Tasks: Security Compliance & Governance

## Completed Tasks

### GitHub Security
- [x] Pin all GitHub Actions to SHA commits (13 actions)
- [x] Create CODEOWNERS file
- [x] Configure Dependabot for dependencies
- [x] Remove continue-on-error from security scans
- [x] Fix docker/build-push-action typo

### Application Security
- [x] Enable JWT audience validation
- [x] Add application-level rate limiting (express-rate-limit)
- [x] Configure strict security headers (Helmet.js CSP, HSTS)
- [x] Add Keycloak JWKS startup validation
- [x] Upgrade TOTP to SHA-256 algorithm

### Secrets Management
- [x] Implement environment variable substitution in docker-compose
- [x] Create separate dev/prod Keycloak realm exports
- [x] Document secret categories and rotation policies
- [x] Deprecate token query parameter for SSE

### Documentation
- [x] Create incident response runbook
- [x] Document GDPR compliance requirements
- [x] Document SOC 2 control mappings
- [x] Document threat model (STRIDE + AI-specific)

---

## Pending Tasks (Manual Actions Required)

### P0 - Critical (Before Production)

#### P0-1: Rotate Anthropic API Key
**Owner:** Security Lead
**Action:**
1. Log into console.anthropic.com
2. Revoke current API key
3. Generate new API key
4. Update `.env` file
5. Restart services

#### P0-2: Audit Git History for Secrets
**Owner:** Security Lead
**Action:**
```bash
# Check for leaked secrets
git log --all --full-history -S "sk-ant-api03" --oneline
git log --all --full-history -S "[REDACTED-DEV-PASSWORD]" --oneline

# If found, clean with BFG
bfg --replace-text secrets.txt repo.git
```

### P1 - High (This Week)

#### P1-1: Enable Branch Protection
**Owner:** Repository Admin
**Action:**
- Navigate to GitHub → Settings → Branches
- Add rule for `main` branch:
  - Require pull request reviews (1 approver)
  - Dismiss stale reviews
  - Require status checks: "Gateway - Node 20", "Security - Dependency Audit"
  - Enforce for administrators

---

## Future Tasks (Phase 5)

### GDPR Implementation
- [ ] Implement full `/api/gdpr/export` with data aggregation
- [ ] Implement `/api/gdpr/delete` with retention exceptions
- [ ] Add SAR workflow to HR App
- [ ] Complete Data Protection Impact Assessment

### SOC 2 Audit Preparation
- [ ] Document all control implementations with evidence
- [ ] Configure centralized audit log storage
- [ ] Implement log retention policies (7 years for financial)
- [ ] Schedule penetration testing

### Infrastructure Security
- [ ] Implement mTLS for service-to-service communication
- [ ] Enable encryption at rest for Docker volumes
- [ ] Configure WAF rules for production
- [ ] Implement geo-blocking if applicable

---

## Verification Commands

```bash
# Verify GitHub Actions are pinned
grep -E "uses:.*@[a-f0-9]{40}" .github/workflows/*.yml | wc -l
# Expected: 13

# Check for continue-on-error in security scans
grep "continue-on-error: true" .github/workflows/ci.yml
# Expected: No output (should be removed)

# Verify CODEOWNERS exists
cat .github/CODEOWNERS

# Check rate limiting is configured
grep "rateLimit" services/mcp-gateway/src/index.ts
```
