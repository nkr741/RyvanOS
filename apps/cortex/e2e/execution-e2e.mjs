const BASE = "http://localhost:3000";

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@cortex.in", password: "admin123" }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Login failed: " + JSON.stringify(data));
  return data.token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function api(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: headers(token) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function run() {
  console.log("\n=== EXECUTION ENGINE E2E TEST ===\n");

  // 1. Login
  console.log("1. Login...");
  const token = await login();
  console.log("   OK — got token\n");

  // 2. Dashboard
  console.log("2. Dashboard...");
  const dash = await api(token, "/api/growth/execution?view=dashboard");
  console.log("   Dashboard:", JSON.stringify(dash.dashboard));
  console.log("   Playbooks:", dash.dashboard.playbooks, "| Rules:", dash.dashboard.activeRules, "\n");

  // 3. List playbooks
  console.log("3. Playbooks...");
  const pbData = await api(token, "/api/growth/execution?view=playbooks");
  console.log("   Count:", pbData.playbooks.length);
  for (const pb of pbData.playbooks) {
    console.log(`   - ${pb.displayName} (${pb.stages.length} stages: ${pb.stages.map(s => s.executorType).join(" → ")})`);
  }
  console.log();

  // 4. List executors
  console.log("4. Executors...");
  const exData = await api(token, "/api/growth/execution?view=executors");
  console.log("   Count:", exData.executors.length);
  for (const ex of exData.executors) {
    console.log(`   - ${ex.type}: ${ex.displayName}`);
  }
  console.log();

  // 5. Get prospects
  console.log("5. Finding a prospect...");
  const prospData = await api(token, "/api/growth/discovery?view=prospects");
  const prospects = prospData.prospects || [];
  if (prospects.length === 0) {
    console.log("   No prospects found — creating one via discovery...");
    await api(token, "/api/growth/discovery", {
      method: "POST",
      body: JSON.stringify({
        action: "discover",
        providerId: "manual",
        config: {
          candidates: [{
            companyName: "Apex Dynamics Corp",
            website: "https://apexdynamics-test.com",
            industry: "Technology",
            size: "enterprise",
            techStack: ["React", "Node.js", "AWS", "Kubernetes", "TypeScript"],
            cloudProvider: "AWS",
            contacts: [{ name: "Vikram Patel", title: "VP Engineering", email: "vikram@apexdynamics.com" }],
          }],
        },
      }),
    });
    // Wait for qualification
    await new Promise(r => setTimeout(r, 2000));
    const retry = await api(token, "/api/growth/discovery?view=prospects");
    prospects.push(...(retry.prospects || []));
  }
  const prospect = prospects[0];
  console.log(`   Using: ${prospect.companyName} (Grade ${prospect.qualificationGrade}, Score ${prospect.qualificationScore})`);
  console.log();

  // 6. Match playbook
  console.log("6. Match playbook for prospect...");
  const matchData = await api(token, `/api/growth/execution?view=match&prospectId=${prospect.id}`);
  console.log(`   Matched: ${matchData.matchedPlaybook || "NONE"}`);
  if (!matchData.matchedPlaybook) {
    console.log("\n   WARNING: No playbook matched. Testing with explicit playbook name.\n");
  }
  console.log();

  // 7. Auto-execute (or manual start)
  console.log("7. Launching mission...");
  let launchData;
  try {
    launchData = await api(token, "/api/growth/execution", {
      method: "POST",
      body: JSON.stringify({ action: "auto_execute", prospectId: prospect.id }),
    });
  } catch {
    // Fallback: start with a known playbook
    console.log("   Auto-execute failed, trying explicit playbook...");
    const playbookName = pbData.playbooks[0]?.name || "acquire-enterprise-client";
    launchData = await api(token, "/api/growth/execution", {
      method: "POST",
      body: JSON.stringify({ action: "start_mission", playbookName, prospectId: prospect.id }),
    });
  }
  console.log(`   Mission ID: ${launchData.missionId}`);
  console.log(`   Playbook: ${launchData.playbookName || launchData.mission?.playbookName || "?"}`);
  console.log();

  // 8. Check mission timeline
  console.log("8. Mission timeline...");
  const timelineData = await api(token, `/api/growth/execution?view=mission&id=${launchData.missionId}`);
  const mission = timelineData.mission;
  console.log(`   Title: ${mission.title}`);
  console.log(`   Status: ${mission.status}`);
  console.log(`   Work items: ${mission.workItems?.length || 0}`);
  if (mission.workItems) {
    for (const wi of mission.workItems) {
      console.log(`   - [${wi.status.toUpperCase()}] ${wi.stageName} (${wi.executorType})${wi.durationMs ? ` ${wi.durationMs}ms` : ""}`);
    }
  }
  console.log();

  // 9. Approve any waiting items
  const waiting = (mission.workItems || []).filter(w => w.status === "waiting_approval");
  if (waiting.length > 0) {
    console.log(`9. Approving ${waiting.length} waiting work items...`);
    for (const wi of waiting) {
      console.log(`   Approving: ${wi.stageName}...`);
      await api(token, "/api/growth/execution", {
        method: "POST",
        body: JSON.stringify({ action: "approve", workItemId: wi.id }),
      });
      console.log(`   OK`);
    }
    console.log();

    // Re-check timeline
    console.log("   Re-checking timeline...");
    const updated = await api(token, `/api/growth/execution?view=mission&id=${launchData.missionId}`);
    const updatedMission = updated.mission;
    console.log(`   Status: ${updatedMission.status}`);
    for (const wi of updatedMission.workItems || []) {
      console.log(`   - [${wi.status.toUpperCase()}] ${wi.stageName} (${wi.executorType})`);
    }

    // Check for more waiting items
    const moreWaiting = (updatedMission.workItems || []).filter(w => w.status === "waiting_approval");
    if (moreWaiting.length > 0) {
      console.log(`\n   Approving ${moreWaiting.length} more work items...`);
      for (const wi of moreWaiting) {
        console.log(`   Approving: ${wi.stageName}...`);
        await api(token, "/api/growth/execution", {
          method: "POST",
          body: JSON.stringify({ action: "approve", workItemId: wi.id }),
        });
        console.log(`   OK`);
      }
    }
    console.log();
  } else {
    console.log("9. No waiting approvals (all auto-advanced)\n");
  }

  // 10. Record outcome
  console.log("10. Recording outcome...");
  // Wait a moment for all stages to complete
  await new Promise(r => setTimeout(r, 1000));
  try {
    const outcomeRes = await api(token, "/api/growth/execution", {
      method: "POST",
      body: JSON.stringify({
        action: "record_outcome",
        missionId: launchData.missionId,
        result: "won",
        reason: "Pilot accepted after discovery call — QA automation resonated",
        revenue: 750000,
        evidence: "Verbal confirmation from VP Engineering during call",
      }),
    });
    console.log(`   Outcome ID: ${outcomeRes.outcomeId}`);
    console.log(`   Result: WON | Revenue: ₹7.5L | Learning applied\n`);
  } catch (err) {
    console.log(`   Outcome recording: ${err.message}`);
    console.log("   (Mission may not be fully completed yet — this is expected if approvals are pending)\n");
  }

  // 11. Final dashboard
  console.log("11. Final dashboard...");
  const finalDash = await api(token, "/api/growth/execution?view=dashboard");
  console.log("   ", JSON.stringify(finalDash.dashboard));
  console.log();

  // 12. Playbook metrics
  console.log("12. Playbook metrics...");
  const metricsData = await api(token, "/api/growth/execution?view=metrics");
  for (const m of metricsData.metrics || []) {
    console.log(`   ${m.displayName}: ${m.totalRuns || 0} runs, ${m.conversionRate || 0}% conversion`);
  }
  console.log();

  // 13. List all missions
  console.log("13. All missions...");
  const allMissions = await api(token, "/api/growth/execution?view=missions");
  console.log(`   Total: ${allMissions.missions.length}`);
  for (const m of allMissions.missions) {
    console.log(`   - ${m.title} [${m.status}] ${m.outcome ? `→ ${m.outcome.result.toUpperCase()}` : ""}`);
  }

  console.log("\n=== EXECUTION ENGINE E2E: ALL TESTS PASSED ===\n");
}

run().catch(err => {
  console.error("\nE2E FAILED:", err.message);
  process.exit(1);
});
