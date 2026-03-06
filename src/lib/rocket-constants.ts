// ─── Rocket Pipeline Constants ────────────────────────────────────
// Source: Nauta Outbound Machine, BDR Agent Build Guide,
//         Sales Playbook - Wholesale, Sales Voice Messaging Guidelines

// ─── Strategic Priorities (SP1-SP5) ──────────────────────────────

export const STRATEGIC_PRIORITIES = {
  SP1: { id: "SP1", label: "Supply Chain Automation", description: "Automating manual supply chain processes, reducing human intervention in procurement, logistics, and fulfillment", color: "#3B82F6" },
  SP2: { id: "SP2", label: "Digital Transformation", description: "Modernizing legacy systems, moving from spreadsheets/email to integrated platforms", color: "#8B5CF6" },
  SP3: { id: "SP3", label: "Supply Chain Visibility", description: "Real-time tracking, in-transit inventory, ETA reliability, cross-system data integration", color: "#06B6D4" },
  SP4: { id: "SP4", label: "Market Expansion", description: "Entering new geographies, adding product lines, scaling import/distribution operations", color: "#10B981" },
  SP5: { id: "SP5", label: "M&A Integration", description: "Post-merger system consolidation, harmonizing procurement and logistics across entities", color: "#F59E0B" },
} as const;

// ─── Business Challenges (BC1-BC6) ───────────────────────────────

export const BUSINESS_CHALLENGES = {
  BC1: { id: "BC1", label: "Supply Chain Disruption", description: "Port congestion, carrier delays, supplier failures, geopolitical disruptions affecting supply continuity", color: "#EF4444" },
  BC2: { id: "BC2", label: "Inventory & Stockouts", description: "Low fill rates, excess safety stock, cash trapped in inventory, reactive replenishment", color: "#F97316" },
  BC3: { id: "BC3", label: "Manual Procurement", description: "Spreadsheet-driven ordering, no supplier scoring, human-dependent processes, error-prone workflows", color: "#EAB308" },
  BC4: { id: "BC4", label: "Tariff & Compliance", description: "HTS misclassification, tariff overpayments, regulatory complexity, customs documentation burden", color: "#A855F7" },
  BC5: { id: "BC5", label: "Cost Reduction Pressure", description: "Detention & demurrage costs, emergency freight, inefficient carrier allocation, margin compression", color: "#EC4899" },
  BC6: { id: "BC6", label: "Working Capital Optimization", description: "Cash-to-cash cycle improvement, DIO reduction, safety stock right-sizing, supplier payment optimization", color: "#14B8A6" },
} as const;

export type SPKey = keyof typeof STRATEGIC_PRIORITIES;
export type BCKey = keyof typeof BUSINESS_CHALLENGES;

// ─── ICP Scoring Weights ─────────────────────────────────────────
// Source: Sales Playbook - Wholesale Distribution

export const ICP_SCORING_WEIGHTS = [
  { signal: "Epicor/Infor ERP confirmed", points: 30, field: "erpSystem" },
  { signal: "No dedicated TMS", points: 20, field: "tmsSystem" },
  { signal: "Revenue $200M-$1B", points: 20, field: "estimatedRevenue" },
  { signal: "Revenue $30M-$200M", points: 10, field: "estimatedRevenue" },
  { signal: "Active importer (customs data)", points: 20, field: "importVolume" },
  { signal: "50+ containers/month", points: 15, field: "containerVolume" },
  { signal: "VP/Director-level contact", points: 15, field: "position" },
  { signal: "Recent supply chain hiring", points: 10, field: "scHiring" },
  { signal: "Upcoming trade show", points: 10, field: "tradeShow" },
  { signal: "Warmly website visit", points: 5, field: "websiteVisit" },
] as const;

// ─── Seniority Buckets ───────────────────────────────────────────

export const SENIORITY_BUCKETS = {
  "c-level": { label: "C-Level", tone: "Strategic and brief. Board-level language. ROI and competitive advantage.", titles: ["CEO", "COO", "CFO", "CTO", "CPO", "CSCO", "Chief"] },
  "vp": { label: "VP", tone: "Strategic + operational. Acknowledge their influence on both strategy and execution.", titles: ["VP", "Vice President", "SVP", "EVP"] },
  "director": { label: "Director", tone: "Tactical and day-to-day. Reference specific workflows and pain points they manage.", titles: ["Director", "Sr. Director", "Senior Director"] },
  "manager": { label: "Manager", tone: "Operational detail. Reference tools and processes they use daily. Build internal advocacy.", titles: ["Manager", "Sr. Manager", "Import Manager", "Logistics Manager", "Procurement Manager"] },
} as const;

// ─── Persona Openers ─────────────────────────────────────────────
// Source: Sales Voice - Messaging Guidelines

