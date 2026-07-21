const BASE = 'http://localhost:3000';

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
  console.log('=== Account Intelligence Engine — Full Pipeline E2E ===\n');

  // Auth
  const { token } = await api('POST', '/api/auth/login', '', { email: 'admin@cortex.in', password: 'admin123' });
  console.log('1. Auth: OK');

  // Get Prism Fintech Corp candidate
  const candData = await api('GET', '/api/growth/discovery?view=candidates&status=new', token);
  const cand = (candData.candidates || []).find(c => c.companyName === 'Prism Fintech Corp');
  if (!cand) { console.log('ERROR: Candidate "Prism Fintech Corp" not found'); return; }
  console.log(`2. Candidate: ${cand.companyName} | ${cand.signals.length} signals`);

  // Extract signals
  const extract = await api('POST', '/api/growth/discovery', token, { action: 'extract_signals', candidateId: cand.id });
  console.log(`3. Signal extraction: ${extract.signalsExtracted} signals extracted`);

  // Qualify
  const qualify = await api('POST', '/api/growth/discovery', token, { action: 'qualify', candidateId: cand.id });
  console.log(`4. Qualification: score=${qualify.score} grade=${qualify.grade}`);

  // Promote to prospect
  const promote = await api('POST', '/api/growth/discovery', token, { action: 'promote', candidateId: cand.id });
  if (!promote.prospectId) { console.log(`ERROR: Promotion failed: ${promote.error}`); return; }
  console.log(`5. Promoted to prospect: ${promote.prospectId}`);

  // Wait for auto-intelligence from event
  await new Promise(r => setTimeout(r, 3000));

  // Generate intelligence (manual trigger, may be v2 if auto already ran)
  const genResult = await api('POST', '/api/growth/intelligence', token, { action: 'generate', prospectId: promote.prospectId });
  if (genResult.error) { console.log(`ERROR: ${genResult.error}`); return; }

  const intel = genResult.intelligence;
  console.log(`\n=== ACCOUNT INTELLIGENCE GENERATED ===`);
  console.log(`Company: ${intel.prospect.companyName}`);
  console.log(`Version: v${intel.version} | Status: ${intel.status} | Confidence: ${intel.overallConfidence}%`);
  console.log(`Sections: ${intel.sections.length} | Insights: ${intel.insights.length}`);

  // Sections
  console.log(`\n--- Sections ---`);
  for (const s of intel.sections) {
    console.log(`  ${s.title}: ${s.confidence}% confidence, ${s.evidenceCount} evidence`);
  }

  // Insights
  console.log(`\n--- Insights ---`);
  for (const ins of intel.insights) {
    console.log(`  [${ins.confidence}%] ${ins.title} → ${ins.recommendedService || 'general'}`);
  }

  // Meeting Copilot
  if (intel.meetingBrief) {
    console.log(`\n--- Meeting Copilot ---`);
    console.log(`  Objective: ${intel.meetingBrief.objective}`);
    console.log(`  Questions: ${intel.meetingBrief.questions.length}`);
    console.log(`  Objections prepared: ${intel.meetingBrief.likelyObjections.length}`);
    console.log(`  Budget range: ${intel.meetingBrief.expectedBudgetRange}`);
    console.log(`  Services: ${intel.meetingBrief.suggestedServices.join(', ')}`);
    console.log(`  Next action: ${intel.meetingBrief.nextBestAction}`);
  }

  // Evidence chain
  console.log(`\n--- Evidence Chain ---`);
  console.log(`  Signals: ${intel.prospect.signals.length}`);
  const withEvidence = intel.prospect.signals.filter(s => s.evidence);
  console.log(`  With evidence: ${withEvidence.length}`);
  for (const s of intel.prospect.signals.slice(0, 10)) {
    const ev = s.evidence ? ` | "${s.evidence.slice(0, 70)}"` : '';
    console.log(`  [${s.type}] ${s.value} (${s.confidence}%)${ev}`);
  }

  // Dashboard
  const dash = await api('GET', '/api/growth/intelligence?view=dashboard', token);
  console.log(`\n--- Dashboard ---`);
  console.log(`  Total intelligence: ${dash.dashboard.totalIntel}`);
  console.log(`  Published: ${dash.dashboard.published}`);
  console.log(`  Active rules: ${dash.dashboard.activeRules}`);
  console.log(`  Total insights: ${dash.dashboard.insights}`);

  // Rules
  const rules = await api('GET', '/api/growth/intelligence?view=rules', token);
  console.log(`\n--- Inference Rules ---`);
  for (const r of rules.rules) {
    console.log(`  ${r.name}: base ${r.confidenceBase}%, ${r.active ? 'active' : 'disabled'}`);
  }

  console.log(`\n=== PIPELINE COMPLETE ===`);
  console.log(`Discovery → Signals → Qualification → Prospect → Intelligence → Meeting Copilot`);
  console.log(`${intel.prospect.signals.length} signals → ${intel.insights.length} insights → ${intel.meetingBrief?.suggestedServices.length || 0} service recommendations`);
}

main().catch(console.error);
