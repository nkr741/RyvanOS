# Deploying RyvanOS

## Quick start

```bash
cp .env.example .env

# Every secret needs a real value. Generate them:
openssl rand -base64 32   # RYVAN_JWT_SECRET
openssl rand -base64 32   # RYVAN_SECRET_KEY
openssl rand -base64 32   # RYVAN_CONSOLE_TOKEN

docker compose up --build
```

That brings up Postgres (with pgvector), Redis, and the platform. The console is
on <http://localhost:4500>, health on <http://localhost:4501/healthz>.

> The compose file previously referenced `./services/gateway` and
> `./services/ml-runtime`, neither of which existed — `docker compose build`
> failed on a clean checkout. It now builds the platform image directly.

## Running without Docker

```bash
npx pnpm@9.15.0 install --filter "./packages/**"
npx pnpm@9.15.0 exec turbo build --filter="./packages/*"

npx pnpm@9.15.0 migrate    # optional: indexes and pgvector
npx pnpm@9.15.0 serve
```

## Configuration

Everything is environment-driven; see [.env.example](../.env.example) for the
annotated list.

### The three secrets

| Variable | Protects | Losing it means |
|----------|----------|-----------------|
| `RYVAN_JWT_SECRET` | Session tokens | Everyone is logged out |
| `RYVAN_SECRET_KEY` | Stored credentials | **Every stored secret is unrecoverable** |
| `RYVAN_CONSOLE_TOKEN` | The Developer Console | Nobody can reach the console |

`RYVAN_SECRET_KEY` is the one that matters. It encrypts connector credentials at
rest, and it is not stored anywhere the platform can reach — **back it up
somewhere your database backup is not.** Keeping both in the same place means
the encryption protects nothing.

### Storage

Omit `RYVAN_POSTGRES_URL` and the platform runs entirely in memory. It boots, it
works, and it loses every mission, approval, audit entry and trace on restart.
The startup log says so; production must set it.

Redis is optional but strongly recommended once you run more than one replica:
quota counters live there, and a per-tenant ceiling counted separately in each
replica is not a ceiling at all.

## Health endpoints

On their own port (`RYVAN_HEALTH_PORT`, default 4501), unauthenticated, so a
load balancer never needs the console token.

| Endpoint | Answers | Use for |
|----------|---------|---------|
| `/healthz` | Is the process alive? | Liveness probe |
| `/readyz` | Can it serve — is storage reachable? | Readiness probe |

They are deliberately different. Restarting a pod because Postgres blipped turns
a dependency outage into an availability outage; liveness must not depend on
anything the process cannot fix by restarting.

### Kubernetes

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 4501 }
  initialDelaySeconds: 20
readinessProbe:
  httpGet: { path: /readyz, port: 4501 }
  periodSeconds: 5
```

## Migrations

```bash
npx pnpm@9.15.0 migrate
```

Document tables are created lazily on first use, so this is not required to
start. It exists for what must be deliberate: the pgvector extension and indexes
chosen for real query patterns. It is safe to run repeatedly — each migration
records its id in the same transaction as its statements, so a crash halfway
leaves it un-recorded and it retries.

## The Developer Console

Opt-in. No `RYVAN_CONSOLE_TOKEN`, no console.

It binds `127.0.0.1` by default. It shows every mission's inputs, the audit
trail, and the approval buttons, so exposing it publicly should be a decision
someone typed. In Docker it binds `0.0.0.0` because only the published port
reaches the host — put TLS and your own auth in front before exposing it beyond
that.

The token must be at least 16 characters and is compared in constant time; the
platform refuses to start with a weak one rather than starting insecure.

## Scaling

The platform is stateless once Postgres and Redis hold the state, so replicas
scale horizontally — with two caveats:

- **Quota counters need Redis.** Without it each replica counts separately.
- **Workflow resume timers run in every replica.** Each polls for suspended runs
  it can advance. That is safe (the store is the arbiter) but wasteful at high
  replica counts; a leader election belongs here before you run many.

## Backups

| What | Where | Notes |
|------|-------|-------|
| Everything | Postgres | Missions, runs, audit, memory, identity, secrets, traces |
| `RYVAN_SECRET_KEY` | **Separately** | Without it the secrets in the backup are noise |
| Redis | Nowhere | Only quota counters and caches; safe to lose |

Verify the audit chain after any restore:

```typescript
const audit = platform.container.resolve<AuditService>("audit");
const { valid, brokenAt } = await audit.verify();
```

A restore that silently reorders or drops rows shows up here as a broken chain,
which is the point of hash-chaining it.

## Security checklist

- [ ] All three secrets are generated, not copied from `.env.example`
- [ ] `RYVAN_SECRET_KEY` is backed up away from the database backup
- [ ] Console is not on a public interface, or is behind TLS and auth
- [ ] Postgres is not on a public interface
- [ ] `NODE_ENV=production`
- [ ] Container runs as non-root (the image already does)
- [ ] Audit verification is checked periodically, not only after an incident
