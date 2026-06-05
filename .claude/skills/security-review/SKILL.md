---
name: security-review
description: Review code for security vulnerabilities and best practices. Use when (1) reviewing code for security issues, (2) auditing authentication/session handling, (3) checking for XSS/CSRF/SQL injection vulnerabilities, (4) evaluating security headers and CSP, (5) validating input handling and output encoding, (6) assessing password hashing and secrets management, (7) reviewing rate limiting and brute force protection, or (8) general security hardening of web applications.
---

# Security Review Skill

Systematic security review following OWASP guidelines and defense-in-depth principles.

## Audience: Non-Technical Managers

**CRITICAL**: Write for non-technical managers using plain English (6th-grade reading level).

**Style Requirements:**

- **Report problems only** - never acknowledge what's done well or include praise
- **Target 30-second scan time** - compress findings to 2-3 lines maximum
- **Use plain language** - explain technical terms briefly (e.g., "SQL injection - inserting malicious database commands")
- **Focus on business impact** - data breach, financial loss, reputation damage
- **Be concise** - one-sentence problem, one-line fix

## Review Process

1. **Identify security surface**: Authentication, data handling, user input, external APIs
2. **Check each domain** using references below
3. **Prioritize findings**: Critical > High > Medium > Low
4. **Provide actionable fixes** with code examples

## Security Domains

### Authentication & Sessions

See [references/auth-security.md](references/auth-security.md) for password hashing (Argon2id), session management (`__Host-` cookies), account lockout, constant-time comparisons.

### Web Security (XSS/CSRF/Headers)

See [references/web-security.md](references/web-security.md) for XSS prevention, CSRF tokens, Content Security Policy, security headers.

### Data Security (Injection/Validation)

See [references/data-security.md](references/data-security.md) for SQL injection prevention, input validation, parameterized queries.

### Quick Checklist

See [references/checklist.md](references/checklist.md) for rapid security audit.

## Critical Patterns to Flag

### Always Critical

```typescript
// SQL Injection - string interpolation
db.prepare(`SELECT * FROM users WHERE id = '${userId}'`) // ❌
// Missing output encoding
`<div>${userInput}</div>`; // ❌ (without safe template)

// Weak password hashing
bcrypt.hash(password, 10); // ❌ Use Argon2id
md5(password); // ❌
sha256(password); // ❌ (no salt)

// Hardcoded secrets
const API_KEY = "sk-abc123..."; // ❌
```

### Always High

```typescript
// Missing CSRF on state-changing endpoints
app.post('/api/transfer', handler)  // ❌ (no CSRF)

// Insecure cookies
res.cookie('session', id)  // ❌ (missing flags)

// Missing rate limiting on auth
app.post('/login', handler)  // ❌

// Timing-vulnerable comparisons
if (token === storedToken)  // ❌ (use constant-time)
```

## Secure Patterns

### Safe HTML Templating

```typescript
function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    return result + encodeHtml(value) + str;
  });
}
html`<div>${user.name}</div>`; // ✅ Auto-encoded
```

### Parameterized Queries

```typescript
await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first(); // ✅
```

### Secure Cookies

```typescript
`__Host-session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/`; // ✅
```

### Constant-Time Compare

```typescript
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
} // ✅
```

## Review Output Format

**COMPRESSED FORMAT** (2-3 lines per finding):

```markdown
## Security Review

### Critical

- src/auth/login.ts:45: SQL injection - user input concatenated into query
  Fix: `db.prepare('SELECT * FROM users WHERE email = ?').bind(email)`

- src/auth/hash.ts:12: Weak password hashing - using bcrypt instead of Argon2id
  Fix: Switch to `@node-rs/argon2` with default parameters

### High

- src/api/transfer.ts:23: Missing CSRF protection on state-changing endpoint
  Fix: Add CSRF token validation middleware

### Medium

- src/cookies.ts:34: Insecure cookie flags - missing HttpOnly and Secure
  Fix: Use `__Host-session=${id}; HttpOnly; Secure; SameSite=Lax`

## Copy-Paste Prompt for Claude Code

**REQUIRED when findings exist** (3-5 lines maximum):
```

Fix SQL injection in src/auth/login.ts:45 using parameterized queries.
Replace bcrypt with Argon2id in src/auth/hash.ts:12.
Add CSRF protection to src/api/transfer.ts:23.
Update cookie flags in src/cookies.ts:34 to include HttpOnly and Secure.

```

```

**DO NOT include:**

- ~~"None found"~~ sections - omit sections with no issues
- ~~Praise or positive feedback~~ - focus exclusively on problems
- ~~Lengthy explanations~~ - keep to 2-3 lines per finding

## Framework-Specific

### HTMX Security

```html
<meta
  name="htmx-config"
  content='{
  "selfRequestsOnly": true,
  "allowScriptTags": false,
  "allowEval": false
}'
/>
<div hx-disable>${userContent}</div>
<!-- Safe zone -->
```

### Cloudflare Workers

- Use `wrangler secret` for sensitive values
- Verify KV TTL for sessions
- Check D1 uses parameterized queries

### Node.js/Express

- Verify `helmet` middleware
- Check `express-rate-limit`
- Validate CSRF protection

## Related Skills

This skill works together with:

- **quality-review**: Code correctness, test quality, general code standards
- **clean-architecture-validator**: Layer boundaries, architectural compliance
- **error-handling-patterns**: Error disclosure prevention, safe error responses
- **worker-request-handler**: Security headers middleware, nonce-based CSP
- **kv-session-management**: Session storage, KV rate limiting
- **ddd-domain-modeling**: Validation architecture, input sanitization

When reviewing code, use multiple skills for comprehensive analysis:

1. **Security review** (this skill): Authentication, rate limiting, input validation, error disclosure
2. **Architecture review**: Layer violations, dependency issues
3. **Quality review**: Error handling, test coverage, code standards
