export interface RyvanService {
  id: string;
  name: string;
  category: string;
  description: string;
  technologies: string[];
  idealFor: string[];
  differentiators: string[];
  pricingRange: { pilot: string; quarterly: string };
}

export interface RyvanDifferentiator {
  title: string;
  evidence: string;
}

export interface CompetitivePosition {
  vs: string;
  advantages: string[];
  approach: string;
}

export interface IndustryFit {
  industry: string;
  recommendedServices: string[];
  pitch: string;
  objections: string[];
}

export const RYVAN_IDENTITY = {
  name: "Ryvan Technologies",
  tagline: "We engineer intelligence into everything.",
  mission: "To make advanced AI practical and trustworthy, engineering intelligence into everything we build.",
  vision: "A world where every team has a tireless team of AI agents building, testing and protecting their software.",
  hq: "Hyderabad, Telangana, India",
  phone: "+91 95533 38838",
  website: "https://www.ryvanai.com",
  model: "Applied AI and Engineering Studio  - lean team of senior engineers, no hierarchical layers",
  uptime: "99.99%",
  support: "24/7",
  delivery: "Senior-led, 100%",
  flagship: "RYN  - autonomous QA agent that tests software the way a human would",
} as const;

export const RYVAN_VALUES = [
  "Outcomes over output",
  "Privacy by default",
  "Senior craftsmanship on every line",
  "Shipping real products with evaluation and security",
] as const;

export const RYVAN_DELIVERY_PHASES = [
  { phase: "Discover", description: "Goals definition, user research, scope alignment" },
  { phase: "Design", description: "Architecture decisions, de-risking, technical blueprint" },
  { phase: "Build", description: "Iterative engineering with continuous quality" },
  { phase: "Deploy", description: "Automated, observable releases to production" },
  { phase: "Scale", description: "Monitoring, optimization, and growth" },
] as const;