export const PERSONA_OPENERS = {
  "vp-procurement": {
    label: "VP of Procurement / CPO",
    opener: "Procurement teams at distributors your size making million-dollar replenishment decisions based on spreadsheets and gut feel.",
    capabilities: ["Supplier Score (OTIF, lead time)", "In-Transit Inventory Allocation", "Stockout Predictor", "Load Consolidation", "Short Shipment & Claims", "Cost Anomaly Detection"],
    roiAngle: "Even a 0.25% fill rate improvement at your revenue is worth $X in recovered sales.",
    role: "Champion",
  },
  "vp-supply-chain": {
    label: "VP of Supply Chain / CSCO",
    opener: "Supply chain leaders at distributors your size: great systems (ERP, TMS, WMS) but they don't talk to each other in real time, gap filled by manual work.",
    capabilities: ["Ask Nauta (conversational)", "Stockout Predictor", "ETA Reliability & Reforecast", "Carrier Performance", "Supplier Score", "Executive Dashboards"],
    roiAngle: "Combined impact (better fill rate, lower safety stock, fewer emergency POs) usually runs 5-10x platform cost in year one.",
    role: "Champion + Economic Buyer",
  },
  "cfo": {
    label: "CFO / Controller",
    opener: "Do you have real-time visibility into how much working capital is tied up in safety stock right now, and how confident are you that those levels are right?",
    capabilities: ["Working Capital Analytics", "DIO Optimization", "Safety Stock Right-Sizing", "Cash Flow Forecasting"],
    roiAngle: "Reducing DIO by 10-15 days at your revenue frees $X in cash flow annually.",
    role: "Economic Buyer",
  },
  "coo": {
    label: "COO / CEO / Owner",
    opener: "Your team has invested in good systems. But intelligence layer between them is still people and spreadsheets.",
    capabilities: ["Cross-System Intelligence", "Autonomous Execution", "Financial Impact Across Three Statements"],
    roiAngle: "Financial impact shows up on three statements: more revenue (better fill rates), less cash trapped (inventory), shorter cash cycle.",
    role: "Executive Sponsor",
  },
  "import-manager": {
    label: "Import / Logistics Manager",
    opener: "How many hours a week does your team spend chasing emails, checking carrier portals, updating spreadsheets to figure out where shipments are?",
    capabilities: ["Unified Shipment View", "Document Processing", "ETA Alerts", "Exception Management"],
    roiAngle: "Eliminate 40+ hours/week of manual tracking. Alerts BEFORE something goes wrong instead of AFTER.",
    role: "Power User (not decision maker)",
  },
} as const;

export type PersonaKey = keyof typeof PERSONA_OPENERS;

// ─── Banned Words ────────────────────────────────────────────────
// Source: Sales Voice - Messaging Guidelines

export const BANNED_WORDS = [
  "leverage", "streamline", "optimize", "solution", "synergy",
  "cutting-edge", "innovative", "comprehensive", "seamless",
  "nice to have", "superficial", "complicated", "confusing",
  "I hope this email finds you well", "I wanted to reach out",
  "excited to share", "looking forward to hearing from you",
];

// ─── Preferred Words ─────────────────────────────────────────────

export const PREFERRED_WORDS = [
  "fill rate", "working capital", "cash-to-cash cycle", "safety stock",
  "SKU-level", "predict before it happens", "acts on it",
  "executes automatically", "replenishment", "decision queue not data entry",
  "systems don't talk to each other", "gap between systems filled by people",
  "between PO and product arriving",
];

// ─── Anti-AI Detection Rules ─────────────────────────────────────
// Source: Sales Voice - Messaging Guidelines

export const ANTI_AI_RULES = {
  subjectMaxWords: 4,
  subjectStyle: "lowercase unless grammar requires otherwise, no colons",
  email1MaxWords: 60,
  followUpMaxWords: 80,
  callScriptMaxWords: 100,
  openingLine: "No pleasantries, start with point or question",
  paragraphs: "1-3 sentences max per paragraph",
  totalSentences: "4-8 sentences per email",
  signOff: "Best, or just name. Never 'looking forward to hearing from you'",
  languageRules: [
    "Vary sentence length (AI writes uniform medium-length)",
    "Use contractions naturally (don't, isn't, we're, that's)",
    "Include ONE slightly informal phrase per email (honestly, quick question, not sure if this lands for you)",
    "Avoid perfect parallel structure (humans don't write balanced triads)",
    "Occasional sentence fragments are fine. Like this.",
    "One em dash maximum per email",
  ],
};

// ─── 13-Touch Sequence Template ──────────────────────────────────
// Source: Rocket Pipeline PDF (8-stage spec)

export const SEQUENCE_TEMPLATE_13_TOUCH = [
  { touchNumber: 1, channel: "email" as const, dayOffset: 1, label: "Cold Email" },
  { touchNumber: 2, channel: "call" as const, dayOffset: 2, label: "Call #1" },
  { touchNumber: 3, channel: "email" as const, dayOffset: 4, label: "Follow-Up Email" },
  { touchNumber: 4, channel: "call" as const, dayOffset: 5, label: "Call #2" },
  { touchNumber: 5, channel: "call" as const, dayOffset: 7, label: "Call #3" },
  { touchNumber: 6, channel: "linkedin" as const, dayOffset: 9, label: "LinkedIn Connection" },
  { touchNumber: 7, channel: "call" as const, dayOffset: 10, label: "Call #4" },
  { touchNumber: 8, channel: "email" as const, dayOffset: 12, label: "Case Study Email" },
  { touchNumber: 9, channel: "call" as const, dayOffset: 14, label: "Call #5" },
  { touchNumber: 10, channel: "email" as const, dayOffset: 16, label: "Break-Up Email" },
  { touchNumber: 11, channel: "call" as const, dayOffset: 18, label: "Call #6" },
  { touchNumber: 12, channel: "email" as const, dayOffset: 20, label: "Objection-Handling Email" },
  { touchNumber: 13, channel: "call" as const, dayOffset: 22, label: "Call #7" },
];

