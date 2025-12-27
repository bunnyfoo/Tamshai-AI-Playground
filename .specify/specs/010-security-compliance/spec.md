# Specification: Security Compliance & Governance

## 1. Business Intent

**User Story:** As the CISO, I require comprehensive security governance including compliance with GDPR, SOC 2, and GitHub security best practices, so that the organization can meet regulatory requirements and maintain customer trust.

**Business Value:** Ensures regulatory compliance, reduces risk of data breaches, maintains audit trail for investigations, and protects customer and employee data.

## 2. Access Control & Security

* **Required Role(s):** Security Administrator, Compliance Officer
* **Data Classification:** Confidential / Regulatory
* **PII Risks:** All PII handling governed by these policies
* **RLS Impact:** Enforces data access policies system-wide

---

## 3. GDPR Compliance

### 3.1 Overview

The General Data Protection Regulation (GDPR) applies to Tamshai Corp as we process personal data of EU residents. Key requirements:

| Article | Requirement | Implementation |
|---------|-------------|----------------|
| Art. 5 | Data Minimization | 50-record limit in AI queries (Constitutional Article III.2) |
| Art. 6 | Lawful Basis | Employment contract, legitimate business interests |
| Art. 12-14 | Transparency | Privacy notices, data handling documentation |
| Art. 15 | Right of Access (SAR) | `/api/gdpr/export` endpoint |
| Art. 17 | Right to Erasure | `/api/gdpr/delete` endpoint (with exceptions) |
| Art. 25 | Privacy by Design | RLS, data masking, secure token storage |
| Art. 32 | Security Measures | Encryption, access controls, audit logging |

### 3.2 HR Data and GDPR

**Lawful Basis for HR Data Processing:**

HR data is processed under multiple lawful bases that DO NOT require consent-based deletion:

| Data Category | Lawful Basis | Retention Requirement |
|---------------|--------------|----------------------|
| Employment records | Contract (Art. 6.1.b) | Duration of employment + legal requirement |
| Payroll data | Legal obligation (Art. 6.1.c) | 7 years (tax law) |
| Performance reviews | Legitimate interest (Art. 6.1.f) | Employment + 3 years |
| Health/safety records | Legal obligation (Art. 6.1.c) | Varies by jurisdiction |
| Training records | Legitimate interest (Art. 6.1.f) | Employment + 5 years |

**Right to Erasure Exceptions (Art. 17.3):**

HR data deletion requests may be refused when processing is necessary for:
- Compliance with legal obligations (tax, labor law)
- Exercise or defense of legal claims
- Archiving in the public interest

### 3.3 GDPR Data Export API (Art. 15 - Right of Access)

**Endpoint:** `POST /api/admin/gdpr/export`

**Access Control:** HR representatives only (`hr-write` role required)

**Note:** This is an HR-administered process. Data subjects (employees) would be offboarded and cannot request exports online. HR processes GDPR requests on their behalf.

**Request:**
```json
{
  "employeeId": "uuid",
  "reason": "GDPR Subject Access Request",
  "requestedBy": "hr-representative-id"
}
```

**Response:**
```json
{
  "exportId": "uuid",
  "status": "processing",
  "employeeId": "uuid",
  "createdAt": "2025-12-27T00:00:00Z",
  "estimatedCompletion": "2025-12-27T01:00:00Z",
  "downloadUrl": "/api/admin/gdpr/export/{exportId}/download"
}
```

**Export Contents:**
| Data Source | Data Included | Format |
|-------------|--------------|--------|
| MCP-HR | Employee profile, employment history, performance reviews | JSON |
| MCP-Finance | Salary history, expense reports, tax documents | JSON |
| MCP-Support | Support tickets created by/about employee | JSON |
| Audit Logs | AI queries made by employee (last 90 days) | JSON |

**Processing Timeline:**
- Acknowledgment: Immediate (async processing)
- Fulfillment: Within 1 hour for standard exports
- Download available for 7 days

### 3.4 GDPR Data Erasure API (Art. 17 - Right to Erasure)

**Endpoint:** `POST /api/admin/gdpr/erase`

**Access Control:** HR representatives only (`hr-write` role required)

**Request:**
```json
{
  "employeeId": "uuid",
  "reason": "GDPR erasure request - employee offboarded",
  "retainAuditLog": true,
  "retainFinancialRecords": true
}
```