export const RYVAN_SERVICES: RyvanService[] = [
  {
    id: "ai-agents",
    name: "AI Agents",
    category: "AI & Automation",
    description: "Agentic workflows, tool/API integration, multi-agent systems that execute real work autonomously",
    technologies: ["LangChain", "CrewAI", "AutoGen", "Claude", "GPT", "Tool APIs"],
    idealFor: ["enterprises automating complex workflows", "companies building AI-first products"],
    differentiators: ["Production-grade agent architecture", "Built-in evaluation and safety", "Multi-agent orchestration"],
    pricingRange: { pilot: "₹3-8L", quarterly: "₹15-40L" },
  },
  {
    id: "qa-automation",
    name: "QA Automation",
    category: "AI & Automation",
    description: "Autonomous end-to-end testing via RYN  - Ryvan's proprietary QA agent. Self-healing tests, continuous monitoring, reproducible bug reports",
    technologies: ["Playwright", "Selenium", "Cypress", "RYN Agent", "AI Testing"],
    idealFor: ["teams scaling QA without scaling headcount", "companies with complex test matrices", "enterprises needing audit-grade quality"],
    differentiators: ["RYN: autonomous QA agent (flagship product)", "Self-healing test flows", "AI-powered test generation", "Continuous quality monitoring"],
    pricingRange: { pilot: "₹2-5L", quarterly: "₹10-30L" },
  },
  {
    id: "process-automation",
    name: "Process Automation",
    category: "AI & Automation",
    description: "Workflow agents, document AI, system integrations that eliminate manual operational work",
    technologies: ["RPA", "Document AI", "OCR", "Workflow Engines", "API Integration"],
    idealFor: ["operations-heavy companies", "BFSI", "healthcare", "government"],
    differentiators: ["AI-first approach vs traditional RPA", "Document understanding, not just OCR"],
    pricingRange: { pilot: "₹2-5L", quarterly: "₹8-25L" },
  },
  {
    id: "conversational-ai",
    name: "Conversational AI",
    category: "AI & Automation",
    description: "Chatbots, voice assistants, multilingual support agents powered by modern LLMs",
    technologies: ["LLMs", "NLP", "Speech-to-Text", "Text-to-Speech", "RAG"],
    idealFor: ["customer support", "internal helpdesks", "multilingual markets"],
    differentiators: ["Context-aware conversations", "Multilingual support", "Enterprise security"],
    pricingRange: { pilot: "₹2-4L", quarterly: "₹8-20L" },
  },
  {
    id: "web-mobile",
    name: "Web & Mobile Development",
    category: "Software Development",
    description: "Full-stack applications, APIs, platforms  - built with AI-native architecture from day one",
    technologies: ["React", "Next.js", "Node.js", "TypeScript", "React Native", "Flutter"],
    idealFor: ["startups building MVPs", "enterprises modernizing apps", "product companies"],
    differentiators: ["AI-native from inception", "Senior engineers only", "Production-grade from sprint 1"],
    pricingRange: { pilot: "₹3-8L", quarterly: "₹15-50L" },
  },
  {
    id: "computer-vision",
    name: "Computer Vision",
    category: "Software Development",
    description: "Object detection, OCR, visual inspection, video analytics for industrial and commercial applications",
    technologies: ["OpenCV", "YOLO", "TensorFlow", "PyTorch", "Custom Models"],
    idealFor: ["manufacturing", "retail", "security", "healthcare imaging"],
    differentiators: ["Edge deployment capability", "Real-time processing", "Custom model training"],
    pricingRange: { pilot: "₹5-10L", quarterly: "₹20-50L" },
  },
  {
    id: "generative-ai",
    name: "Generative AI",
    category: "Software Development",
    description: "Copilots, RAG systems, fine-tuning, guardrails  - enterprise-grade generative AI that's safe and evaluated",
    technologies: ["Claude", "GPT", "Llama", "RAG", "Vector DBs", "Fine-tuning", "Guardrails"],
    idealFor: ["enterprises adopting GenAI", "product companies adding AI features", "knowledge-heavy industries"],
    differentiators: ["Built-in evaluation framework", "AI safety and governance", "Production guardrails"],
    pricingRange: { pilot: "₹4-10L", quarterly: "₹20-60L" },
  },
  {
    id: "cloud-infrastructure",
    name: "Cloud Infrastructure",
    category: "Infrastructure & Operations",
    description: "Kubernetes, multi-cloud architecture on AWS/Azure/GCP  - designed for scale, security, and cost optimization",
    technologies: ["AWS", "Azure", "GCP", "Kubernetes", "Terraform", "Docker"],
    idealFor: ["companies migrating to cloud", "scaling startups", "enterprises optimizing cloud costs"],
    differentiators: ["Multi-cloud expertise", "Cloud-native from inception", "Cost optimization focus"],
    pricingRange: { pilot: "₹3-8L", quarterly: "₹12-35L" },
  },
  {
    id: "devops",
    name: "DevOps & Automation",
    category: "Infrastructure & Operations",
    description: "CI/CD pipelines, GitOps, infrastructure-as-code, monitoring  - engineering velocity without compromise",
    technologies: ["GitHub Actions", "GitLab CI", "ArgoCD", "Terraform", "Prometheus", "Grafana"],
    idealFor: ["teams with slow release cycles", "companies lacking DevOps expertise", "scaling engineering orgs"],
    differentiators: ["GitOps-first approach", "Observable from day one", "AI-enhanced CI/CD"],
    pricingRange: { pilot: "₹2-5L", quarterly: "₹10-25L" },
  },
  {
    id: "mlops",
    name: "MLOps & AI Platforms",
    category: "Infrastructure & Operations",
    description: "Model CI/CD, feature stores, drift monitoring  - production ML infrastructure that keeps models accurate",
    technologies: ["MLflow", "Kubeflow", "Feature Stores", "Model Registry", "Drift Detection"],
    idealFor: ["companies with ML models in production", "AI-first product companies"],
    differentiators: ["End-to-end ML lifecycle", "Automated drift detection", "Model governance"],
    pricingRange: { pilot: "₹5-10L", quarterly: "₹20-50L" },
  },
  {
    id: "data-analytics",
    name: "Data & Analytics",
    category: "Data & Security",
    description: "Data engineering, warehouses, dashboards  - turning raw data into business decisions",
    technologies: ["Snowflake", "BigQuery", "dbt", "Airflow", "Looker", "Power BI"],
    idealFor: ["companies drowning in data", "enterprises needing real-time analytics"],
    differentiators: ["AI-ready data architecture", "Real-time pipelines", "Self-serve analytics"],
    pricingRange: { pilot: "₹3-8L", quarterly: "₹15-40L" },
  },
  {
    id: "cyber-security",
    name: "Cyber Security",
    category: "Data & Security",
    description: "Zero-trust architecture, threat modeling, penetration testing  - enterprise-grade security",
    technologies: ["Zero Trust", "SAST/DAST", "Pen Testing", "SOC", "Compliance Frameworks"],
    idealFor: ["regulated industries", "BFSI", "healthcare", "government"],
    differentiators: ["AI-powered threat detection", "Compliance-first approach", "Security by design"],
    pricingRange: { pilot: "₹3-8L", quarterly: "₹15-40L" },
  },
  {
    id: "private-ai",
    name: "Local & Private AI",
    category: "Data & Security",
    description: "On-device LLMs, private data handling  - AI that never leaves your infrastructure",
    technologies: ["Ollama", "vLLM", "On-premise LLMs", "Edge AI", "Private Cloud"],
    idealFor: ["defense", "healthcare", "government", "regulated industries"],
    differentiators: ["Zero data leakage guarantee", "On-premise deployment", "Air-gapped AI"],
    pricingRange: { pilot: "₹5-12L", quarterly: "₹25-60L" },
  },
  {
    id: "ai-governance",
    name: "AI Governance & Safety",
    category: "Data & Security",
    description: "AI evaluation, red-teaming, compliance frameworks  - responsible AI that enterprises trust",
    technologies: ["Evaluation Frameworks", "Red Teaming", "Bias Detection", "Compliance"],
    idealFor: ["enterprises deploying AI at scale", "regulated industries", "companies preparing for AI regulation"],
    differentiators: ["Systematic evaluation methodology", "Red-teaming expertise", "Compliance mapping"],
    pricingRange: { pilot: "₹2-5L", quarterly: "₹10-25L" },
  },
  {
    id: "machine-learning",
    name: "Machine Learning",
    category: "Strategic",
    description: "Custom models, LLM/RAG systems, predictive analytics  - ML that solves real business problems",
    technologies: ["PyTorch", "TensorFlow", "scikit-learn", "LLMs", "RAG", "Custom Models"],
    idealFor: ["companies with unique data advantages", "prediction-heavy businesses"],
    differentiators: ["Production-first ML", "Custom model training", "Evaluation-driven development"],
    pricingRange: { pilot: "₹5-12L", quarterly: "₹25-60L" },
  },
  {
    id: "ai-strategy",
    name: "AI Strategy & Consulting",
    category: "Strategic",
    description: "AI roadmaps, proof-of-concept development, team enablement  - strategic AI adoption",
    technologies: ["AI Assessment", "Roadmapping", "POC Development", "Training"],
    idealFor: ["enterprises starting their AI journey", "CXOs evaluating AI investment"],
    differentiators: ["Practitioner-led (not slide-ware)", "POC-first approach", "Hands-on enablement"],
    pricingRange: { pilot: "₹2-5L", quarterly: "₹8-20L" },
  },
];

