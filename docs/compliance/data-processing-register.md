# Data Processing Register (GDPR Art. 30)

**Organization:** Tamshai Corp
**Data Protection Contact:** security@tamshai.corp
**Last Updated:** December 2025

---

## 1. Overview

This register documents all personal data processing activities within the Tamshai Enterprise AI system, as required by GDPR Article 30.

---

## 2. Processing Activities

### 2.1 Employee Data Management (MCP-HR)

| Field | Value |
|-------|-------|
| **Processing Activity** | Employee data management |
| **Data Controller** | Tamshai Corp |
| **Purpose** | HR administration, payroll, performance management |
| **Lawful Basis** | Contract (Art. 6.1.b), Legal obligation (Art. 6.1.c) |
| **Data Subjects** | Employees, contractors, former employees |
| **Categories of Data** | See table below |
| **Recipients** | HR department, managers (limited), payroll provider |
| **Third Country Transfers** | None |
| **Retention Period** | Employment duration + 7 years (legal requirement) |
| **Security Measures** | Encryption, RBAC, RLS, audit logging |

**Data Categories:**

| Category | Fields | Sensitivity | Access Roles |
|----------|--------|-------------|--------------|
| Identity | Name, employee ID | Standard | All authenticated |
| Contact | Email, phone, address | Standard | HR, Manager |
| Employment | Job title, department, hire date | Standard | All authenticated |
| Compensation | Salary, bonus, benefits | Confidential | HR, Finance |
| Performance | Reviews, goals, feedback | Confidential | HR, Manager |
| Health | Accommodations, leave records | Special Category | HR only |

### 2.2 Financial Data Processing (MCP-Finance)

| Field | Value |
|-------|-------|
| **Processing Activity** | Financial management and reporting |
| **Data Controller** | Tamshai Corp |
| **Purpose** | Payroll, expense management, budgeting |
| **Lawful Basis** | Contract (Art. 6.1.b), Legal obligation (Art. 6.1.c) |
| **Data Subjects** | Employees (payroll), vendors |
| **Categories of Data** | Salary, tax information, bank details, expenses |
| **Recipients** | Finance department, external auditors, tax authorities |
| **Third Country Transfers** | None |
| **Retention Period** | 7 years (tax law requirement) |
| **Security Measures** | Encryption, RBAC, RLS, audit logging |

### 2.3 Customer/Client Data (MCP-Sales) - Future Module

| Field | Value |
|-------|-------|
| **Processing Activity** | Customer relationship management |
| **Data Controller** | Tamshai Corp |
| **Purpose** | Sales, customer service, marketing |
| **Lawful Basis** | Contract (Art. 6.1.b), Legitimate interest (Art. 6.1.f) |
| **Data Subjects** | Customers, prospects, business contacts |
| **Categories of Data** | Company name, contact details, purchase history |
| **Recipients** | Sales department, support team |
| **Third Country Transfers** | TBD based on customer locations |
| **Retention Period** | Active relationship + 3 years |
| **Security Measures** | Encryption, RBAC, RLS, audit logging |

### 2.4 Support Ticket Data (MCP-Support)

| Field | Value |
|-------|-------|
| **Processing Activity** | Internal IT and HR support |
| **Data Controller** | Tamshai Corp |
| **Purpose** | Issue resolution, knowledge management |
| **Lawful Basis** | Legitimate interest (Art. 6.1.f) |
| **Data Subjects** | Employees, contractors |
| **Categories of Data** | Ticket content, attachments, resolution notes |
| **Recipients** | Support team, relevant departments |
| **Third Country Transfers** | None |
| **Retention Period** | 2 years |
| **Security Measures** | PII masking, RBAC, audit logging |

### 2.5 AI Query Processing (MCP Gateway)

| Field | Value |
|-------|-------|
| **Processing Activity** | AI-assisted data queries |
| **Data Controller** | Tamshai Corp |
| **Data Processor** | Anthropic (Claude API) |
| **Purpose** | Natural language data access, productivity |
| **Lawful Basis** | Legitimate interest (Art. 6.1.f) |
| **Data Subjects** | Employees (queriers), subjects of queries |
| **Categories of Data** | Query text, user context, response data |
| **Recipients** | Querying user only (RBAC enforced) |
| **Third Country Transfers** | USA (Anthropic API) - Standard Contractual Clauses |
| **Retention Period** | 90 days (audit logs) |
| **Security Measures** | Prompt injection defense, PII scrubbing, audit logging |

**AI Processing Safeguards:**
- 50-record limit per query (data minimization)
- No PII in system prompts
- Response validation for data leakage
- Comprehensive audit logging

---

## 3. Data Flows

```
                                     ┌─────────────────┐
                                     │  Anthropic API  │
                                     │   (USA - SCC)   │
                                     └────────┬────────┘
                                              │
┌──────────┐     ┌──────────┐     ┌──────────┴──────────┐
│ Employee │────▶│ Keycloak │────▶│     MCP Gateway     │
│  Client  │     │   (IdP)  │     │  (AI Orchestration) │
└──────────┘     └──────────┘     └──────────┬──────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              ┌─────▼─────┐            ┌──────▼──────┐           ┌──────▼──────┐
              │  MCP-HR   │            │ MCP-Finance │           │ MCP-Support │
              │(PostgreSQL)│            │ (PostgreSQL)│           │(Elasticsearch)│
              └───────────┘            └─────────────┘           └─────────────┘
```

---

## 4. Third-Party Processors

| Processor | Service | Data Processed | Location | Safeguards |
|-----------|---------|----------------|----------|------------|
| Anthropic | Claude AI API | Query text, response context | USA | Standard Contractual Clauses |
| Cloud Provider | Infrastructure | All data (encrypted) | TBD | DPA, encryption at rest |

---

## 5. Data Subject Rights Implementation

| Right | Article | Implementation | Response Time |
|-------|---------|----------------|---------------|
| Access | Art. 15 | `POST /api/admin/gdpr/export` | 30 days |
| Erasure | Art. 17 | `POST /api/admin/gdpr/erase` | 30 days |
| Rectification | Art. 16 | Via HR department | 30 days |
| Portability | Art. 20 | Included in export (JSON format) | 30 days |
| Restriction | Art. 18 | Via HR department | Immediate |
| Objection | Art. 21 | Via HR department | Immediate |

**Note:** All GDPR requests are processed by HR on behalf of data subjects (employees). Offboarded employees contact HR directly; they do not have online access.

---

## 6. Security Measures (Art. 32)

### Technical Measures

| Measure | Implementation |
|---------|----------------|
| Encryption in transit | TLS 1.3 for all connections |
| Encryption at rest | AES-256 for database storage |
| Access control | RBAC via Keycloak, RLS in PostgreSQL |
| Authentication | OIDC + TOTP MFA |
| Audit logging | All data access logged with user context |
| Data minimization | 50-record limit, field-level filtering |

### Organizational Measures

| Measure | Implementation |
|---------|----------------|
| Access reviews | Quarterly role review |
| Security training | Annual security awareness |
| Incident response | Documented runbook |
| Data retention | Automated purge policies |

---

## 7. Breach Notification Procedures

| Scenario | Notification Required | Timeline |
|----------|----------------------|----------|
| Risk to rights | Supervisory authority | 72 hours |
| High risk to individuals | Affected individuals | Without undue delay |
| No risk | Internal documentation only | N/A |

**Breach Registration:** `POST /api/admin/gdpr/breach`

---

## 8. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2025 | Security Team | Initial version |

---

*This register should be reviewed and updated annually or when processing activities change.*
