import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidence: {
      create: vi.fn().mockResolvedValue({ id: "ev-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    prospect: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    discoverySignal: {
      create: vi.fn().mockResolvedValue({ id: "sig-1" }),
    },
    accountIntelligence: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "intel-1" }),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  complete: vi.fn().mockResolvedValue(null),
  chat: vi.fn().mockResolvedValue(null),
  isLlmAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../engine", () => ({
  intelligenceEngine: {
    requestIntelligence: vi.fn().mockResolvedValue("intel-1"),
  },
}));

import { prisma } from "@/lib/prisma";
import { complete } from "@/lib/llm";
import { researchService } from "./research-service";
import { WebsiteCollector } from "./website-collector";
import { TechnologyCollector } from "./technology-collector";
import { HiringCollector } from "./hiring-collector";
import { NewsCollector } from "./news-collector";
import { PeopleCollector } from "./people-collector";
import { BuyingSignalCollector } from "./buying-signal-collector";
import { EvidenceSynthesis } from "./evidence-synthesis";

const mockCtx = {
  addReasoning: vi.fn(),
  getReasoning: vi.fn().mockReturnValue("test reasoning"),
  memory: { get: vi.fn(), set: vi.fn() },
  missionId: "mission-1",
} as unknown as Parameters<InstanceType<typeof WebsiteCollector>["execute"]>[0];

const baseInput = {
  prospectId: "prospect-1",
  companyName: "TestCorp",
  website: "testcorp.com",
  missionId: "mission-1",
};

describe("ResearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extractEvidence returns empty array when LLM returns null", async () => {
    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings).toEqual([]);
  });

  it("extractEvidence parses JSON array from LLM", async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify([
      { type: "technology", value: "React", content: "Uses React for frontend", confidence: 90, source: "website" },
    ]));

    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("technology");
    expect(findings[0].value).toBe("React");
    expect(findings[0].confidence).toBe(90);
  });

  it("extractEvidence handles { findings: [...] } wrapper", async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify({
      findings: [
        { type: "hiring", value: "QA Engineer", content: "Hiring QA", confidence: 85, source: "careers" },
      ],
    }));

    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("hiring");
  });

  it("extractEvidence clamps confidence to 0-100", async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify([
      { type: "tech", value: "Go", content: "Uses Go", confidence: 150, source: "blog" },
      { type: "tech", value: "Rust", content: "Uses Rust", confidence: -10, source: "blog" },
    ]));

    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings[0].confidence).toBe(100);
    expect(findings[1].confidence).toBe(0);
  });

  it("extractEvidence filters out findings with empty value or content", async () => {
    vi.mocked(complete).mockResolvedValueOnce(JSON.stringify([
      { type: "tech", value: "", content: "something", confidence: 80, source: "x" },
      { type: "tech", value: "React", content: "", confidence: 80, source: "x" },
      { type: "tech", value: "Vue", content: "Uses Vue", confidence: 80, source: "x" },
    ]));

    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe("Vue");
  });

  it("extractEvidence returns empty on invalid JSON", async () => {
    vi.mocked(complete).mockResolvedValueOnce("not json at all");
    const findings = await researchService.extractEvidence("prompt", "content");
    expect(findings).toEqual([]);
  });
});

