# Implementation Plan: Security Compliance & Governance

## Overview

This plan outlines the implementation of comprehensive security compliance covering GDPR, SOC 2, GitHub security, threat modeling, and secrets management.

## Implementation Phases

### Phase 1: Foundation (COMPLETE)

**Objective:** Establish baseline security controls

**Completed:**
1. ✅ GitHub Actions SHA pinning (13 actions)
2. ✅ CODEOWNERS configuration
3. ✅ Application-level rate limiting
4. ✅ JWT audience validation
5. ✅ TOTP SHA-256 upgrade
6. ✅ Strict security headers (Helmet.js)
7. ✅ Keycloak startup validation
8. ✅ Environment variable substitution
9. ✅ Realm separation (dev/prod)
10. ✅ Incident response runbook

### Phase 2: GitHub Security (COMPLETE)

**Objective:** Secure the software supply chain

**Completed:**
- ✅ Pin all GitHub Actions to SHA
- ✅ Configure Dependabot for npm and GitHub Actions
- ✅ Create CODEOWNERS file
- ✅ Remove continue-on-error from security scans

**Pending (Manual):**
- ⏳ Enable branch protection in GitHub Settings
- ⏳ Configure required status checks

### Phase 3: GDPR Implementation (PARTIAL)

**Objective:** Implement data subject rights

**Completed:**
- ✅ Export endpoint stub (`/api/gdpr/export`)
- ✅ Delete endpoint stub (`/api/gdpr/delete`)
- ✅ Documentation of HR data retention requirements

**Pending:**
- ⏳ Full export endpoint implementation
- ⏳ SAR workflow in HR app
- ⏳ Data Protection Impact Assessment (DPIA)

### Phase 4: Secrets Management (COMPLETE)

**Objective:** Secure credential handling

**Completed:**
- ✅ Environment variable substitution
- ✅ Keycloak realm separation
- ✅ Documentation of secret categories

**Pending (Manual):**
- ⏳ Rotate Anthropic API key
- ⏳ Audit git history for leaked secrets

### Phase 5: Ongoing Compliance (PLANNED)

**Objective:** Maintain compliance posture

**Tasks:**
- Weekly dependency audits (automated via CI)
- Monthly credential rotation
- Quarterly penetration testing
- Quarterly incident response drills

---

## Technical Approach

### GDPR Export Implementation

```typescript
// Full implementation for /api/gdpr/export
app.get('/api/gdpr/export', authMiddleware, async (req, res) => {
  const userId = req.userContext.userId;

  // Gather all user data across systems
  const [profile, reviews, accessLog, aiQueries] = await Promise.all([
    getEmployeeProfile(userId),
    getPerformanceReviews(userId),
    getAccessLogs(userId, { days: 90 }),
    getAIQueryHistory(userId)
  ]);

  res.json({
    subject: { id: userId, name: profile.name, email: profile.email },
    requestDate: new Date().toISOString(),
    data: { profile, performanceReviews: reviews, accessLog, aiQueries },
    retention: {
      payroll: '7 years (legal requirement)',
      employment: 'Duration + statute of limitations',
      performance: 'Employment + 3 years'
    }
  });
});
```

### Branch Protection API

```bash
# Enable branch protection via GitHub API
gh api -X PUT /repos/jcornell3/tamshai-enterprise-ai/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["Gateway - Node 20","Security - Dependency Audit"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}'
```

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Keycloak | Infrastructure | ✅ Running |
| Redis | Infrastructure | ✅ Running |
| GitHub Repository Access | Manual | ⏳ Required for branch protection |
| Anthropic Console Access | Manual | ⏳ Required for API key rotation |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Branch protection breaks deployment | Configure appropriate bypass rules |
| API key rotation causes downtime | Rotate during maintenance window |
| GDPR export reveals sensitive data | Apply same RLS rules as normal access |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Security Score | 73/100 | 90/100 |
| Critical Findings | 2 | 0 |
| High Findings | 0 | 0 |
| Actions Pinned | 13/13 | 13/13 |
| Security Scans Enforced | 6/6 | 6/6 |