export const RYVAN_DIFFERENTIATORS: RyvanDifferentiator[] = [
  { title: "AI-Native Engineering", evidence: "Every service is built with AI from inception, not bolted on after" },
  { title: "Senior-Only Delivery", evidence: "100% senior engineers on every project  - no juniors, no handoffs" },
  { title: "RYN: Autonomous QA Agent", evidence: "Flagship product  - tests software the way a human would, self-healing, continuous monitoring" },
  { title: "Production-Grade from Sprint 1", evidence: "Observable, tested, deployable from the first iteration" },
  { title: "One Partner, Full Stack", evidence: "16 services under one roof  - no scattered vendor ecosystems" },
  { title: "Evaluation-Driven AI", evidence: "Every AI system ships with evaluation, safety, and governance built in" },
  { title: "Privacy by Default", evidence: "On-premise, air-gapped, and private AI capabilities for regulated industries" },
  { title: "Founder-Led Engagement", evidence: "Direct access to leadership, no account manager layers" },
];

export const COMPETITIVE_POSITIONS: CompetitivePosition[] = [
  {
    vs: "Large System Integrators (Infosys, TCS, Wipro)",
    advantages: [
      "Senior engineers only  - no bench staffing or freshers",
      "AI-native delivery vs legacy transformation",
      "Founder access vs account manager layers",
      "Speed: weeks not months",
      "Outcome-based, not time-and-material",
    ],
    approach: "Position as the AI-specialist complement, not a replacement. Emphasize speed, quality, and AI-native capability.",
  },
  {
    vs: "Boutique AI Consultancies",
    advantages: [
      "Full-stack delivery, not just strategy",
      "16 production services vs narrow specialization",
      "Proprietary products (RYN) proving real capability",
      "Engineering studio model  - build, not advise",
    ],
    approach: "Prove depth through RYN and production case studies. Show that Ryvan ships, not just advises.",
  },
  {
    vs: "Product Companies Building In-House",
    advantages: [
      "Faster ramp-up  - immediate senior team",
      "Cross-industry AI pattern knowledge",
      "Pilot-first model reduces risk",
      "No recruitment overhead",
    ],
    approach: "Position as augmentation and acceleration. Start with a pilot to prove value before scaling.",
  },
  {
    vs: "Freelancers / Small Teams",
    advantages: [
      "Enterprise-grade security and governance",
      "Full lifecycle delivery including DevOps and MLOps",
      "24/7 support and 99.99% uptime commitment",
      "Systematic engineering process (RES)",
    ],
    approach: "Emphasize governance, reliability, and long-term partnership over individual talent.",
  },
];