describe("Evidence Collectors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const collectors = [
    { name: "WebsiteCollector", Cls: WebsiteCollector, id: "website-collector" },
    { name: "TechnologyCollector", Cls: TechnologyCollector, id: "technology-collector" },
    { name: "HiringCollector", Cls: HiringCollector, id: "hiring-collector" },
    { name: "NewsCollector", Cls: NewsCollector, id: "news-collector" },
    { name: "PeopleCollector", Cls: PeopleCollector, id: "people-collector" },
    { name: "BuyingSignalCollector", Cls: BuyingSignalCollector, id: "buying-signal-collector" },
  ];

  for (const { name, Cls, id } of collectors) {
    describe(name, () => {
      it("has correct manifest id", () => {
        const agent = new Cls();
        expect(agent.manifest.id).toBe(id);
        expect(agent.manifest.owner).toBe("cortex");
      });

      it("returns success with 0 evidence when no web results", async () => {
        vi.spyOn(researchService, "webSearch").mockResolvedValue([]);
        const agent = new Cls();
        const plan = await agent.plan(mockCtx, baseInput);
        const result = await agent.execute(mockCtx, plan, baseInput);
        expect(result.success).toBe(true);
        expect(result.data.evidenceCount).toBe(0);
      });

      it("creates evidence records from LLM extraction", async () => {
        vi.spyOn(researchService, "webSearch").mockResolvedValue([
          { title: "TestCorp", link: "https://testcorp.com", snippet: "TestCorp uses React and AWS" },
        ]);
        vi.mocked(complete).mockResolvedValueOnce(JSON.stringify([
          { type: "technology", value: "React", content: "TestCorp uses React", confidence: 90, source: "website" },
        ]));

        const agent = new Cls();
        const plan = await agent.plan(mockCtx, baseInput);
        const result = await agent.execute(mockCtx, plan, baseInput);

        expect(result.success).toBe(true);
        expect(result.data.evidenceCount).toBe(1);
        expect(prisma.evidence.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            prospectId: "prospect-1",
            collector: expect.any(String),
            type: "technology",
            value: "React",
            content: "TestCorp uses React",
            confidence: 90,
            missionId: "mission-1",
          }),
        });
      });

      it("emits evidence.collected.v1 event", async () => {
        vi.spyOn(researchService, "webSearch").mockResolvedValue([
          { title: "Test", link: "https://test.com", snippet: "test" },
        ]);
        vi.mocked(complete).mockResolvedValueOnce(JSON.stringify([
          { type: "tech", value: "Go", content: "Uses Go", confidence: 85, source: "blog" },
        ]));

        const agent = new Cls();
        const plan = await agent.plan(mockCtx, baseInput);
        const result = await agent.execute(mockCtx, plan, baseInput);

        expect(result.eventsToPublish).toHaveLength(1);
        expect(result.eventsToPublish[0].type).toBe("evidence.collected.v1");
        expect(result.eventsToPublish[0].payload.count).toBe(1);
      });
    });
  }
});