**Response:**
```json
{
  "erasureId": "uuid",
  "status": "pending_confirmation",
  "employeeId": "uuid",
  "affectedSystems": ["mcp-hr", "mcp-finance", "mcp-support"],
  "retentionExceptions": [
    {"system": "mcp-finance", "reason": "7-year tax retention", "anonymized": true}
  ],
  "confirmationRequired": true,
  "confirmationUrl": "/api/admin/gdpr/erase/{erasureId}/confirm"
}
```

**Erasure Behavior:**
| Data Type | Action | Reason |
|-----------|--------|--------|
| Employee profile | Anonymize | Required for org history |
| Performance reviews | Delete | No retention requirement |
| Salary records | Anonymize | 7-year tax retention |
| Support tickets | Anonymize | May contain other PII |
| AI query logs | Delete | No retention requirement |

**Confirmation Flow:**
1. HR initiates erasure request
2. System returns affected data summary
3. HR confirms with `POST /api/admin/gdpr/erase/{erasureId}/confirm`
4. System performs erasure/anonymization
5. Audit log records erasure event

### 3.5 Breach Notification System

**Endpoint:** `POST /api/admin/gdpr/breach`

**Access Control:** HR representatives or Security role (`hr-write` or `security-admin` role)

**Request:**
```json
{
  "breachType": "unauthorized_access",
  "affectedDataTypes": ["employee_pii", "financial"],
  "affectedCount": 150,
  "discoveryDate": "2025-12-27T10:00:00Z",
  "description": "Unauthorized access to employee records detected",
  "containmentActions": ["Revoked compromised tokens", "Blocked suspicious IPs"]
}
```

**Response:**
```json
{
  "breachId": "uuid",
  "status": "registered",
  "notificationDeadline": "2025-12-30T10:00:00Z",
  "requiredActions": [
    {
      "action": "Notify supervisory authority",
      "deadline": "2025-12-30T10:00:00Z",
      "status": "pending",
      "template": "/api/admin/gdpr/breach/{breachId}/template/authority"
    },
    {
      "action": "Assess risk to affected individuals",
      "deadline": "2025-12-28T10:00:00Z",
      "status": "pending"
    }
  ],
  "affectedUserList": "/api/admin/gdpr/breach/{breachId}/affected-users"
}
```

**Breach Types:**
- `unauthorized_access` - Unauthorized viewing/copying of data
- `data_loss` - Data deleted or corrupted
- `ransomware` - Data encrypted by malicious actor
- `disclosure` - Data sent to wrong recipient
- `system_compromise` - System-wide security breach

**72-Hour Notification Workflow:**
1. Breach registered with discovery timestamp
2. System calculates 72-hour deadline
3. Generates notification templates
4. Tracks completion of required actions
5. Logs all breach response activities

### 3.6 Data Protection Impact Assessment (DPIA)

A DPIA is required for AI processing of HR data due to:
- Automated decision-making potential
- Large-scale processing of employee data
- Systematic monitoring (audit logs)

**DPIA Status:** Required before production deployment

---

## 4. SOC 2 Compliance

### 4.1 Trust Service Criteria

| Criteria | Status | Implementation |
|----------|--------|----------------|
| **Security** | ✅ Implemented | 6-layer defense model, MFA, encryption |
| **Availability** | ⚠️ Partial | Health checks, but no HA/DR yet |
| **Processing Integrity** | ✅ Implemented | Data validation, RLS, audit trails |
| **Confidentiality** | ✅ Implemented | Encryption at rest/transit, access controls |
| **Privacy** | ✅ Implemented | GDPR controls, data masking |

### 4.2 Security Controls Matrix

| Control ID | Control Description | Implementation | Evidence |
|------------|---------------------|----------------|----------|
| CC6.1 | Logical Access | Keycloak RBAC, JWT tokens | Token validation tests |
| CC6.2 | System Boundaries | Docker network isolation | docker-compose.yml |
| CC6.3 | External Threats | Rate limiting, prompt injection defense | Integration tests |
| CC6.4 | User Authentication | OIDC + TOTP MFA | Keycloak config |
| CC6.5 | Access Changes | Keycloak admin audit | Admin event logs |
| CC6.6 | Removal of Access | Token revocation, session management | Redis revocation |
| CC6.7 | Credential Management | Secure token storage | Platform keystores |
| CC6.8 | Encryption | TLS 1.3, AES-256 | Security headers |

### 4.3 Audit Trail Requirements

**Required Events:**
- User authentication (success/failure)
- AI queries with user context
- Data access (especially PII)
- Administrative actions
- Security configuration changes