export const INDUSTRY_FITS: IndustryFit[] = [
  {
    industry: "Healthcare",
    recommendedServices: ["qa-automation", "private-ai", "ai-governance", "data-analytics"],
    pitch: "AI that never leaves your infrastructure. HIPAA-aware, evaluation-driven, privacy by default.",
    objections: ["Data privacy concerns → Private AI capability", "Regulatory compliance → AI Governance service", "Legacy systems → Process Automation for integration"],
  },
  {
    industry: "BFSI",
    recommendedServices: ["ai-agents", "cyber-security", "process-automation", "machine-learning"],
    pitch: "Automate complex financial workflows with AI agents that are auditable, secure, and compliant.",
    objections: ["Security concerns → Zero-trust architecture", "Regulatory requirements → Compliance frameworks built-in", "Vendor lock-in → Multi-cloud, open standards"],
  },
  {
    industry: "Technology",
    recommendedServices: ["qa-automation", "ai-agents", "devops", "generative-ai"],
    pitch: "Ship faster without breaking things. RYN tests your software autonomously while your team focuses on building.",
    objections: ["We build in-house → Augmentation, not replacement", "Already have QA → RYN runs 24/7, finds what manual QA misses", "Budget → Pilot-first, prove ROI in 4 weeks"],
  },
  {
    industry: "Retail",
    recommendedServices: ["conversational-ai", "computer-vision", "data-analytics", "cloud-infrastructure"],
    pitch: "AI-powered customer experiences from chatbots to visual search, backed by real-time analytics.",
    objections: ["ROI uncertainty → Start with conversational AI pilot, measurable in weeks", "Integration complexity → Full-stack capability handles end-to-end"],
  },
  {
    industry: "Manufacturing",
    recommendedServices: ["computer-vision", "process-automation", "data-analytics", "private-ai"],
    pitch: "Visual inspection, predictive maintenance, and process automation  - AI that works on the factory floor.",
    objections: ["Edge deployment → On-device AI capability", "IT maturity → Phased approach, start with one line"],
  },
  {
    industry: "Government",
    recommendedServices: ["private-ai", "cyber-security", "process-automation", "ai-governance"],
    pitch: "Sovereign AI that stays within your borders. Air-gapped, auditable, compliant.",
    objections: ["Procurement process → Flexible engagement models", "Data sovereignty → Local & Private AI", "Trust → Government experience, security credentials"],
  },
  {
    industry: "Edtech",
    recommendedServices: ["generative-ai", "web-mobile", "conversational-ai", "data-analytics"],
    pitch: "Personalized learning at scale with GenAI copilots, adaptive content, and real-time analytics.",
    objections: ["Student data privacy → Privacy by default", "Scale challenges → Cloud-native architecture"],
  },
];

