# Getting Started

## Prerequisites

- Node.js 22+
- pnpm 9+
- Git

## Setup

```bash
# Clone the repository
git clone https://github.com/nkr741/ryvan-platform.git
cd ryvan-platform

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Verify
pnpm typecheck
```

## Project Structure

```
ryvan-platform/
├── packages/       # AIOS platform packages (shared infrastructure)
├── apps/           # Products (Cortex, RYN, RynOne)
├── docs/           # Developer documentation
└── turbo.json      # Build pipeline
```

## Development Workflow

### Building

```bash
# Build everything
pnpm build

# Build a specific package
pnpm --filter @ryvan/models build

# Watch mode for a package
pnpm --filter @ryvan/models dev
```

### Type Checking

```bash
# Check all packages
pnpm typecheck

# Check a specific package
pnpm --filter @ryvan/identity typecheck
```

### Linting & Formatting

```bash
# Format all code
pnpm format

# Check formatting
npx prettier --check "packages/*/src/**/*.ts"

# ESLint
npx eslint "packages/*/src/**/*.ts"
```

### Working on a Package

1. Make changes in `packages/<name>/src/`
2. Run `pnpm --filter @ryvan/<name> typecheck` to verify types
3. Run `pnpm --filter @ryvan/<name> build` to compile
4. If other packages depend on it, rebuild downstream: `pnpm build`

### Working on Cortex

```bash
# Start dev server
cd apps/cortex
pnpm dev

# Cortex's database
pnpm db:start      # Start PostgreSQL
pnpm db:migrate     # Run migrations
pnpm db:seed        # Seed data
pnpm db:studio      # Open Prisma Studio
```

## How to Add a New AIOS Package

**Rule:** A new package requires a concrete product requirement.

1. Create the directory:
```bash
mkdir -p packages/<name>/src
```

2. Create `package.json`:
```json
{
  "name": "@ryvan/<name>",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "clean": "rimraf dist",
    "typecheck": "tsc --noEmit",
    "lint": "prettier --check \"src/**/*.ts\""
  },
  "dependencies": {
    "@ryvan/common": "workspace:*",
    "@ryvan/events": "workspace:*"
  }
}
```

3. Create `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [
    { "path": "../common" },
    { "path": "../events" }
  ]
}
```

4. Export a facade class implementing `Service`:
```typescript
export class MyService implements Service {
  readonly name = "<name>";
  async start(): Promise<void> { /* ... */ }
  async stop(): Promise<void> { /* ... */ }
  status(): Status { return this._status; }
}
```

5. Run `pnpm install` to wire the workspace.

## How Products Use AIOS

Products live in `apps/` and declare `@ryvan/*` workspace dependencies:

```json
{
  "dependencies": {
    "@ryvan/bootstrap": "workspace:*",
    "@ryvan/common": "workspace:*",
    "@ryvan/events": "workspace:*"
  }
}
```

Initialize with bootstrap:

```typescript
import { bootstrap } from "@ryvan/bootstrap";

const platform = await bootstrap({
  identity: { tokenSecret: process.env.JWT_SECRET! },
  models: { defaultModel: "claude-haiku-4-5" },
});
```

Then resolve and use any service from the container.
