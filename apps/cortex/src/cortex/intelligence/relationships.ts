import { prisma } from "@/lib/prisma";
import { eventBus } from "@/cortex/runtime/event";

interface NodeInput {
  type: string;
  name: string;
  metadata?: Record<string, unknown>;
  prospectId?: string;
  signalId?: string;
  confidence?: number;
}

interface EdgeInput {
  sourceType: string;
  sourceName: string;
  targetType: string;
  targetName: string;
  edgeType: string;
  strength?: number;
  evidence?: string;
  prospectId?: string;
}

const TECH_ECOSYSTEMS: Record<string, string[]> = {
  Microsoft: ["Azure", ".NET", "C#", "TypeScript", "SQL Server", "Power BI", "Dynamics", "Teams"],
  AWS: ["AWS", "Lambda", "DynamoDB", "S3", "ECS", "EKS", "CloudFormation", "CDK"],
  Google: ["GCP", "Firebase", "BigQuery", "Kubernetes", "Go", "Angular", "Flutter", "TensorFlow"],
  Meta: ["React", "React Native", "GraphQL", "Jest", "PyTorch"],
  JetBrains: ["Kotlin", "IntelliJ", "TeamCity"],
  HashiCorp: ["Terraform", "Vault", "Consul", "Nomad", "Vagrant"],
  Atlassian: ["Jira", "Confluence", "Bitbucket", "Bamboo"],
};

const CLOUD_TO_VENDOR: Record<string, string> = {
  AWS: "Amazon Web Services",
  Azure: "Microsoft Azure",
  GCP: "Google Cloud Platform",
  "on-premise": "Self-hosted",
  hybrid: "Multi-cloud",
};