export const OBJECTION_LIBRARY: Array<{ objection: string; response: string; evidence: string }> = [
  {
    objection: "We handle everything in-house",
    response: "We complement internal teams. Ryvan handles specialized AI and QA workloads so your core team stays focused on product. Most clients start with a 4-week pilot alongside their existing team.",
    evidence: "Senior-only delivery model designed for augmentation, not replacement",
  },
  {
    objection: "We already have a vendor",
    response: "We often work alongside existing partners. Our AI-native engineering is a different, complementary capability  - particularly RYN for autonomous QA and our AI agent expertise.",
    evidence: "16 distinct services  - clients typically engage Ryvan for AI-specific capabilities their existing vendor doesn't cover",
  },
  {
    objection: "Budget is tight",
    response: "Our pilot model starts at ₹2-5L for 4 weeks  - designed to prove value before any larger commitment. If the pilot doesn't deliver measurable impact, there's no obligation to continue.",
    evidence: "Pilot-first engagement model, outcome-based pricing available",
  },
  {
    objection: "You're too small / we need a large vendor",
    response: "Every engineer on your project is a senior specialist  - no bench staffing, no freshers. You get the depth of a boutique with the breadth of 16 production services. And you get founder access, not an account manager.",
    evidence: "100% senior delivery, 16 services, 24/7 support, 99.99% uptime commitment",
  },
  {
    objection: "AI is too risky / not mature enough",
    response: "That's exactly why our AI Governance & Safety practice exists. Every AI system we build ships with evaluation, red-teaming, and compliance built in. We make AI trustworthy, not just functional.",
    evidence: "Dedicated AI Governance service, evaluation-driven development, RYN proves production-grade AI is achievable",
  },
  {
    objection: "How do we know this will work?",
    response: "Start with a 4-week proof of concept. We define success criteria upfront, build it, and measure results. If it doesn't hit the targets, you've learned something valuable at minimal cost.",
    evidence: "POC-first approach, structured Discover → Design → Build → Deploy → Scale methodology",
  },
];

