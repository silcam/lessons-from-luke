# Rate Limiting Implementation

## Purpose

Prevent brute force attacks, abuse, and resource exhaustion by limiting request rates per identifier (IP address, user ID, email).

## When to Apply Rate Limiting

| Endpoint       | Identifier     | Why                                 |
| -------------- | -------------- | ----------------------------------- |
| Login          | IP address     | Prevent credential stuffing         |
| Login          | Email/username | Prevent account-specific attacks    |
| Registration   | IP address     | Prevent bulk account creation       |
| Password reset | Email          | Prevent email bombing               |
| Password reset | IP address     | Prevent DoS via reset emails        |
| API endpoints  | User ID        | Prevent abuse of authenticated APIs |
| File uploads   | User ID        | Prevent storage abuse               |
| Search/queries | IP address     | Prevent scraping and DoS            |

## Rate Limit Configurations

Standard configurations for common scenarios:

| Endpoint Type          | Max Attempts | Window | Lockout | Identifier                  |
| ---------------------- | ------------ | ------ | ------- | --------------------------- |
| Login (IP)             | 5            | 15 min | 30 min  | `login:${ip}`               |
| Login (Account)        | 10           | 1 hour | 1 hour  | `login:account:${email}`    |
| Registration           | 3            | 1 hour | 2 hours | `register:${ip}`            |
| Password Reset (Email) | 3            | 1 hour | -       | `reset:${email}`            |
| Password Reset (IP)    | 10           | 1 hour | -       | `reset:${ip}`               |
| API (Authenticated)    | 100          | 1 min  | -       | `api:${userId}:${endpoint}` |
| File Upload            | 10           | 1 hour | -       | `upload:${userId}`          |
| Search                 | 30           | 1 min  | 5 min   | `search:${ip}`              |

**Key principles**:

- **IP-based limits**: Prevent distributed attacks
- **Account-based limits**: Prevent targeted account attacks
- **Dual limits**: Apply both IP and account limits for login
- **Lockout duration**: Use for sensitive operations (auth) to slow attackers
- **No lockout**: Use for less sensitive operations to avoid UX issues

## KV-Based Rate Limiter Implementation

### Complete Working Implementation

```typescript
/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxAttempts: number; // Maximum attempts allowed
  windowSeconds: number; // Time window in seconds
  lockoutMinutes?: number; // Optional lockout duration after max attempts
}

/**
 * Rate limit state stored in KV
 */
interface RateLimitState {
  attempts: number; // Current attempt count
  windowStart: number; // Window start timestamp (ms)
  lockedUntil?: number; // Lockout end timestamp (ms)
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean; // Whether the request is allowed
  remaining: number; // Remaining attempts in current window
  resetAt: number; // Timestamp when the window resets (ms)
  retryAfter?: number; // Seconds until retry allowed (if locked out)
}

/**
 * KV-based rate limiter for Cloudflare Workers
 */
export class KVRateLimiter {
  constructor(private readonly kv: KVNamespace) {}

  /**
   * Check if request should be allowed based on rate limit
   */
  async checkLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();

    // Get current state
    const data = await this.kv.get(key);
    const state: RateLimitState = data ? JSON.parse(data) : { attempts: 0, windowStart: now };

    // Check if window has expired
    if (now - state.windowStart > config.windowSeconds * 1000) {
      state.attempts = 0;
      state.windowStart = now;
      delete state.lockedUntil;
    }

    // Check if locked out
    if (state.lockedUntil && now < state.lockedUntil) {
      const retryAfter = Math.ceil((state.lockedUntil - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: state.lockedUntil,
        retryAfter,
      };
    }

    // Clear lockout if expired
    if (state.lockedUntil && now >= state.lockedUntil) {
      delete state.lockedUntil;
      state.attempts = 0;
      state.windowStart = now;
    }

    // Check if limit exceeded
    if (state.attempts >= config.maxAttempts) {
      // Apply lockout if configured
      if (config.lockoutMinutes) {
        state.lockedUntil = now + config.lockoutMinutes * 60 * 1000;
        await this.save(key, state, config);
        const retryAfter = config.lockoutMinutes * 60;
        return {
          allowed: false,
          remaining: 0,
          resetAt: state.lockedUntil,
          retryAfter,
        };
      }

      // No lockout - just deny until window resets
      const resetAt = state.windowStart + config.windowSeconds * 1000;
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    // Increment attempts
    state.attempts++;
    await this.save(key, state, config);

    const remaining = config.maxAttempts - state.attempts;
    const resetAt = state.windowStart + config.windowSeconds * 1000;

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  /**
   * Save rate limit state to KV
   */
  private async save(key: string, state: RateLimitState, config: RateLimitConfig): Promise<void> {
    // Calculate TTL based on lockout or window duration
    const ttl = config.lockoutMinutes
      ? Math.max(config.lockoutMinutes * 60, config.windowSeconds)
      : config.windowSeconds;

    await this.kv.put(key, JSON.stringify(state), {
      expirationTtl: ttl + 60, // Add buffer to prevent premature expiration
    });
  }

  /**
   * Reset rate limit for an identifier (admin operation)
   */
  async reset(identifier: string): Promise<void> {
    const key = `ratelimit:${identifier}`;
    await this.kv.delete(key);
  }
}
```

