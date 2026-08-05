/**
 * Container health probe.
 *
 * Asks the platform's own /readyz rather than checking that a port is open — a
 * process that is listening but cannot reach Postgres is not healthy, and a TCP
 * probe would report it as fine.
 */
const port = process.env.RYVAN_HEALTH_PORT ?? 4501;

try {
  const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
    signal: AbortSignal.timeout(4000),
  });

  if (!response.ok) {
    console.error(`unhealthy: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  process.exit(0);
} catch (err) {
  console.error(`unhealthy: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
