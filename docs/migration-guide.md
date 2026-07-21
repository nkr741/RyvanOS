# Cortex → AIOS Migration Guide

## Overview

Cortex is being migrated to run on AIOS packages. This is an **infrastructure replacement**, not a rewrite. All business logic stays unchanged.

## Migration Strategy

### Adapter Pattern

Never replace infrastructure directly. Use an adapter layer:

```
Cortex Code → AIOS Adapter → AIOS Package
```

This allows rollback at any point. Only remove the original implementation after the adapter is stable for a full sprint.

### Migration Order

1. **Sprint 2A** — Models + Events + Memory (low risk)
2. **Sprint 2B** — Tools + Agent Runtime (medium risk)
3. **Sprint 2C** — Identity (highest risk — touches every request)

## Sprint 2A: Models

### Before

```typescript
// src/lib/llm.ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.messages.create({
  model: "claude-haiku-4-5",
  messages: [{ role: "user", content: prompt }],
});
```

### After (Adapter)

```typescript
// src/lib/llm.ts (adapter — keeps the same API surface)
import type { ModelService } from "@ryvan/models";
import { getAIOS } from "./aios";

export async function complete(prompt: string): Promise<string | null> {
  try {
    const models = getAIOS().resolve<ModelService>("models");
    const response = await models.chat([{ role: "user", content: prompt }]);
    return response.content;
  } catch {
    return null; // graceful degradation (existing behavior)
  }
}
```

**Key:** The function signature stays identical. Callers don't change.

## Sprint 2A: Events

### Before

```typescript
// src/cortex/runtime/event.ts
class EventBusImpl {
  async emit(type: string, payload: unknown) { /* in-process + DB persist */ }
  on(pattern: string, handler: Function) { /* pattern matching */ }
}
```

### After (Adapter)

```typescript
// src/cortex/runtime/event.ts (adapter)
import { EventBus } from "@ryvan/events";
import { getAIOS } from "../../lib/aios";

// Re-export the AIOS EventBus as the Cortex event bus
export function getCortexEventBus(): EventBus {
  return getAIOS().resolve<EventBus>("events");
}

// Add DB persistence as middleware
const bus = getCortexEventBus();
bus.use(async (event, next) => {
  await next();
  // Persist to CortexEvent table
  await prisma.cortexEvent.create({
    data: { type: event.type, payload: JSON.stringify(event.data), source: event.source },
  });
});
```

## Sprint 2A: Memory

### Before

```typescript
// src/cortex/runtime/memory.ts
class InProcessMemory {
  private store = new Map<string, MemoryEntry>();
  get(key: string) { /* ... */ }
  set(key: string, value: unknown, ttlMs?: number) { /* ... */ }
}
```

### After (Adapter)

```typescript
// src/cortex/runtime/memory.ts (adapter)
import type { MemoryManager } from "@ryvan/memory";
import { getAIOS } from "../../lib/aios";

export function getAgentMemory(agentId: string): AgentMemory {
  const memory = getAIOS().resolve<MemoryManager>("memory");
  return {
    get: (key) => memory.retrieve(`agent:${agentId}`, { query: key, limit: 1 }),
    set: (key, value, ttlMs) => memory.store(`agent:${agentId}`, {
      content: JSON.stringify(value),
      type: "working",
      metadata: { key },
      ttlMs,
    }),
    // ... map remaining methods
  };
}
```

## Sprint 2B: Tools + Runtime

Register Cortex tools as AIOS ToolDefinitions. Adapt BaseAgent to extend RyvanAgent.

## Sprint 2C: Identity

**Highest risk — migrate last.**

### Before

```typescript
// src/lib/auth.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
export function getCurrentUser(request: Request) { /* manual JWT decode */ }
```

### After (Adapter)

```typescript
// src/lib/auth.ts (adapter)
import type { IdentityService } from "@ryvan/identity";
import { getAIOS } from "./aios";

export async function getCurrentUser(request: Request) {
  const identity = getAIOS().resolve<IdentityService>("identity");
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  try {
    return identity.tokens.verify(token);
  } catch {
    return null;
  }
}
```

## AIOS Initialization in Cortex

Create a module-scoped singleton for the AIOS container:

```typescript
// src/lib/aios.ts
import { createPlatform } from "@ryvan/bootstrap";
import type { PlatformContainer } from "@ryvan/bootstrap";

let _container: PlatformContainer | null = null;

export function getAIOS(): PlatformContainer {
  if (!_container) {
    const platform = createPlatform({
      identity: {
        tokenSecret: process.env.NEXTAUTH_SECRET!,
        tokenExpiresIn: "24h",
        tokenIssuer: "cortex",
      },
      models: {
        defaultModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      },
    });
    // Start synchronously for server-side init
    void platform.start();
    _container = platform.container;
  }
  return _container;
}
```

## Rollback Procedure

If a migration step causes issues:

1. The adapter still wraps the original implementation
2. Swap the adapter's import back to the original module
3. No business logic changes needed
4. File a bug against the AIOS package
5. Fix the package, then re-attempt migration
