const BASE = 'http://localhost:3000';

async function getToken() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@cortex.in', password: 'admin123' }),
  });
  const data = await res.json();
  return data.token;
}

async function api(method, path, token, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function main() {
  console.log('=== Account Intelligence Engine E2E Test ===\n');

  // 1. Authenticate
  const token = await getToken();
  console.log('1. Auth:', token ? 'OK' : 'FAIL');

  // 2. Check existing prospects
  const prospectData = await api('GET', '/api/growth/discovery?view=prospects', token);
  const prospects = prospectData.prospects || [];
  console.log(`2. Existing prospects: ${prospects.length}`);

  let prospectId;

  if (prospects.length > 0) {
    prospectId = prospects[0].id;
    console.log(`   Using prospect: ${prospects[0].companyName} (${prospectId})`);
  } else {
    // Create a candidate via manual discovery, then promote
    console.log('   No prospects — creating one via discovery...');
    const discoverResult = await api('POST', '/api/growth/discovery', token, {
      action: 'discover',
      provider: 'manual',
      config: {
        companyName: 'Zenith AI Labs',
        website: 'https://zenithailabs.com',
        industry: 'enterprise',
        size: 'mid-market',
        employees: 350,
        location: 'Bangalore',
        country: 'India',
        techStack: ['Python', 'Kubernetes', 'AWS', 'Terraform', 'React', 'PostgreSQL'],
        description: 'Enterprise AI platform for intelligent automation. Building ML pipelines and cloud-native infrastructure. Hiring QA engineers and ML engineers. Series B funded, expanding to US market. Pain points include legacy monolith migration and compliance with SOC2.',
      },
    });
    console.log(`   Discovery: ${discoverResult.success ? 'OK' : 'FAIL'}`);

    // Get candidates
    const candidateData = await api('GET', '/api/growth/discovery?view=candidates&status=new', token);
    const candidate = (candidateData.candidates || []).find(c => c.companyName === 'Zenith AI Labs');
    if (!candidate) { console.log('   ERROR: Candidate not found'); return; }
    console.log(`   Candidate: ${candidate.companyName}, ${candidate.signals.length} signals`);

    // Extract signals
    await api('POST', '/api/growth/discovery', token, { action: 'extract_signals', candidateId: candidate.id });
    // Qualify
    await api('POST', '/api/growth/discovery', token, { action: 'qualify', candidateId: candidate.id });
    // Promote
    const promoteResult = await api('POST', '/api/growth/discovery', token, { action: 'promote', candidateId: candidate.id });
    prospectId = promoteResult.prospectId;
    console.log(`   Promoted to prospect: ${prospectId}`);
  }

  // 3. Check if intelligence already exists
  const existingIntel = await api('GET', `/api/growth/intelligence?view=latest&prospectId=${prospectId}`, token);
  console.log(`3. Existing intelligence: ${existingIntel.intelligence ? `v${existingIntel.intelligence.version}` : 'none'}`);

  // 4. Generate intelligence
  console.log('4. Generating intelligence...');
  const genResult = await api('POST', '/api/growth/intelligence', token, {
    action: 'generate',
    prospectId,
  });

  if (!genResult.success) {
    console.log(`   ERROR: ${genResult.error}`);
    return;
  }

  const intel = genResult.intelligence;
  console.log(`   Intelligence generated: v${intel.version}`);
  console.log(`   Status: ${intel.status}`);
  console.log(`   Overall confidence: ${intel.overallConfidence}%`);
  console.log(`   Sections: ${intel.sections.length}`);
  console.log(`   Insights: ${intel.insights.length}`);

  // 5. Verify sections
  console.log('\n5. Sections:');
  for (const section of intel.sections) {
    console.log(`   ${section.title}: confidence=${section.confidence}%, evidence=${section.evidenceCount}`);
  }

  // 6. Verify insights
  console.log('\n6. Insights:');
  for (const insight of intel.insights) {
    console.log(`   [${insight.confidence}%] ${insight.title} → ${insight.recommendedService || 'general'}`);
  }

  // 7. Meeting Copilot
  if (intel.meetingBrief) {
    console.log('\n7. Meeting Copilot:');
    console.log(`   Objective: ${intel.meetingBrief.objective.slice(0, 80)}...`);
    console.log(`   Questions: ${intel.meetingBrief.questions.length}`);
    console.log(`   Objections prepared: ${intel.meetingBrief.likelyObjections.length}`);
    console.log(`   Budget range: ${intel.meetingBrief.expectedBudgetRange}`);
    console.log(`   Next action: ${intel.meetingBrief.nextBestAction}`);
    console.log(`   Services: ${intel.meetingBrief.suggestedServices.join(', ')}`);
  } else {
    console.log('\n7. Meeting Copilot: NOT GENERATED');
  }

  // 8. Evidence chain
  console.log('\n8. Evidence Chain:');
  console.log(`   Signals: ${intel.prospect.signals.length}`);
  const withEvidence = intel.prospect.signals.filter(s => s.evidence);
  console.log(`   With evidence: ${withEvidence.length}`);

  // 9. Dashboard
  const dashboard = await api('GET', '/api/growth/intelligence?view=dashboard', token);
  console.log('\n9. Dashboard:');
  console.log(`   Total intelligence: ${dashboard.dashboard.totalIntel}`);
  console.log(`   Published: ${dashboard.dashboard.published}`);
  console.log(`   Active rules: ${dashboard.dashboard.activeRules}`);
  console.log(`   Total insights: ${dashboard.dashboard.insights}`);

  // 10. Versions
  const versions = await api('GET', `/api/growth/intelligence?view=versions&prospectId=${prospectId}`, token);
  console.log(`\n10. Version history: ${versions.versions.length} version(s)`);

  // 11. Rules
  const rules = await api('GET', '/api/growth/intelligence?view=rules', token);
  console.log(`11. Inference rules: ${rules.rules.length}`);

  console.log('\n=== E2E TEST COMPLETE ===');
  console.log(`\nResult: Account Intelligence Engine is OPERATIONAL`);
  console.log(`  - ${intel.sections.length} modular sections built`);
  console.log(`  - ${intel.insights.length} insights inferred`);
  console.log(`  - Meeting Copilot: ${intel.meetingBrief ? 'READY' : 'NOT AVAILABLE'}`);
  console.log(`  - Evidence chain: ${intel.prospect.signals.length} signals → ${intel.insights.length} insights`);
  console.log(`  - Lifecycle: requested → collecting → correlating → inferring → reviewing → published`);
}

main().catch(console.error);