describe("EvidenceSynthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct manifest id", () => {
    const agent = new EvidenceSynthesis();
    expect(agent.manifest.id).toBe("evidence-synthesis");
  });

  it("returns 0 signals when no evidence exists", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue({
      id: "prospect-1",
      candidates: [],
    } as unknown as Awaited<ReturnType<typeof prisma.prospect.findUnique>>);
    vi.mocked(prisma.evidence.findMany).mockResolvedValue([]);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "prospect-1" });
    const result = await agent.execute(mockCtx, plan, { prospectId: "prospect-1" });

    expect(result.success).toBe(true);
    expect(result.data.signalsCreated).toBe(0);
  });

  it("converts evidence to DiscoverySignals", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue({
      id: "prospect-1",
      candidates: [{ id: "candidate-1" }],
    } as unknown as Awaited<ReturnType<typeof prisma.prospect.findUnique>>);
    vi.mocked(prisma.evidence.findMany).mockResolvedValue([
      { id: "ev-1", prospectId: "prospect-1", collector: "technology", type: "technology", content: "Uses React", value: "React", confidence: 90, source: "website", sourceUrl: "https://test.com", metadata: "{}", version: 1, missionId: "m-1", createdAt: new Date() },
      { id: "ev-2", prospectId: "prospect-1", collector: "hiring", type: "hiring", content: "Hiring QA", value: "QA Engineer", confidence: 85, source: "linkedin", sourceUrl: null, metadata: "{}", version: 1, missionId: "m-1", createdAt: new Date() },
    ] as unknown as Awaited<ReturnType<typeof prisma.evidence.findMany>>);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "prospect-1" });
    const result = await agent.execute(mockCtx, plan, { prospectId: "prospect-1" });

    expect(result.success).toBe(true);
    expect(result.data.signalsCreated).toBe(2);
    expect(prisma.discoverySignal.create).toHaveBeenCalledTimes(2);
    expect(prisma.discoverySignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: "candidate-1",
        prospectId: "prospect-1",
        type: "technology",
        value: "React",
        source: "technology_collector",
      }),
    });
  });

  it("creates signals with null candidateId when no candidate exists", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue({
      id: "prospect-1",
      candidates: [],
    } as unknown as Awaited<ReturnType<typeof prisma.prospect.findUnique>>);
    vi.mocked(prisma.evidence.findMany).mockResolvedValue([
      { id: "ev-1", prospectId: "prospect-1", collector: "news", type: "funding", content: "Series B", value: "Series B $20M", confidence: 95, source: "press", sourceUrl: null, metadata: "{}", version: 1, missionId: null, createdAt: new Date() },
    ] as unknown as Awaited<ReturnType<typeof prisma.evidence.findMany>>);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "prospect-1" });
    const result = await agent.execute(mockCtx, plan, { prospectId: "prospect-1" });

    expect(result.data.signalsCreated).toBe(1);
    expect(prisma.discoverySignal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: null,
        prospectId: "prospect-1",
        type: "funding",
      }),
    });
  });

  it("updates prospect tech stack from technology evidence", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue({
      id: "prospect-1",
      candidates: [],
    } as unknown as Awaited<ReturnType<typeof prisma.prospect.findUnique>>);
    vi.mocked(prisma.evidence.findMany).mockResolvedValue([
      { id: "ev-1", prospectId: "prospect-1", collector: "technology", type: "technology", content: "Uses React", value: "React", confidence: 90, source: "web", sourceUrl: null, metadata: "{}", version: 1, missionId: null, createdAt: new Date() },
      { id: "ev-2", prospectId: "prospect-1", collector: "technology", type: "cloud", content: "On AWS", value: "AWS", confidence: 88, source: "web", sourceUrl: null, metadata: "{}", version: 1, missionId: null, createdAt: new Date() },
    ] as unknown as Awaited<ReturnType<typeof prisma.evidence.findMany>>);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "prospect-1" });
    await agent.execute(mockCtx, plan, { prospectId: "prospect-1" });

    expect(prisma.prospect.update).toHaveBeenCalledWith({
      where: { id: "prospect-1" },
      data: { techStack: JSON.stringify(["React", "AWS"]) },
    });
  });

  it("emits evidence.synthesized.v1 event", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue({
      id: "prospect-1",
      candidates: [],
    } as unknown as Awaited<ReturnType<typeof prisma.prospect.findUnique>>);
    vi.mocked(prisma.evidence.findMany).mockResolvedValue([
      { id: "ev-1", prospectId: "prospect-1", collector: "website", type: "product", content: "SaaS", value: "SaaS Platform", confidence: 80, source: "web", sourceUrl: null, metadata: "{}", version: 1, missionId: "m-1", createdAt: new Date() },
    ] as unknown as Awaited<ReturnType<typeof prisma.evidence.findMany>>);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "prospect-1" });
    const result = await agent.execute(mockCtx, plan, { prospectId: "prospect-1", missionId: "m-1" });

    expect(result.eventsToPublish).toHaveLength(1);
    expect(result.eventsToPublish[0].type).toBe("evidence.synthesized.v1");
    expect(result.eventsToPublish[0].payload.evidenceCount).toBe(1);
  });

  it("returns failure when prospect not found", async () => {
    vi.mocked(prisma.prospect.findUnique).mockResolvedValue(null);

    const agent = new EvidenceSynthesis();
    const plan = await agent.plan(mockCtx, { prospectId: "nonexistent" });
    const result = await agent.execute(mockCtx, plan, { prospectId: "nonexistent" });

    expect(result.success).toBe(false);
    expect(result.data.error).toBe("Prospect not found");
  });
});