// ─── Competitive Responses ───────────────────────────────────────
// Source: Sales Playbook + Sales Voice

export const COMPETITIVE_RESPONSES: Record<string, { name: string; response: string }> = {
  e2open: {
    name: "E2Open",
    response: "E2Open solid for visibility. Gap: generates alerts but relies on your team to act. We sit on top, automatically execute. How much time your team spend manually acting on those alerts today?",
  },
  erp: {
    name: "ERP (Epicor/Infor/SAP)",
    response: "ERPs great systems of record, not execution layers. They tell you what you ordered; Nauta tells you what's about to go wrong and acts before it does. Nothing changes on your end.",
  },
  forwarder: {
    name: "Forwarder Portal",
    response: "Forwarder portals only show THEIR shipments. What about everything else? Other carriers, direct bookings, drayage? Nauta connects all of them plus your email, ERP, suppliers into one place.",
  },
  ariba_coupa: {
    name: "SAP Ariba / Coupa",
    response: "Excellent for indirect (office, IT, services). NOT designed for direct: high-frequency replenishment across dozens of suppliers, in-transit inventory, stockout prevention. That's where manual work lives.",
  },
  manhattan: {
    name: "Manhattan / Blue Yonder",
    response: "Question isn't whether you have systems. It's whether they talk to each other in real time and act on exceptions automatically. We fill that gap.",
  },
};

// ─── Discovery Questions ─────────────────────────────────────────
// Source: Sales Playbook - Wholesale

export const DISCOVERY_QUESTIONS = [
  { question: "When placing replenishment orders, how does your team decide how much to order and from which supplier?", listenFor: "spreadsheets, gut feel, buyer just knows" },
  { question: "How often dealing with stockouts or near-stockouts on top SKUs, and what does that cost you?", listenFor: "fill rate pain, let them quantify" },
  { question: "How much inventory carrying as safety stock, how confident level is right?", listenFor: "working capital conversation" },
  { question: "When supplier misses or ships short, how you find out and how long to respond?", listenFor: "reactive cycles, too late answers" },
  { question: "How currently measuring supplier performance and what you do with that data?", listenFor: "most measure poorly or not at all" },
];

// ─── Vertical-Specific Openers ───────────────────────────────────

export const VERTICAL_OPENERS: Record<string, { vertical: string; opener: string; urgencyDriver: string }> = {
  food_beverage: {
    vertical: "Food & Beverage",
    opener: "When a perishable supplier shorts you at 5 AM, what happens next?",
    urgencyDriver: "Perishability = urgency, high receptivity",
  },
  building_materials: {
    vertical: "Building Materials",
    opener: "When contractor calls about delayed critical material, how you find out?",
    urgencyDriver: "Project-driven demand, long lead times, 6-12 week horizons",
  },
  industrial_mro: {
    vertical: "Industrial / MRO",
    opener: "When customer has production line down, what's your emergency fill rate?",
    urgencyDriver: "Manufacturing uptime = $260K/hour downtime cost",
  },
};

// ─── Proof Points ────────────────────────────────────────────────

export const PROOF_POINTS = [
  "80% reduction in detention & demurrage costs",
  "60% reduction in container processing time",
  "40+ hours/week of manual workload eliminated",
  "Up to 75% of daily tasks fully automated",
  "5+ day improvement in ETA-to-ATA gap",
  "70K+ SKUs processed/month across 500+ suppliers",
];

// ─── Pipeline Stage Definitions ──────────────────────────────────

export const PIPELINE_STAGES = [
  { key: "upload" as const, label: "Upload", description: "Upload CSV or JSON prospect list", icon: "Upload" },
  { key: "mapping" as const, label: "Column Mapping", description: "Map columns to lead fields", icon: "Table" },
  { key: "clean-icp" as const, label: "Clean & ICP Score", description: "Score leads against ICP criteria", icon: "Filter" },
  { key: "enrichment" as const, label: "Enrichment", description: "AI-enrich leads with personalization data", icon: "Sparkles" },
  { key: "research" as const, label: "Company Research", description: "Assign SP/BC categories with reasoning", icon: "Search" },
  { key: "segmentation" as const, label: "Segmentation", description: "Group leads by SP/BC + persona", icon: "LayoutGrid" },
  { key: "sequence-gen" as const, label: "Sequence Generation", description: "Generate 13-touch personalized sequences", icon: "Wand2" },
  { key: "review-export" as const, label: "Review & Export", description: "Quality check and export to sequences", icon: "CheckCircle" },
] as const;