### Usage in Middleware

```typescript
/**
 * Rate limiting middleware
 */
export function withRateLimit(
  getRateLimiter: (env: Env) => KVRateLimiter,
  getIdentifier: (request: Request) => string,
  config: RateLimitConfig,
  handler: (request: Request, env: Env) => Promise<Response>
): (request: Request, env: Env) => Promise<Response> {
  return async (request: Request, env: Env): Promise<Response> => {
    const identifier = getIdentifier(request);
    const rateLimiter = getRateLimiter(env);

    const result = await rateLimiter.checkLimit(identifier, config);

    if (!result.allowed) {
      const headers = new Headers({
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter || 60),
      });

      return new Response(
        JSON.stringify({
          error: "Too many requests",
          code: "RATE_LIMIT_EXCEEDED",
        }),
        {
          status: 429,
          headers,
        }
      );
    }

    // Add rate limit headers to response
    const response = await handler(request, env);

    response.headers.set("X-RateLimit-Limit", String(config.maxAttempts));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt / 1000)));

    return response;
  };
}
```

### Usage in Login Handler

```typescript
/**
 * Login endpoint with dual rate limiting
 */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json();
  const email = body.email?.toLowerCase();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  const rateLimiter = new KVRateLimiter(env.RATE_LIMIT);

  // Rate limit by IP (5 attempts per 15 minutes, 30 minute lockout)
  const ipResult = await rateLimiter.checkLimit(`login:${ip}`, {
    maxAttempts: 5,
    windowSeconds: 900, // 15 minutes
    lockoutMinutes: 30,
  });

  if (!ipResult.allowed) {
    return rateLimitResponse(ipResult);
  }

  // Rate limit by email (10 attempts per hour, 1 hour lockout)
  const emailResult = await rateLimiter.checkLimit(`login:account:${email}`, {
    maxAttempts: 10,
    windowSeconds: 3600, // 1 hour
    lockoutMinutes: 60,
  });

  if (!emailResult.allowed) {
    return rateLimitResponse(emailResult);
  }

  // Proceed with login logic
  const result = await loginUseCase.execute({ email, password: body.password });

  if (!result.success) {
    return errorResponse(result.error);
  }

  return jsonResponse(200, { token: result.value.token });
}

function rateLimitResponse(result: RateLimitResult): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Retry-After": String(result.retryAfter || 60),
  });

  return new Response(
    JSON.stringify({
      error: "Too many requests",
      code: "RATE_LIMIT_EXCEEDED",
    }),
    {
      status: 429,
      headers,
    }
  );
}
```

### Usage in Registration Handler

```typescript
/**
 * Registration endpoint with IP-based rate limiting
 */
export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rateLimiter = new KVRateLimiter(env.RATE_LIMIT);

  // Rate limit by IP (3 attempts per hour, 2 hour lockout)
  const result = await rateLimiter.checkLimit(`register:${ip}`, {
    maxAttempts: 3,
    windowSeconds: 3600, // 1 hour
    lockoutMinutes: 120, // 2 hours
  });

  if (!result.allowed) {
    return rateLimitResponse(result);
  }

  // Proceed with registration logic
  const body = await request.json();
  const registerResult = await registerUseCase.execute(body);

  if (!registerResult.success) {
    return errorResponse(registerResult.error);
  }

  return jsonResponse(201, toUserResponse(registerResult.value));
}
```

## Testing Rate Limiting

### Unit Tests

```typescript
describe("KVRateLimiter", () => {
  let rateLimiter: KVRateLimiter;
  let mockKV: KVNamespace;

  beforeEach(() => {
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as KVNamespace;

    rateLimiter = new KVRateLimiter(mockKV);
  });

  describe("checkLimit", () => {
    it("allows first request", async () => {
      mockKV.get = vi.fn().mockResolvedValue(null);

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("tracks attempts across requests", async () => {
      // Simulate second request
      mockKV.get = vi.fn().mockResolvedValue(
        JSON.stringify({
          attempts: 1,
          windowStart: Date.now(),
        })
      );

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it("blocks when limit exceeded", async () => {
      mockKV.get = vi.fn().mockResolvedValue(
        JSON.stringify({
          attempts: 5,
          windowStart: Date.now(),
        })
      );

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("resets after window expires", async () => {
      const pastWindowStart = Date.now() - 70000; // 70 seconds ago
      mockKV.get = vi.fn().mockResolvedValue(
        JSON.stringify({
          attempts: 5,
          windowStart: pastWindowStart,
        })
      );

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("applies lockout when configured", async () => {
      mockKV.get = vi.fn().mockResolvedValue(
        JSON.stringify({
          attempts: 5,
          windowStart: Date.now(),
        })
      );

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
        lockoutMinutes: 30,
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(1800); // 30 minutes in seconds
    });

    it("enforces lockout even if window expires", async () => {
      const now = Date.now();
      const futureUnlock = now + 1800000; // 30 minutes from now

      mockKV.get = vi.fn().mockResolvedValue(
        JSON.stringify({
          attempts: 5,
          windowStart: now - 120000, // 2 minutes ago
          lockedUntil: futureUnlock,
        })
      );

      const result = await rateLimiter.checkLimit("test-user", {
        maxAttempts: 5,
        windowSeconds: 60,
        lockoutMinutes: 30,
      });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(1700); // Still locked
    });
  });

  describe("reset", () => {
    it("deletes rate limit state", async () => {
      await rateLimiter.reset("test-user");

      expect(mockKV.delete).toHaveBeenCalledWith("ratelimit:test-user");
    });
  });
});
```

