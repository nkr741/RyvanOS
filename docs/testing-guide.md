# Testing Guide

## Test Framework

All packages use [Vitest](https://vitest.dev/) for testing.

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @ryvan/identity test

# Watch mode
pnpm --filter @ryvan/identity test:watch
```

## What to Test

Since AIOS is shared infrastructure, bugs have a large blast radius. Every package needs coverage for:

### @ryvan/common
- `Container` — register, resolve, singleton vs transient, error on missing
- `ConfigManager` — get/set, nested dot-path, prototype pollution protection
- `Logger` — log levels, handlers, child loggers
- Utility functions — `retry` backoff, `withTimeout` edge cases

### @ryvan/events
- `EventBus` — emit, subscribe, unsubscribe, filtered subscriptions
- Middleware execution order
- Dead letter queue on handler error
- Event history buffer

### @ryvan/identity
- Password hashing — 72-byte truncation rejection, whitespace rejection
- JWT — sign, verify, decode, refresh, claim validation, expired tokens
- RBAC — role hierarchy, wildcard, scope-based permissions
- API keys — generate, validate (prefix lookup), revoke

### @ryvan/models
- `ModelRouter` — cost-aware routing, privacy routing, capability matching, fallback
- `CostTracker` — record, query, eviction at cap, tenant/user breakdown
- Request validation — empty messages, invalid temperature, negative tokens

### @ryvan/memory
- `InMemoryBackend` — store, search, TTL expiry, eviction at cap, importance sorting
- `ConversationMemory` — add turn, auto-trim, summarize, corrupt entry handling
- `WorkingMemory` — get/set with JSON safety, TTL enforcement
- `MemoryManager` — store/retrieve validation, stale data prevention

### @ryvan/tool-registry
- `ToolExecutor` — required params, type checking, enum validation, default injection, extra param rejection
- Middleware pipeline
- Timeout enforcement
- Stats tracking

### @ryvan/agent-runtime
- `TaskQueue` — priority ordering, enqueue/dequeue, cancel, memory cleanup
- `Scheduler` — concurrency cap, timeout detection, retry logic, graceful shutdown, queue drain
- Post-stop guards on assign/submitResult/failTask

### @ryvan/agent-sdk
- `RyvanAgent` lifecycle — idle → ready → executing → reflecting → ready
- Policy enforcement — denied execution, multiple policies
- Working memory TTL eviction
- Conversation trimming — system message preservation
- `CollaborationManager` — reserved IDs, message cap, broadcast

## Writing Tests

Place test files next to source files or in a `__tests__` directory:

```
packages/identity/src/
├── password.ts
├── password.test.ts      # Unit test
├── token.ts
├── token.test.ts
└── __tests__/
    └── integration.test.ts
```

### Example Test

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TokenManager } from "../token.js";

describe("TokenManager", () => {
  let manager: TokenManager;

  beforeEach(() => {
    manager = new TokenManager({
      secret: "a".repeat(32),
      expiresIn: "1h",
      issuer: "test",
    });
  });

  it("rejects secrets shorter than 32 chars", () => {
    expect(() => new TokenManager({
      secret: "short",
      expiresIn: "1h",
      issuer: "test",
    })).toThrow("at least 32 characters");
  });

  it("signs and verifies a token", () => {
    const token = manager.sign({
      sub: "user_1",
      org: "org_1",
      roles: ["org:member"],
      permissions: ["read"],
    });
    const payload = manager.verify(token);
    expect(payload.sub).toBe("user_1");
  });
});
```

## Security Testing

Run Semgrep for static security analysis:

```bash
semgrep scan --config auto packages/
```

Expected: 0 findings across all packages.

## E2E Testing (Cortex)

Cortex uses Playwright for E2E tests:

```bash
cd apps/cortex
npx playwright test
```

E2E tests cover: execution pipeline, intelligence, relationships, workspace.
