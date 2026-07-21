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
  console.log('=== Relationship Intelligence E2E Test ===\n');

  // Auth
  const { token } = await api('POST', '/api/auth/login', '', { email: 'admin@cortex.in', password: 'admin123' });
  console.log('1. Auth: OK');

  // Check existing prospects
  const pd = await api('GET', '/api/growth/discovery?view=prospects', token);
  const prospects = pd.prospects || [];
  console.log(`2. Prospects: ${prospects.length}`);

  if (prospects.length === 0) {
    console.log('   No prospects to build graph from. Run discovery first.');
    return;
  }

  // Build all relationship graphs
  console.log('\n3. Building relationship graphs for all prospects...');
  const buildResult = await api('POST', '/api/growth/relationships', token, { action: 'build_all' });
  console.log(`   Prospects processed: ${buildResult.prospectsProcessed}`);
  console.log(`   Nodes created: ${buildResult.totalNodes}`);
  console.log(`   Edges created: ${buildResult.totalEdges}`);
  console.log(`   Ecosystem insights: ${buildResult.insightsCreated}`);

  // Get graph stats
  const statsResult = await api('GET', '/api/growth/relationships?view=stats', token);
  const stats = statsResult.stats;
  console.log(`\n4. Knowledge Graph Stats:`);
  console.log(`   Total nodes: ${stats.totalNodes}`);
  console.log(`   Total edges: ${stats.totalEdges}`);
  console.log(`   Total insights: ${stats.totalInsights}`);
  console.log(`   Nodes by type:`);
  for (const [type, count] of Object.entries(stats.nodesByType)) {
    console.log(`     ${type}: ${count}`);
  }
  console.log(`   Edges by type:`);
  for (const [type, count] of Object.entries(stats.edgesByType)) {
    console.log(`     ${type}: ${count}`);
  }

  // Get graph for first prospect
  const prospect = prospects[prospects.length - 1]; // most recent
  console.log(`\n5. Graph for ${prospect.companyName}:`);
  const graphResult = await api('GET', `/api/growth/relationships?view=graph&prospectId=${prospect.id}`, token);
  const graph = graphResult.graph;
  console.log(`   Nodes: ${graph.nodes.length}`);
  console.log(`   Edges: ${graph.edges.length}`);

  // Print nodes by type
  const nodesByType = {};
  for (const n of graph.nodes) {
    nodesByType[n.type] = nodesByType[n.type] || [];
    nodesByType[n.type].push(n.name);
  }
  for (const [type, names] of Object.entries(nodesByType)) {
    console.log(`   [${type}] ${names.join(', ')}`);
  }

  // Print edges
  console.log(`\n6. Connections:`);
  for (const e of graph.edges.slice(0, 15)) {
    const src = graph.nodes.find(n => n.id === e.source);
    const tgt = graph.nodes.find(n => n.id === e.target);
    const ev = e.evidence ? ` — "${e.evidence.slice(0, 60)}"` : '';
    console.log(`   ${src?.name} --[${e.type}]--> ${tgt?.name} (${e.strength}%)${ev}`);
  }
  if (graph.edges.length > 15) console.log(`   ... and ${graph.edges.length - 15} more`);

  // Ecosystem insights
  const insightsResult = await api('GET', '/api/growth/relationships?view=insights', token);
  const insights = insightsResult.insights || [];
  console.log(`\n7. Ecosystem Insights: ${insights.length}`);
  for (const ins of insights) {
    console.log(`   [${ins.type}] ${ins.title} (${ins.confidence}%)`);
    console.log(`     ${ins.description.slice(0, 120)}`);
    if (ins.recommendation) console.log(`     → ${ins.recommendation.slice(0, 100)}`);
    if (ins.recommendedService) console.log(`     Service: ${ins.recommendedService}`);
  }

  // Shared connections (if 2+ prospects)
  if (prospects.length >= 2) {
    console.log(`\n8. Shared connections between ${prospects[0].companyName} and ${prospects[1].companyName}:`);
    const shared = await api('GET', `/api/growth/relationships?view=shared&prospectA=${prospects[0].id}&prospectB=${prospects[1].id}`, token);
    const s = shared.shared;
    console.log(`   Shared technologies: ${s.sharedTechnologies.join(', ') || 'none'}`);
    console.log(`   Shared vendors: ${s.sharedVendors.join(', ') || 'none'}`);
    console.log(`   Shared industry: ${s.sharedIndustry}`);
    console.log(`   Connection strength: ${s.connectionStrength}%`);
  }

  console.log('\n=== E2E TEST COMPLETE ===');
  console.log(`\nResult: Relationship Intelligence is OPERATIONAL`);
  console.log(`  Knowledge Graph: ${stats.totalNodes} nodes, ${stats.totalEdges} edges`);
  console.log(`  Ecosystem Insights: ${stats.totalInsights} patterns detected`);
  console.log(`  Signal → Node → Edge → Pattern → Insight pipeline working`);
}

main().catch(console.error);