**Retention:** 7 years for financial data, 2 years for access logs

---

## 5. GitHub Security Best Practices

### 5.1 Supply Chain Security

**Actions SHA Pinning:**

All GitHub Actions are pinned to full 40-character SHA commits to prevent supply chain attacks:

```yaml
# CORRECT - SHA pinned
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4

# WRONG - Tag version (vulnerable)
- uses: actions/checkout@v4
```

**Pinned Actions (13 total):**
- `actions/checkout` - v4
- `actions/setup-node` - v4
- `actions/upload-artifact` - v4
- `docker/setup-buildx-action` - v3
- `docker/build-push-action` - v5
- `codecov/codecov-action` - v4
- `github/codeql-action/*` - v3
- `anchore/sbom-action` - v0
- `anchore/scan-action` - v4

### 5.2 Dependency Management

**Dependabot Configuration:**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/services/mcp-gateway"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

**Security Audit Workflow:**
```yaml
- name: Run npm audit
  run: npm audit --audit-level=high
  # Fails pipeline on high/critical vulnerabilities
```

### 5.3 Code Ownership (CODEOWNERS)

```
# .github/CODEOWNERS
* @jcornell3

# Security-sensitive paths require security review
services/mcp-gateway/src/security/** @jcornell3
keycloak/** @jcornell3
infrastructure/terraform/** @jcornell3
.github/workflows/** @jcornell3
```

### 5.4 Branch Protection

**Required for `main` branch:**
- Pull request reviews required (minimum 1)
- Dismiss stale reviews on new commits
- Require status checks: "Gateway - Node 20", "Security - Dependency Audit"
- Require branches to be up to date
- Optional: Require signed commits

### 5.5 Security Scanning

| Scanner | Purpose | Trigger |
|---------|---------|---------|
| npm audit | Dependency vulnerabilities | Every PR |
| tfsec | Terraform security | On infra changes |
| CodeQL | Static analysis | Weekly + PR |
| SBOM Generation | Software bill of materials | Every release |
| Container Scan (Trivy) | Container vulnerabilities | On image build |

---

## 6. Threat Model Analysis

### 6.1 STRIDE Analysis

| Threat | Asset | Mitigation |
|--------|-------|------------|
| **Spoofing** | User Identity | OIDC + TOTP MFA, token validation |
| **Tampering** | JWT Tokens | RS256 signatures, audience validation |
| **Repudiation** | AI Queries | Comprehensive audit logging |
| **Information Disclosure** | HR Data | RLS, PII masking, encryption |
| **Denial of Service** | API Gateway | Rate limiting (60/min), k6 load tests |
| **Elevation of Privilege** | Role Access | RBAC, no client-side authorization |

### 6.2 AI-Specific Threats

| Threat | Description | Mitigation |
|--------|-------------|------------|
| Prompt Injection | Malicious instructions in queries | 5-layer prompt defense |
| Data Exfiltration | AI leaking unauthorized data | RLS, 50-record limit, output validation |
| Context Manipulation | Tricking AI about user roles | Server-side role extraction only |
| Training Data Poisoning | N/A | Using external Claude API (Anthropic responsibility) |

### 6.3 Attack Surface

```
                                    INTERNET
                                        │
                    ┌───────────────────┴────────────────────┐
                    │                                        │
              [Attack Surface 1]                      [Attack Surface 2]
              Kong Gateway :8100                      Keycloak :8180
              - Rate limiting                         - Brute force protection
              - Request validation                    - Account lockout
              - CORS                                  - MFA required
                    │                                        │
                    └─────────────┬──────────────────────────┘
                                  │
                         [Internal Only]
                       MCP Gateway :3100
                       - JWT validation
                       - Prompt defense
                       - Audit logging
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
               [Databases]   [Redis]      [MCP Servers]
               - RLS         - Token       - Tool access
               - Encryption  - Revocation  - Context propagation
```

---

## 7. Secrets Management

### 7.1 Secret Categories

| Category | Storage | Rotation | Examples |
|----------|---------|----------|----------|
| API Keys | Environment vars / Secret Manager | 90 days | ANTHROPIC_API_KEY |
| Database Passwords | Docker secrets | 30 days | POSTGRES_PASSWORD |
| Client Secrets | Keycloak config | On compromise | MCP_GATEWAY_CLIENT_SECRET |
| JWT Signing Keys | Keycloak auto-managed | 90 days | RS256 keys |
| User Tokens | Memory + OS keychain | 5 min (access) | JWT access tokens |

