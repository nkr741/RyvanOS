const BASE = "http://localhost:3000";

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@cortex.in", password: "admin123" }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed");
  return data.token;
}

async function run() {
  console.log("\n=== FOUNDER WORKSPACE E2E TEST ===\n");

  const token = await login();
  console.log("1. Logged in as admin\n");

  console.log("2. Fetching workspace...");
  const res = await fetch(`${BASE}/api/founder/workspace`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Workspace failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json();

  console.log(`\n   ${data.greeting}`);
  console.log(`   ${new Date(data.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);

  console.log("\n   Yesterday:");
  console.log(`   • ${data.yesterday.prospectsDiscovered} prospects discovered`);
  console.log(`   • ${data.yesterday.qualified} qualified`);
  console.log(`   • ${data.yesterday.researchCompleted} research completed`);

  console.log("\n   Today's Priorities:");
  if (data.priorities.length === 0) {
    console.log("   • All clear — no pending actions");
  }
  for (const p of data.priorities) {
    console.log(`   ${data.priorities.indexOf(p) + 1}. [${p.type.toUpperCase()}] ${p.title}`);
    console.log(`      ${p.subtitle}`);
  }

  console.log("\n   Pipeline:");
  console.log(`   • ${data.pipeline.opportunities} opportunities`);
  console.log(`   • Weighted: ₹${(data.pipeline.weighted / 100000).toFixed(1)}L`);

  console.log("\n   Missions:");
  console.log(`   • ${data.missions.active} active, ${data.missions.completed} completed`);
  console.log(`   • Success rate: ${data.missions.successRate}%`);
  console.log(`   • Revenue won: ₹${(data.missions.totalRevenue / 100000).toFixed(1)}L`);

  console.log("\n   Health:");
  console.log(`   • ${data.health.prospects} prospects (${data.health.gradeA} Grade A)`);
  console.log(`   • ${data.health.pendingApprovals} pending approvals`);
  console.log(`   • ${data.health.playbooks} active playbooks`);

  console.log(`\n   Recommendation:`);
  console.log(`   "${data.recommendation}"`);

  // Validate structure
  const required = ['greeting', 'date', 'yesterday', 'pipeline', 'missions', 'priorities', 'recommendation', 'health'];
  for (const key of required) {
    if (!(key in data)) throw new Error(`Missing field: ${key}`);
  }

  console.log("\n   ✓ All required fields present");
  console.log("\n=== FOUNDER WORKSPACE E2E: PASSED ===\n");
}

run().catch(err => {
  console.error("\nE2E FAILED:", err.message);
  process.exit(1);
});