export function matchRyvanServices(prospect: {
  industry?: string | null;
  techStack?: string[];
  painPoints?: string[];
  recommendedServices?: string[];
  size?: string | null;
}): {
  services: RyvanService[];
  industryFit: IndustryFit | null;
  compatibility: number;
  pitch: string;
  objections: Array<{ objection: string; response: string }>;
  estimatedDealRange: string;
  competitivePosition: CompetitivePosition | null;
} {
  const industry = prospect.industry?.toLowerCase() || "";
  const techStack = prospect.techStack || [];
  const painPoints = prospect.painPoints || [];

  // Find industry fit
  const industryFit = INDUSTRY_FITS.find(f =>
    industry.includes(f.industry.toLowerCase())
  ) || null;

  // Score services by relevance
  const serviceScores = RYVAN_SERVICES.map(service => {
    let score = 0;

    // Industry match
    if (industryFit?.recommendedServices.includes(service.id)) score += 30;

    // Tech stack overlap
    const techOverlap = service.technologies.filter(t =>
      techStack.some(ts => ts.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(ts.toLowerCase()))
    ).length;
    score += techOverlap * 10;

    // Pain point alignment
    const painMatches = painPoints.filter(p => {
      const lower = p.toLowerCase();
      return service.description.toLowerCase().includes(lower) ||
             service.name.toLowerCase().includes(lower) ||
             service.idealFor.some(i => i.toLowerCase().includes(lower));
    }).length;
    score += painMatches * 15;

    // Recommended service match from qualification
    if (prospect.recommendedServices?.some(rs =>
      rs.toLowerCase().includes(service.name.toLowerCase()) ||
      service.name.toLowerCase().includes(rs.toLowerCase().replace(/\s+/g, ""))
    )) {
      score += 25;
    }

    return { service, score };
  });

  // Top services
  const topServices = serviceScores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(s => s.service);

  // If no matches, use industry defaults or top general services
  const services = topServices.length > 0 ? topServices : (
    industryFit
      ? RYVAN_SERVICES.filter(s => industryFit.recommendedServices.includes(s.id))
      : RYVAN_SERVICES.filter(s => ["qa-automation", "ai-agents", "generative-ai"].includes(s.id))
  );

  // Compatibility score
  let compatibility = 40; // base
  if (industryFit) compatibility += 20;
  if (techStack.length > 0 && serviceScores.some(s => s.score > 20)) compatibility += 20;
  if (painPoints.length > 0) compatibility += 10;
  if (services.length >= 3) compatibility += 10;
  compatibility = Math.min(99, compatibility);

  // Competitive position based on prospect size
  const size = prospect.size?.toLowerCase() || "";
  let competitivePosition: CompetitivePosition | null = null;
  if (size.includes("enterprise") || size.includes("large")) {
    competitivePosition = COMPETITIVE_POSITIONS.find(c => c.vs.includes("Large System")) || null;
  } else if (size.includes("startup") || size.includes("small")) {
    competitivePosition = COMPETITIVE_POSITIONS.find(c => c.vs.includes("Product Companies")) || null;
  } else {
    competitivePosition = COMPETITIVE_POSITIONS.find(c => c.vs.includes("Boutique")) || null;
  }

  // Pitch
  const pitch = industryFit?.pitch || `Ryvan brings AI-native engineering across ${services.map(s => s.name).join(", ")}  - senior-led delivery, pilot-first engagement.`;

  // Relevant objections
  const objections = industryFit?.objections.map(o => {
    const parts = o.split("→").map(s => s.trim());
    return { objection: parts[0] || o, response: parts[1] || "" };
  }) || OBJECTION_LIBRARY.slice(0, 3).map(o => ({ objection: o.objection, response: o.response }));

  // Estimated deal range
  const sizeMultiplier = size.includes("enterprise") ? 3 : size.includes("large") ? 2 : size.includes("mid") ? 1.5 : 1;
  const baseMin = services.reduce((sum, s) => sum + parseLakhs(s.pricingRange.quarterly.split("-")[0]), 0) / services.length;
  const baseMax = services.reduce((sum, s) => sum + parseLakhs(s.pricingRange.quarterly.split("-")[1]?.replace("L", "") || "20"), 0) / services.length;
  const dealMin = Math.round(baseMin * sizeMultiplier);
  const dealMax = Math.round(baseMax * sizeMultiplier);
  const estimatedDealRange = `₹${dealMin}-${dealMax}L/quarter`;

  return { services, industryFit, compatibility, pitch, objections, estimatedDealRange, competitivePosition };
}

function parseLakhs(s: string): number {
  const clean = s.replace(/[₹L,\s]/g, "");
  return parseFloat(clean) || 10;
}