### 7.2 Environment Variable Security

**Current Implementation (docker-compose.yml):**
```yaml
environment:
  KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD:-admin}
  KC_DB_PASSWORD: ${KEYCLOAK_DB_PASSWORD:-keycloak_password}
  POSTGRES_PASSWORD: ${TAMSHAI_DB_PASSWORD:-tamshai_password}
  MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
```

**Development vs Production:**

| Environment | Secret Storage | Access Control |
|-------------|---------------|----------------|
| Development | `.env` file (gitignored) | Developer machine |
| CI/CD | GitHub Secrets | Repository admins |
| Production | Cloud Secret Manager | IAM policies |

### 7.3 Git History Audit

**Critical:** Before any production deployment, audit git history for secrets:

```bash
# Check for API keys
git log --all --full-history -S "sk-ant-api03" --oneline

# Check for hardcoded passwords
git log --all --full-history -S "[REDACTED-DEV-PASSWORD]" --oneline

# If secrets found, use BFG Repo-Cleaner:
bfg --replace-text secrets.txt repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 7.4 Keycloak Realm Separation

**Development (`keycloak/realm-export-dev.json`):**
- Test users with known passwords
- Shared TOTP secret for easy testing
- Not for production use

**Production (`keycloak/realm-export.json`):**
- No pre-configured users
- Client secret placeholder: `${MCP_GATEWAY_CLIENT_SECRET}`
- Users created via Admin API with temporary passwords
- Individual TOTP enrollment required

---

## 8. Incident Response

### 8.1 Severity Classification

| Level | Name | Response Time | Examples |
|-------|------|---------------|----------|
| P0 | Critical | 15 minutes | API key exposed, active breach |
| P1 | High | 1 hour | Suspicious activity, failed auth spike |
| P2 | Medium | 4 hours | Dependency CVE, config issue |
| P3 | Low | 24 hours | Security enhancement, policy update |

### 8.2 Response Procedures

**Documented in:** `docs/security/incident-response.md`

**Key Procedures:**
- Evidence preservation (log collection)
- Token revocation
- Service isolation
- Communication templates
- Post-incident review

### 8.3 Security Contacts

| Role | Responsibility |
|------|---------------|
| Security Lead | Incident classification, response coordination |
| On-Call Engineer | Initial investigation, containment |
| Infrastructure Lead | Service management, deployment |

---

## 9. Compliance Checklist

### 9.1 Pre-Production

- [ ] Rotate all API keys (especially Anthropic)
- [ ] Audit git history for secrets
- [ ] Enable branch protection on main
- [ ] Configure Dependabot alerts
- [ ] Complete DPIA for AI processing
- [ ] Document data retention policies
- [ ] Train staff on incident response

### 9.2 Ongoing

- [ ] Weekly dependency audits
- [ ] Monthly credential rotation
- [ ] Quarterly penetration testing
- [ ] Quarterly incident response drill
- [ ] Annual security architecture review

---

## 10. Success Criteria

### Implemented
- [x] GitHub Actions pinned to SHA
- [x] CODEOWNERS file configured
- [x] Rate limiting at gateway and application level
- [x] JWT audience validation enabled
- [x] TOTP upgraded to SHA-256
- [x] Security headers configured (Helmet.js)
- [x] Keycloak startup validation
- [x] Incident response runbook created
- [x] GDPR export/delete endpoints (stubs)
- [x] Environment variable substitution in docker-compose

### Pending (Manual Actions)
- [ ] Rotate Anthropic API key
- [ ] Audit git history for secrets
- [ ] Enable GitHub branch protection
- [ ] Complete DPIA

### Deferred
- [ ] mTLS for internal services (production)
- [ ] Full GDPR endpoint implementation

---

## Status

**COMPLETE ✅** - Security compliance framework established.

### Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| GDPR Framework | ✅ Defined | Endpoints stubbed, needs business logic |
| SOC 2 Controls | ✅ Mapped | Control matrix documented |
| GitHub Security | ✅ Implemented | SHA pinning, CODEOWNERS, Dependabot |
| Threat Model | ✅ Documented | STRIDE + AI-specific threats |
| Secrets Management | ✅ Implemented | Env var substitution, realm separation |
| Incident Response | ✅ Documented | Runbook at docs/security/incident-response.md |

### Architecture Version
**Created for**: v1.5 (December 2025)
**Security Score**: 73/100 → 88/100 (post-remediation)