class RelationshipIntelligenceEngine {
  async buildGraph(prospectId: string): Promise<{
    nodesCreated: number;
    edgesCreated: number;
  }> {
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { signals: true },
    });
    if (!prospect) throw new Error("Prospect not found");

    let nodesCreated = 0;
    let edgesCreated = 0;

    // 1. Create company node
    const companyNode = await this.ensureNode({
      type: "company",
      name: prospect.companyName,
      prospectId: prospect.id,
      confidence: prospect.confidence || 70,
      metadata: {
        website: prospect.website,
        industry: prospect.industry,
        size: prospect.size,
        employees: prospect.employees,
      },
    });
    if (companyNode.created) nodesCreated++;

    // 2. Industry edge
    if (prospect.industry) {
      const industryNode = await this.ensureNode({ type: "industry", name: prospect.industry });
      if (industryNode.created) nodesCreated++;
      const edge = await this.ensureEdge({
        sourceType: "company", sourceName: prospect.companyName,
        targetType: "industry", targetName: prospect.industry,
        edgeType: "industry_of", strength: 95, prospectId,
      });
      if (edge.created) edgesCreated++;
    }

    // 3. Process signals into graph
    for (const signal of prospect.signals) {
      const result = await this.processSignal(signal, prospect.companyName, prospectId);
      nodesCreated += result.nodes;
      edgesCreated += result.edges;
    }

    // 4. Detect ecosystem relationships
    const ecoResult = await this.detectEcosystemRelationships(prospect.companyName, prospectId);
    nodesCreated += ecoResult.nodes;
    edgesCreated += ecoResult.edges;

    await eventBus.publish({
      type: "relationship.graph.built.v1",
      version: "1",
      source: "relationship.engine",
      payload: { prospectId, nodesCreated, edgesCreated },
    });

    return { nodesCreated, edgesCreated };
  }

  private async processSignal(
    signal: { id: string; type: string; value: string; confidence: number; evidence: string | null },
    companyName: string,
    prospectId: string
  ): Promise<{ nodes: number; edges: number }> {
    let nodes = 0;
    let edges = 0;

    switch (signal.type) {
      case "technology": {
        const n = await this.ensureNode({
          type: "technology", name: signal.value,
          signalId: signal.id, confidence: signal.confidence,
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "technology", targetName: signal.value,
          edgeType: "uses", strength: signal.confidence,
          evidence: signal.evidence || undefined, prospectId,
        });
        if (e.created) edges++;
        break;
      }
      case "cloud": {
        const n = await this.ensureNode({
          type: "cloud_provider", name: signal.value,
          signalId: signal.id, confidence: signal.confidence,
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "cloud_provider", targetName: signal.value,
          edgeType: "uses", strength: signal.confidence,
          evidence: signal.evidence || undefined, prospectId,
        });
        if (e.created) edges++;

        const vendor = CLOUD_TO_VENDOR[signal.value];
        if (vendor) {
          const vn = await this.ensureNode({ type: "vendor", name: vendor });
          if (vn.created) nodes++;
          const ve = await this.ensureEdge({
            sourceType: "company", sourceName: companyName,
            targetType: "vendor", targetName: vendor,
            edgeType: "vendors_with", strength: signal.confidence, prospectId,
          });
          if (ve.created) edges++;
        }
        break;
      }
      case "hiring": {
        const n = await this.ensureNode({
          type: "person", name: `${signal.value} (Open Role)`,
          signalId: signal.id, confidence: signal.confidence,
          metadata: { roleType: "open_position" },
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "person", targetName: `${signal.value} (Open Role)`,
          edgeType: "hires_for", strength: signal.confidence,
          evidence: signal.evidence || undefined, prospectId,
        });
        if (e.created) edges++;
        break;
      }
      case "partnership": {
        const n = await this.ensureNode({
          type: "partner", name: signal.value,
          signalId: signal.id, confidence: signal.confidence,
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "partner", targetName: signal.value,
          edgeType: "partners_with", strength: signal.confidence,
          evidence: signal.evidence || undefined, prospectId,
        });
        if (e.created) edges++;
        break;
      }
      case "certification": {
        const n = await this.ensureNode({
          type: "certification", name: signal.value,
          signalId: signal.id, confidence: signal.confidence,
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "certification", targetName: signal.value,
          edgeType: "certified_in", strength: signal.confidence,
          evidence: signal.evidence || undefined, prospectId,
        });
        if (e.created) edges++;
        break;
      }
      case "funding":
      case "growth":
      case "expansion": {
        const n = await this.ensureNode({
          type: "service", name: signal.value,
          signalId: signal.id, confidence: signal.confidence,
        });
        if (n.created) nodes++;
        break;
      }
      case "pain": {
        const serviceFit = this.painToService(signal.value);
        if (serviceFit) {
          const n = await this.ensureNode({ type: "service", name: serviceFit });
          if (n.created) nodes++;
          const e = await this.ensureEdge({
            sourceType: "company", sourceName: companyName,
            targetType: "service", targetName: serviceFit,
            edgeType: "provides_service", strength: signal.confidence,
            evidence: signal.evidence || undefined, prospectId,
          });
          if (e.created) edges++;
        }
        break;
      }
    }

    return { nodes, edges };
  }

  private async detectEcosystemRelationships(
    companyName: string,
    prospectId: string
  ): Promise<{ nodes: number; edges: number }> {
    let nodes = 0;
    let edges = 0;

    const companyNode = await prisma.graphNode.findFirst({
      where: { type: "company", normalizedName: companyName.toLowerCase().trim() },
    });
    if (!companyNode) return { nodes, edges };

    const outgoing = await prisma.graphEdge.findMany({
      where: { sourceId: companyNode.id, type: "uses" },
      include: { target: true },
    });

    const techNames = outgoing.map((e) => e.target.name);

    for (const [ecosystem, techs] of Object.entries(TECH_ECOSYSTEMS)) {
      const overlap = techNames.filter((t) => techs.includes(t));
      if (overlap.length >= 2) {
        const n = await this.ensureNode({
          type: "partner", name: `${ecosystem} Ecosystem`,
          metadata: { matchedTechs: overlap },
        });
        if (n.created) nodes++;
        const e = await this.ensureEdge({
          sourceType: "company", sourceName: companyName,
          targetType: "partner", targetName: `${ecosystem} Ecosystem`,
          edgeType: "partners_with",
          strength: Math.min(95, 50 + overlap.length * 15),
          evidence: `Uses ${overlap.join(", ")} from ${ecosystem} ecosystem`,
          prospectId,
        });
        if (e.created) edges++;
      }
    }

    return { nodes, edges };
  }

  async detectCrossCompanyPatterns(): Promise<number> {
    const companyNodes = await prisma.graphNode.findMany({
      where: { type: "company" },
      include: {
        outgoingEdges: {
          where: { type: "uses" },
          include: { target: true },
        },
      },
    });

    if (companyNodes.length < 2) return 0;

    let insightsCreated = 0;

    // Find technology clusters: companies sharing the same tech stack
    const techToCompanies = new Map<string, string[]>();
    for (const company of companyNodes) {
      for (const edge of company.outgoingEdges) {
        const tech = edge.target.name;
        const list = techToCompanies.get(tech) || [];
        list.push(company.name);
        techToCompanies.set(tech, list);
      }
    }

    // Detect shared technology patterns (2+ companies)
    const sharedTechs: Array<{ tech: string; companies: string[] }> = [];
    for (const [tech, companies] of techToCompanies) {
      if (companies.length >= 2) {
        sharedTechs.push({ tech, companies: [...new Set(companies)] });
      }
    }

    if (sharedTechs.length > 0) {
      const topShared = sharedTechs
        .sort((a, b) => b.companies.length - a.companies.length)
        .slice(0, 10);

      for (const { tech, companies } of topShared) {
        const prospectIds = await this.getProspectIdsForCompanies(companies);
        const existing = await prisma.ecosystemInsight.findFirst({
          where: { type: "cluster", title: { contains: tech } },
        });
        if (existing) continue;

        await prisma.ecosystemInsight.create({
          data: {
            type: "cluster",
            title: `${tech} Technology Cluster`,
            description: `${companies.length} prospects share ${tech}: ${companies.join(", ")}. Consider a bundled ${tech}-focused offering.`,
            confidence: Math.min(95, 60 + companies.length * 10),
            prospectIds: JSON.stringify(prospectIds),
            recommendation: `Create a ${tech}-specific case study or offering targeting these prospects together`,
          },
        });
        insightsCreated++;
      }
    }

    // Detect industry + technology patterns
    const industryCompanies = new Map<string, Array<{ name: string; techs: string[] }>>();
    for (const company of companyNodes) {
      const industryEdge = await prisma.graphEdge.findFirst({
        where: { sourceId: company.id, type: "industry_of" },
        include: { target: true },
      });
      if (!industryEdge) continue;
      const industry = industryEdge.target.name;
      const techs = company.outgoingEdges.map((e) => e.target.name);
      const list = industryCompanies.get(industry) || [];
      list.push({ name: company.name, techs });
      industryCompanies.set(industry, list);
    }

    for (const [industry, companies] of industryCompanies) {
      if (companies.length < 2) continue;

      const allTechs = companies.flatMap((c) => c.techs);
      const techCounts = new Map<string, number>();
      for (const t of allTechs) techCounts.set(t, (techCounts.get(t) || 0) + 1);

      const commonTechs = [...techCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([tech]) => tech);

      if (commonTechs.length >= 2) {
        const existing = await prisma.ecosystemInsight.findFirst({
          where: { type: "pattern", title: { contains: industry } },
        });
        if (existing) continue;

        const prospectIds = await this.getProspectIdsForCompanies(companies.map((c) => c.name));
        await prisma.ecosystemInsight.create({
          data: {
            type: "pattern",
            title: `${industry} Industry Pattern`,
            description: `${companies.length} ${industry} prospects share common tech: ${commonTechs.join(", ")}. Industry-specific expertise opportunity.`,
            confidence: 75,
            prospectIds: JSON.stringify(prospectIds),
            recommendation: `Build ${industry}-specific service packages around ${commonTechs.slice(0, 3).join(", ")}`,
            recommendedService: commonTechs.includes("Kubernetes") || commonTechs.includes("Docker") ? "Cloud & DevOps" : undefined,
          },
        });
        insightsCreated++;
      }
    }

    // Detect hiring pattern clusters
    const hiringCompanies = new Map<string, string[]>();
    for (const company of companyNodes) {
      const hiringEdges = await prisma.graphEdge.findMany({
        where: { sourceId: company.id, type: "hires_for" },
        include: { target: true },
      });
      for (const edge of hiringEdges) {
        const role = edge.target.name.replace(" (Open Role)", "");
        const list = hiringCompanies.get(role) || [];
        list.push(company.name);
        hiringCompanies.set(role, list);
      }
    }

    for (const [role, companies] of hiringCompanies) {
      if (companies.length < 2) continue;
      const existing = await prisma.ecosystemInsight.findFirst({
        where: { type: "opportunity", title: { contains: role } },
      });
      if (existing) continue;

      const prospectIds = await this.getProspectIdsForCompanies(companies);
      await prisma.ecosystemInsight.create({
        data: {
          type: "opportunity",
          title: `${role} Demand Cluster`,
          description: `${companies.length} prospects are hiring for ${role}: ${companies.join(", ")}. Strong signal for relevant Ryvan services.`,
          confidence: 80,
          prospectIds: JSON.stringify(prospectIds),
          recommendation: `Position Ryvan's engineering services as an alternative to hiring — faster ramp, no recruitment overhead`,
          recommendedService: this.roleToService(role),
        },
      });
      insightsCreated++;
    }

    if (insightsCreated > 0) {
      await eventBus.publish({
        type: "ecosystem.patterns.detected.v1",
        version: "1",
        source: "relationship.engine",
        payload: { insightsCreated },
      });
    }

    return insightsCreated;
  }

  async getProspectGraph(prospectId: string): Promise<{
    nodes: Array<{ id: string; type: string; name: string; metadata: Record<string, unknown>; confidence: number }>;
    edges: Array<{ id: string; source: string; target: string; type: string; strength: number; evidence: string | null }>;
  }> {
    const companyNode = await prisma.graphNode.findFirst({
      where: { prospectId },
    });
    if (!companyNode) return { nodes: [], edges: [] };

    const outgoing = await prisma.graphEdge.findMany({
      where: { sourceId: companyNode.id },
      include: { target: true },
    });

    const incoming = await prisma.graphEdge.findMany({
      where: { targetId: companyNode.id },
      include: { source: true },
    });

    const nodeMap = new Map<string, { id: string; type: string; name: string; metadata: Record<string, unknown>; confidence: number }>();

    nodeMap.set(companyNode.id, {
      id: companyNode.id,
      type: companyNode.type,
      name: companyNode.name,
      metadata: safeJSON(companyNode.metadata),
      confidence: companyNode.confidence,
    });

    for (const edge of outgoing) {
      nodeMap.set(edge.target.id, {
        id: edge.target.id,
        type: edge.target.type,
        name: edge.target.name,
        metadata: safeJSON(edge.target.metadata),
        confidence: edge.target.confidence,
      });
    }
    for (const edge of incoming) {
      nodeMap.set(edge.source.id, {
        id: edge.source.id,
        type: edge.source.type,
        name: edge.source.name,
        metadata: safeJSON(edge.source.metadata),
        confidence: edge.source.confidence,
      });
    }

    const edges = [...outgoing, ...incoming].map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: e.type,
      strength: e.strength,
      evidence: e.evidence,
    }));

    return { nodes: Array.from(nodeMap.values()), edges };
  }

  async getEcosystemInsights(prospectId?: string): Promise<Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    confidence: number;
    recommendation: string | null;
    recommendedService: string | null;
    prospectIds: string[];
  }>> {
    const all = await prisma.ecosystemInsight.findMany({
      orderBy: { confidence: "desc" },
    });

    const insights = all.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      description: i.description,
      confidence: i.confidence,
      recommendation: i.recommendation,
      recommendedService: i.recommendedService,
      prospectIds: safeJSON<string[]>(i.prospectIds),
    }));

    if (prospectId) {
      return insights.filter((i) => i.prospectIds.includes(prospectId));
    }
    return insights;
  }

  async getGraphStats(): Promise<{
    totalNodes: number;
    totalEdges: number;
    totalInsights: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  }> {
    const [totalNodes, totalEdges, totalInsights] = await Promise.all([
      prisma.graphNode.count(),
      prisma.graphEdge.count(),
      prisma.ecosystemInsight.count(),
    ]);

    const nodes = await prisma.graphNode.groupBy({ by: ["type"], _count: true });
    const edges = await prisma.graphEdge.groupBy({ by: ["type"], _count: true });

    const nodesByType: Record<string, number> = {};
    for (const n of nodes) nodesByType[n.type] = n._count;

    const edgesByType: Record<string, number> = {};
    for (const e of edges) edgesByType[e.type] = e._count;

    return { totalNodes, totalEdges, totalInsights, nodesByType, edgesByType };
  }

  async getSharedConnections(prospectIdA: string, prospectIdB: string): Promise<{
    sharedTechnologies: string[];
    sharedVendors: string[];
    sharedIndustry: boolean;
    connectionStrength: number;
  }> {
    const [graphA, graphB] = await Promise.all([
      this.getProspectGraph(prospectIdA),
      this.getProspectGraph(prospectIdB),
    ]);

    const techsA = new Set(graphA.nodes.filter((n) => n.type === "technology").map((n) => n.name));
    const techsB = new Set(graphB.nodes.filter((n) => n.type === "technology").map((n) => n.name));
    const sharedTechnologies = [...techsA].filter((t) => techsB.has(t));

    const vendorsA = new Set(graphA.nodes.filter((n) => n.type === "vendor" || n.type === "cloud_provider").map((n) => n.name));
    const vendorsB = new Set(graphB.nodes.filter((n) => n.type === "vendor" || n.type === "cloud_provider").map((n) => n.name));
    const sharedVendors = [...vendorsA].filter((v) => vendorsB.has(v));

    const industryA = graphA.nodes.find((n) => n.type === "industry")?.name;
    const industryB = graphB.nodes.find((n) => n.type === "industry")?.name;
    const sharedIndustry = !!(industryA && industryB && industryA === industryB);

    const totalShared = sharedTechnologies.length + sharedVendors.length + (sharedIndustry ? 5 : 0);
    const totalPossible = Math.max(techsA.size + vendorsA.size, techsB.size + vendorsB.size) + 5;
    const connectionStrength = Math.round((totalShared / Math.max(totalPossible, 1)) * 100);

    return { sharedTechnologies, sharedVendors, sharedIndustry, connectionStrength };
  }

  private async ensureNode(input: NodeInput): Promise<{ id: string; created: boolean }> {
    const normalizedName = input.name.toLowerCase().trim();
    const existing = await prisma.graphNode.findUnique({
      where: { type_normalizedName: { type: input.type, normalizedName } },
    });
    if (existing) {
      if (input.prospectId && !existing.prospectId) {
        await prisma.graphNode.update({
          where: { id: existing.id },
          data: { prospectId: input.prospectId },
        });
      }
      return { id: existing.id, created: false };
    }
    const node = await prisma.graphNode.create({
      data: {
        type: input.type,
        name: input.name,
        normalizedName,
        metadata: JSON.stringify(input.metadata || {}),
        prospectId: input.prospectId,
        signalId: input.signalId,
        confidence: input.confidence || 70,
      },
    });
    return { id: node.id, created: true };
  }

  private async ensureEdge(input: EdgeInput): Promise<{ id: string; created: boolean }> {
    const sourceNode = await prisma.graphNode.findUnique({
      where: { type_normalizedName: { type: input.sourceType, normalizedName: input.sourceName.toLowerCase().trim() } },
    });
    const targetNode = await prisma.graphNode.findUnique({
      where: { type_normalizedName: { type: input.targetType, normalizedName: input.targetName.toLowerCase().trim() } },
    });
    if (!sourceNode || !targetNode) return { id: "", created: false };

    const existing = await prisma.graphEdge.findUnique({
      where: { sourceId_targetId_type: { sourceId: sourceNode.id, targetId: targetNode.id, type: input.edgeType } },
    });
    if (existing) return { id: existing.id, created: false };

    const edge = await prisma.graphEdge.create({
      data: {
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        type: input.edgeType,
        strength: input.strength || 50,
        evidence: input.evidence,
        prospectId: input.prospectId,
      },
    });
    return { id: edge.id, created: true };
  }

  private async getProspectIdsForCompanies(companyNames: string[]): Promise<string[]> {
    const nodes = await prisma.graphNode.findMany({
      where: {
        type: "company",
        normalizedName: { in: companyNames.map((n) => n.toLowerCase().trim()) },
        prospectId: { not: null },
      },
      select: { prospectId: true },
    });
    return nodes.filter((n) => n.prospectId).map((n) => n.prospectId!);
  }

  private painToService(pain: string): string | null {
    const lower = pain.toLowerCase();
    if (/legacy|monolith|migration|modernization/.test(lower)) return "Cloud & DevOps";
    if (/testing|qa|quality|regression|automation/.test(lower)) return "QA Automation";
    if (/data|analytics|reporting|pipeline/.test(lower)) return "Data Engineering";
    if (/ai|ml|machine learning|automation/.test(lower)) return "Enterprise AI";
    if (/security|compliance|audit|gdpr|hipaa|sox/.test(lower)) return "Security Engineering";
    if (/scaling|performance|infrastructure/.test(lower)) return "Cloud & DevOps";
    return null;
  }

  private roleToService(role: string): string | null {
    const lower = role.toLowerCase();
    if (/qa|test|quality|sdet/.test(lower)) return "QA Automation";
    if (/devops|sre|infrastructure|cloud/.test(lower)) return "Cloud & DevOps";
    if (/data|analytics|etl/.test(lower)) return "Data Engineering";
    if (/ai|ml|machine learning/.test(lower)) return "Enterprise AI";
    if (/fullstack|frontend|backend|engineer/.test(lower)) return "Software Engineering";
    return null;
  }
}

function safeJSON<T = Record<string, unknown>>(str: string, fallback?: T): T {
  try { return JSON.parse(str); } catch { return (fallback || {}) as T; }
}

export const relationshipEngine = new RelationshipIntelligenceEngine();
