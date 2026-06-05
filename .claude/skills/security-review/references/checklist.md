# Security Review Checklist

Quick reference for security audits. Check each item and flag issues by severity.

## Transport Security

- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] HSTS header with 2+ year max-age
- [ ] TLS 1.2+ required (prefer 1.3)
- [ ] No mixed content

## Password Security

- [ ] Argon2id hashing (not bcrypt/MD5/SHA)
- [ ] Minimum 12 character passwords
- [ ] Common password check
- [ ] Constant-time password comparison
- [ ] No plain text storage

## Session Security

- [ ] 256+ bit cryptographic session IDs
- [ ] `__Host-` cookie prefix
- [ ] `HttpOnly` flag set
- [ ] `Secure` flag set
- [ ] `SameSite=Lax` or `Strict`
- [ ] Server-side session storage with TTL
- [ ] Session regeneration on privilege change

## CSRF Protection

- [ ] CSRF tokens on all state-changing requests
- [ ] Tokens tied to user sessions
- [ ] Tokens validated server-side
- [ ] Origin/Referer header validation
- [ ] No GET requests that modify state

## XSS Prevention

- [ ] Output encoding by default (html`` template)
- [ ] HTMX `selfRequestsOnly: true`
- [ ] HTMX `allowScriptTags: false`
- [ ] `hx-disable` on user content zones
- [ ] CSP header configured (see below for details)

## Content Security Policy (MANDATORY)

**Static Hugo pages** (hash-based CSP):

- [ ] CSP includes script-src with hashes for inline scripts
- [ ] No `unsafe-inline` in production
- [ ] Alpine.js loaded from CDN with SRI integrity
- [ ] All inline script hashes generated and included

**Dynamic Worker responses** (nonce-based CSP):

- [ ] CSP includes script-src with per-request nonce
- [ ] Nonce generated with crypto.randomUUID()
- [ ] Nonce included in CSP header and script tags
- [ ] No `unsafe-inline` in production

**All responses**:

- [ ] `default-src 'self'`
- [ ] `object-src 'none'`
- [ ] `base-uri 'self'`
- [ ] `form-action 'self'`
- [ ] `frame-ancestors 'none'`
- [ ] `upgrade-insecure-requests` directive present

## Input Validation

- [ ] Server-side validation for all inputs
- [ ] Allowlist validation for fixed options
- [ ] Type checking before use
- [ ] Length limits on strings
- [ ] Email format validation

## Request Metadata Validation

See [metadata-validation.md](metadata-validation.md) for implementation details.

- [ ] Content-Type validated before parsing body
- [ ] Content-Length validated before reading body
- [ ] File upload MIME types whitelisted
- [ ] File upload size limits enforced
- [ ] File extensions validated (in addition to MIME)
- [ ] Directory traversal in filenames rejected
- [ ] HTTP method validated per endpoint

**Size limits**:

- JSON API requests: 10 KB max
- Form submissions: 50 KB max
- Image uploads: 5 MB max
- Document uploads: 10 MB max

## Database Security

- [ ] Parameterized queries only
- [ ] No string interpolation in SQL
- [ ] Allowlist for dynamic columns
- [ ] Mass assignment prevention

## Rate Limiting

See [rate-limiting.md](rate-limiting.md) for complete KV-based implementation.

**MANDATORY for authentication endpoints**:

- [ ] Login: 5 attempts per IP / 15 min (30 min lockout)
- [ ] Login: 10 attempts per account / 1 hour (1 hour lockout)
- [ ] Registration: 3 attempts per IP / 1 hour (2 hour lockout)
- [ ] Password reset (email): 3 attempts / 1 hour
- [ ] Password reset (IP): 10 attempts / 1 hour

**RECOMMENDED for other endpoints**:

- [ ] API endpoints: 100 requests per user / 1 min
- [ ] File uploads: 10 uploads per user / 1 hour
- [ ] Search queries: 30 requests per IP / 1 min

**Implementation requirements**:

- [ ] Rate limiter uses KV namespace for storage
- [ ] Returns 429 status code when limit exceeded
- [ ] Includes Retry-After header in response
- [ ] Uses CF-Connecting-IP for real client IP
- [ ] Dual limits (IP + account) for authentication

## Security Headers

- [ ] `Strict-Transport-Security: max-age=63072000` (2 years)
- [ ] `Content-Security-Policy` (MANDATORY - see CSP section)
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- [ ] `Cache-Control: no-store` for authenticated content

## Secrets Management

- [ ] No hardcoded secrets
- [ ] Secrets in environment variables
- [ ] Secrets not in logs
- [ ] Secrets not in error messages
- [ ] Different secrets per environment

## Error Handling

- [ ] Generic error messages (no stack traces)
- [ ] No database errors exposed
- [ ] No path disclosure
- [ ] Fail secure (deny on error)

## Brute Force Protection

- [ ] Constant-time comparisons
- [ ] Account enumeration prevention
- [ ] Progressive delays/lockouts
- [ ] Generic auth error messages

## Audit & Monitoring

- [ ] Security events logged
- [ ] Failed auth attempts tracked
- [ ] Account lockouts monitored
- [ ] Anomaly detection possible

---

## Severity Guide

### Critical (Fix Immediately)

- SQL injection
- Missing output encoding (XSS)
- Weak password hashing (MD5/SHA/plain)
- Hardcoded secrets
- Authentication bypass

### High (Fix Before Deploy)

- Missing CSRF protection
- Insecure session cookies
- Missing rate limiting on auth endpoints
- Missing Content-Length validation
- Missing CSP or CSP with unsafe-inline
- Timing-vulnerable comparisons
- Mass assignment vulnerabilities
- File uploads without size/type validation

### Medium (Fix Soon)

- Missing security headers
- Weak CSP
- Short HSTS max-age
- Missing input validation
- Verbose error messages

### Low (Track for Fix)

- Missing audit logging
- Suboptimal crypto parameters
- Minor header configurations