### Integration Tests

```typescript
describe("Login rate limiting", () => {
  it("allows multiple valid login attempts", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await handleLogin(
        new Request("http://localhost/login", {
          method: "POST",
          headers: { "CF-Connecting-IP": "192.168.1.1" },
          body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
        }),
        env
      );

      expect(response.status).toBe(401); // Wrong password, not rate limited
    }
  });

  it("blocks after max attempts from same IP", async () => {
    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await handleLogin(
        new Request("http://localhost/login", {
          method: "POST",
          headers: { "CF-Connecting-IP": "192.168.1.1" },
          body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
        }),
        env
      );
    }

    // 6th attempt should be rate limited
    const response = await handleLogin(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.1.1" },
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
      }),
      env
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
  });

  it("allows requests from different IPs", async () => {
    // 5 attempts from IP 1
    for (let i = 0; i < 5; i++) {
      await handleLogin(
        new Request("http://localhost/login", {
          method: "POST",
          headers: { "CF-Connecting-IP": "192.168.1.1" },
          body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
        }),
        env
      );
    }

    // Attempt from IP 2 should still work
    const response = await handleLogin(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "CF-Connecting-IP": "192.168.1.2" },
        body: JSON.stringify({ email: "user@example.com", password: "wrong" }),
      }),
      env
    );

    expect(response.status).toBe(401); // Wrong password, not rate limited
  });
});
```

## Security Best Practices

### 1. Use Multiple Identifiers

```typescript
// ✅ CORRECT - Both IP and account rate limiting
const ipResult = await rateLimiter.checkLimit(`login:${ip}`, ipConfig);
const accountResult = await rateLimiter.checkLimit(`login:account:${email}`, accountConfig);

if (!ipResult.allowed || !accountResult.allowed) {
  return rateLimitResponse();
}
```

### 2. Different Limits for Different Operations

```typescript
// ✅ CORRECT - Stricter limits for registration
const registerConfig: RateLimitConfig = {
  maxAttempts: 3,
  windowSeconds: 3600,
  lockoutMinutes: 120,
};

// ✅ CORRECT - More lenient for password reset
const resetConfig: RateLimitConfig = {
  maxAttempts: 10,
  windowSeconds: 3600,
  // No lockout to avoid UX issues
};
```

### 3. Log Rate Limit Events

```typescript
if (!result.allowed) {
  logger.warn("Rate limit exceeded", {
    identifier,
    endpoint: request.url,
    attempts: config.maxAttempts,
    lockedUntil: result.resetAt,
  });
}
```

### 4. Include Retry-After Header

```typescript
// ✅ CORRECT - Always include Retry-After header
return new Response(JSON.stringify({ error: "Too many requests" }), {
  status: 429,
  headers: {
    "Retry-After": String(result.retryAfter || 60),
  },
});
```

### 5. Use CF-Connecting-IP for Real IP

```typescript
// ✅ CORRECT - Use Cloudflare's real IP header
const ip = request.headers.get("CF-Connecting-IP") || "unknown";

// ❌ WRONG - Can be spoofed
const ip = request.headers.get("X-Forwarded-For");
```

## Common Mistakes

### ❌ No Rate Limiting on Login

```typescript
// ❌ WRONG - No rate limiting
export async function handleLogin(request: Request): Promise<Response> {
  const body = await request.json();
  const result = await loginUseCase.execute(body);
  // Vulnerable to brute force attacks
}
```

### ❌ Rate Limiting After Authentication

```typescript
// ❌ WRONG - Rate limit check after password verification
const result = await loginUseCase.execute(body);
if (!result.success) {
  await rateLimiter.checkLimit(email, config); // Too late!
}
```

### ✅ Rate Limiting Before Authentication

```typescript
// ✅ CORRECT - Rate limit check before password verification
const rateLimitResult = await rateLimiter.checkLimit(email, config);
if (!rateLimitResult.allowed) {
  return rateLimitResponse();
}

const result = await loginUseCase.execute(body);
```

## Related Skills

- **kv-session-management**: KV namespace usage patterns
- **security-review**: Authentication security, brute force prevention
- **worker-request-handler**: Middleware patterns, request handling
