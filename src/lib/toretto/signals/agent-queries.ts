// ============================================================
// Toretto Phase 2 — Agent Query Layer
// Read-only queries that combine signals, entities, and
// interactions into structured briefs for AI agents and
// dashboard consumption.
//
// Design rules:
//   - Never writes to any table
//   - Reads toretto.signals via schema("toretto")
//   - Reads public.accounts, public.deals, public.leads directly
//   - Returns typed interfaces, not raw rows
//   - All functions accept a SupabaseClient (service-role)
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SignalRow,
  SignalKey,
  SignalEntityType,
  ScoreBand,
} from "./types";

// Schema-qualified client helper (toretto schema)
function t(supabase: SupabaseClient) {
  return supabase.schema("toretto");
}

// ─── Return Types ───────────────────────────────────────────

/** Compact signal snapshot for briefs */
export interface SignalSnapshot {
  key: SignalKey;
  score: number;
  previousScore: number | null;
  band: ScoreBand;
  trend: "rising" | "falling" | "stable" | "new";
  interactionCount: number;
  computedAt: string;
  breakdown: Record<string, unknown>;
}

/** Account brief — everything an agent needs to reason about an account */
export interface AccountBrief {
  accountId: string;
  companyName: string;
  industry: string | null;
  website: string | null;
  employeeCount: string | null;
  estimatedRevenue: string | null;

  /** All computed signals for this account */
  signals: SignalSnapshot[];
  /** Overall health: worst-band across all signals */
  overallHealth: ScoreBand;
  /** Average score across all signals */
  averageScore: number;

  /** Related deals with their signal summaries */
  deals: DealSummary[];
  /** Related contacts with their signal summaries */
  contacts: ContactSummary[];

  /** Top risks (signals in critical/high bands, sorted by score asc) */
  topRisks: RiskItem[];
  /** Top opportunities (high-scoring positive signals) */
  topOpportunities: OpportunityItem[];

  queriedAt: string;
}

/** Compact deal summary for account briefs */
export interface DealSummary {
  dealId: string;
  dealName: string;
  amount: number | null;
  dealStage: string;
  probability: number | null;
  dealHealth: string | null;
  signals: SignalSnapshot[];
}

/** Compact contact summary for account briefs */
export interface ContactSummary {
  contactId: string;
  name: string;
  email: string | null;
  position: string | null;
  signals: SignalSnapshot[];
}

/** A specific risk identified from signals */
export interface RiskItem {
  signalKey: SignalKey;
  entityType: SignalEntityType;
  entityId: string;
  entityLabel: string;
  score: number;
  band: ScoreBand;
  reason: string;
}

/** A specific opportunity identified from signals */
export interface OpportunityItem {
  signalKey: SignalKey;
  entityType: SignalEntityType;
  entityId: string;
  entityLabel: string;
  score: number;
  band: ScoreBand;
  reason: string;
}

/** Deal brief — deep view for a specific deal */
export interface DealBrief {
  dealId: string;
  dealName: string;
  amount: number | null;
  dealStage: string;
  probability: number | null;
  dealHealth: string | null;
  nextAction: string | null;
  nextActionDate: string | null;

  /** All computed signals for this deal */
  signals: SignalSnapshot[];
  /** Overall deal risk level */
  riskLevel: ScoreBand;
  /** Momentum direction */
  momentumDirection: "accelerating" | "decelerating" | "steady" | "unknown";

  /** Parent account summary */
  account: {
    accountId: string;
    companyName: string;
    industry: string | null;
    signals: SignalSnapshot[];
    overallHealth: ScoreBand;
  } | null;

  /** Associated contacts with engagement signals */
  contacts: ContactSummary[];

  /** Top risks specific to this deal */
  topRisks: RiskItem[];

  queriedAt: string;
}

/** Priority queue entry */
export interface PriorityQueueItem {
  entityType: SignalEntityType;
  entityId: string;
  entityLabel: string;
  signalKey: SignalKey;
  score: number;
  previousScore: number | null;
  band: ScoreBand;
  trend: "rising" | "falling" | "stable" | "new";
  urgency: "critical" | "high" | "medium" | "low";
  reason: string;
}

/** Priority queue result */
export interface SignalPriorityQueueResult {
  items: PriorityQueueItem[];
  totalSignals: number;
  criticalCount: number;
  highCount: number;
  queriedAt: string;
}

// ─── Helper: Convert SignalRow → SignalSnapshot ─────────────

function toSnapshot(row: SignalRow): SignalSnapshot {
  let trend: SignalSnapshot["trend"] = "new";
  if (row.previous_score !== null) {
    const delta = row.score - row.previous_score;
    if (delta > 2) trend = "rising";
    else if (delta < -2) trend = "falling";
    else trend = "stable";
  }

  return {
    key: row.signal_key,
    score: row.score,
    previousScore: row.previous_score,
    band: row.score_band,
    trend,
    interactionCount: row.interaction_count,
    computedAt: row.computed_at,
    breakdown: row.breakdown,
  };
}

// ─── Helper: Derive overall health from signals ─────────────

const BAND_SEVERITY: Record<ScoreBand, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  inactive: 0,
};

function worstBand(signals: SignalSnapshot[]): ScoreBand {
  if (signals.length === 0) return "inactive";

  // For risk signals, high score = bad. For engagement signals, low score = bad.
  // Use the presence of critical/high bands from any signal.
  let worst: ScoreBand = "inactive";
  for (const s of signals) {
    if (BAND_SEVERITY[s.band] > BAND_SEVERITY[worst]) {
      worst = s.band;
    }
  }
  return worst;
}

function averageScore(signals: SignalSnapshot[]): number {
  if (signals.length === 0) return 0;
  const sum = signals.reduce((acc, s) => acc + s.score, 0);
  return Math.round(sum / signals.length);
}

// ─── Helper: Risk & opportunity derivation ──────────────────

/** Risk signals — high score = bad */
const RISK_SIGNAL_KEYS = new Set<SignalKey>([
  "deal_risk",
  "intent_silence_risk",
]);

/** Engagement/positive signals — low score = missed opportunity */
const OPPORTUNITY_SIGNAL_KEYS = new Set<SignalKey>([
  "account_engagement_score",
  "deal_momentum",
  "deal_stage_velocity",
  "intent_buying_activity",
  "intent_deal_progression",
  "contact_engagement",
]);

function deriveRiskReason(signal: SignalSnapshot): string {
  const b = signal.breakdown;
  switch (signal.key) {
    case "deal_risk":
      return `Risk score ${signal.score}: silence=${b.silence_factor ?? "?"}, sentiment=${b.sentiment_factor ?? "?"}, bounce=${b.bounce_factor ?? "?"}`;
    case "intent_silence_risk":
      return `Previously active account now ${b.risk_level ?? "silent"} (${b.recent_14d_count ?? 0} interactions in last 14d)`;
    default:
      return `${signal.key} at ${signal.score} (${signal.band})`;
  }
}

function deriveOpportunityReason(signal: SignalSnapshot): string {
  const b = signal.breakdown;
  switch (signal.key) {
    case "account_engagement_score":
      return `Account engagement ${signal.score}: ${b.total_interactions ?? 0} interactions across ${b.interactions_7d ?? 0}(7d), ${b.interactions_8_14d ?? 0}(14d)`;
    case "deal_momentum":
      return `Deal momentum ${signal.score}: ${b.direction ?? "unknown"} (ratio ${b.ratio ?? "?"})`;
    case "deal_stage_velocity":
      return `Stage changed ${b.days_since_last_change ?? "?"}d ago (${b.stage_changes ?? 0} changes total)`;
    case "intent_buying_activity":
      return `Buying activity ${signal.score}: ${b.weighted_total ?? 0} weighted intent points from ${b.total_interactions ?? 0} interactions`;
    case "intent_deal_progression":
      return `Deal progression ${signal.score}: velocity=${b.velocity_component ?? 0}, momentum=${b.momentum_component ?? 0}, buying=${b.buying_component ?? 0}`;
    case "contact_engagement":
      return `Contact engagement ${signal.score}: ${b.total_interactions ?? 0} interactions across ${b.distinct_channels ?? 0} channels`;
    default:
      return `${signal.key} at ${signal.score} (${signal.band})`;
  }
}

// ─── Helper: Fetch signals for multiple entities ────────────

async function getSignalsByEntities(
  supabase: SupabaseClient,
  entityType: SignalEntityType,
  entityIds: string[]
): Promise<Map<string, SignalRow[]>> {
  if (entityIds.length === 0) return new Map();

  const { data, error } = await t(supabase)
    .from("signals")
    .select("*")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds);

  if (error) {
    console.error(`[agent-queries] getSignalsByEntities error:`, error.message);
    return new Map();
  }

  const map = new Map<string, SignalRow[]>();
  for (const row of (data || []) as SignalRow[]) {
    const existing = map.get(row.entity_id) || [];
    existing.push(row);
    map.set(row.entity_id, existing);
  }
  return map;
}

// ================================================================
// getAccountBrief
// ================================================================

export async function getAccountBrief(
  supabase: SupabaseClient,
  accountId: string
): Promise<AccountBrief | null> {
  const queriedAt = new Date().toISOString();

  // 1. Fetch account from public.accounts
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, company_name, industry, website, employee_count, estimated_revenue")
    .eq("id", accountId)
    .single();

  if (accountErr || !account) {
    console.error(`[agent-queries] Account not found: ${accountId}`, accountErr?.message);
    return null;
  }

  // 2. Fetch all signals for this account
  const { data: signalRows, error: sigErr } = await t(supabase)
    .from("signals")
    .select("*")
    .eq("entity_type", "account")
    .eq("entity_id", accountId);

  if (sigErr) {
    console.error(`[agent-queries] Signals fetch error:`, sigErr.message);
  }

  const accountSignals = ((signalRows || []) as SignalRow[]).map(toSnapshot);

  // 3. Fetch related deals
  const { data: dealRows, error: dealErr } = await supabase
    .from("deals")
    .select("id, deal_name, amount, deal_stage, probability, deal_health")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (dealErr) {
    console.error(`[agent-queries] Deals fetch error:`, dealErr.message);
  }

  const dealIds = (dealRows || []).map((d) => d.id as string);
  const dealSignalMap = await getSignalsByEntities(supabase, "deal", dealIds);

  const deals: DealSummary[] = (dealRows || []).map((d) => ({
    dealId: d.id as string,
    dealName: d.deal_name as string,
    amount: d.amount as number | null,
    dealStage: d.deal_stage as string,
    probability: d.probability as number | null,
    dealHealth: d.deal_health as string | null,
    signals: (dealSignalMap.get(d.id as string) || []).map(toSnapshot),
  }));

  // 4. Fetch related contacts (from interactions)
  const { data: contactIxRows } = await t(supabase)
    .from("interactions")
    .select("contact_id")
    .eq("account_id", accountId)
    .not("contact_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const contactIds = [
    ...new Set((contactIxRows || []).map((r) => r.contact_id as string)),
  ].slice(0, 20);

  // Fetch contact info from public.leads
  let contacts: ContactSummary[] = [];
  if (contactIds.length > 0) {
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, position")
      .in("id", contactIds);

    const contactSignalMap = await getSignalsByEntities(
      supabase,
      "contact",
      contactIds
    );

    contacts = (leadRows || []).map((l) => ({
      contactId: l.id as string,
      name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Unknown",
      email: l.email as string | null,
      position: l.position as string | null,
      signals: (contactSignalMap.get(l.id as string) || []).map(toSnapshot),
    }));
  }

  // 5. Derive risks and opportunities
  // Collect ALL signals across the account + its deals + its contacts
  const allSignals: (SignalSnapshot & {
    entityType: SignalEntityType;
    entityId: string;
    entityLabel: string;
  })[] = [];

  for (const s of accountSignals) {
    allSignals.push({
      ...s,
      entityType: "account",
      entityId: accountId,
      entityLabel: account.company_name as string,
    });
  }
  for (const deal of deals) {
    for (const s of deal.signals) {
      allSignals.push({
        ...s,
        entityType: "deal",
        entityId: deal.dealId,
        entityLabel: deal.dealName,
      });
    }
  }
  for (const contact of contacts) {
    for (const s of contact.signals) {
      allSignals.push({
        ...s,
        entityType: "contact",
        entityId: contact.contactId,
        entityLabel: contact.name,
      });
    }
  }

  // Risks: risk signals with high scores OR engagement signals with very low scores
  const topRisks: RiskItem[] = allSignals
    .filter((s) => {
      if (RISK_SIGNAL_KEYS.has(s.key)) return s.score >= 61;
      // Low engagement = risk
      if (OPPORTUNITY_SIGNAL_KEYS.has(s.key)) return s.score <= 10 && s.interactionCount > 0;
      return false;
    })
    .sort((a, b) => {
      // Risk signals: higher = worse. Engagement signals: lower = worse.
      if (RISK_SIGNAL_KEYS.has(a.key) && RISK_SIGNAL_KEYS.has(b.key))
        return b.score - a.score;
      return a.score - b.score;
    })
    .slice(0, 5)
    .map((s) => ({
      signalKey: s.key,
      entityType: s.entityType,
      entityId: s.entityId,
      entityLabel: s.entityLabel,
      score: s.score,
      band: s.band,
      reason: RISK_SIGNAL_KEYS.has(s.key)
        ? deriveRiskReason(s)
        : `Low ${s.key}: score ${s.score}`,
    }));

  // Opportunities: high-scoring engagement/intent signals
  const topOpportunities: OpportunityItem[] = allSignals
    .filter(
      (s) => OPPORTUNITY_SIGNAL_KEYS.has(s.key) && s.score >= 61
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({
      signalKey: s.key,
      entityType: s.entityType,
      entityId: s.entityId,
      entityLabel: s.entityLabel,
      score: s.score,
      band: s.band,
      reason: deriveOpportunityReason(s),
    }));

  return {
    accountId,
    companyName: account.company_name as string,
    industry: account.industry as string | null,
    website: account.website as string | null,
    employeeCount: account.employee_count as string | null,
    estimatedRevenue: account.estimated_revenue as string | null,
    signals: accountSignals,
    overallHealth: worstBand(accountSignals),
    averageScore: averageScore(accountSignals),
    deals,
    contacts,
    topRisks,
    topOpportunities,
    queriedAt,
  };
}

// ================================================================
// getDealBrief
// ================================================================

export async function getDealBrief(
  supabase: SupabaseClient,
  dealId: string
): Promise<DealBrief | null> {
  const queriedAt = new Date().toISOString();

  // 1. Fetch deal from public.deals
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select(
      "id, deal_name, amount, deal_stage, probability, deal_health, next_action, next_action_date, account_id, lead_id"
    )
    .eq("id", dealId)
    .single();

  if (dealErr || !deal) {
    console.error(`[agent-queries] Deal not found: ${dealId}`, dealErr?.message);
    return null;
  }

  // 2. Fetch deal signals
  const { data: dealSignalRows } = await t(supabase)
    .from("signals")
    .select("*")
    .eq("entity_type", "deal")
    .eq("entity_id", dealId);

  const dealSignals = ((dealSignalRows || []) as SignalRow[]).map(toSnapshot);

  // 3. Fetch parent account
  let accountBrief: DealBrief["account"] = null;
  const accountId = deal.account_id as string | null;
  if (accountId) {
    const { data: acct } = await supabase
      .from("accounts")
      .select("id, company_name, industry")
      .eq("id", accountId)
      .single();

    if (acct) {
      const { data: acctSignalRows } = await t(supabase)
        .from("signals")
        .select("*")
        .eq("entity_type", "account")
        .eq("entity_id", accountId);

      const acctSignals = ((acctSignalRows || []) as SignalRow[]).map(toSnapshot);

      accountBrief = {
        accountId: acct.id as string,
        companyName: acct.company_name as string,
        industry: acct.industry as string | null,
        signals: acctSignals,
        overallHealth: worstBand(acctSignals),
      };
    }
  }

  // 4. Fetch related contacts (from deal interactions)
  const { data: contactIxRows } = await t(supabase)
    .from("interactions")
    .select("contact_id")
    .eq("deal_id", dealId)
    .not("contact_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(100);

  const contactIds = [
    ...new Set((contactIxRows || []).map((r) => r.contact_id as string)),
  ].slice(0, 10);

  let contacts: ContactSummary[] = [];
  if (contactIds.length > 0) {
    const { data: leadRows } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, position")
      .in("id", contactIds);

    const contactSignalMap = await getSignalsByEntities(
      supabase,
      "contact",
      contactIds
    );

    contacts = (leadRows || []).map((l) => ({
      contactId: l.id as string,
      name: `${l.first_name || ""} ${l.last_name || ""}`.trim() || "Unknown",
      email: l.email as string | null,
      position: l.position as string | null,
      signals: (contactSignalMap.get(l.id as string) || []).map(toSnapshot),
    }));
  }

  // 5. Derive risk level from deal_risk signal
  const riskSignal = dealSignals.find((s) => s.key === "deal_risk");
  const riskLevel: ScoreBand = riskSignal?.band ?? "inactive";

  // 6. Derive momentum direction from deal_momentum breakdown
  const momentumSignal = dealSignals.find((s) => s.key === "deal_momentum");
  let momentumDirection: DealBrief["momentumDirection"] = "unknown";
  if (momentumSignal) {
    const dir = momentumSignal.breakdown.direction;
    if (dir === "accelerating" || dir === "decelerating" || dir === "steady") {
      momentumDirection = dir;
    }
  }

  // 7. Top risks for this deal
  const topRisks: RiskItem[] = dealSignals
    .filter(
      (s) =>
        (RISK_SIGNAL_KEYS.has(s.key) && s.score >= 61) ||
        (OPPORTUNITY_SIGNAL_KEYS.has(s.key) && s.score <= 10 && s.interactionCount > 0)
    )
    .sort((a, b) =>
      RISK_SIGNAL_KEYS.has(a.key) ? b.score - a.score : a.score - b.score
    )
    .slice(0, 5)
    .map((s) => ({
      signalKey: s.key,
      entityType: "deal" as SignalEntityType,
      entityId: dealId,
      entityLabel: deal.deal_name as string,
      score: s.score,
      band: s.band,
      reason: RISK_SIGNAL_KEYS.has(s.key)
        ? deriveRiskReason(s)
        : `Low ${s.key}: score ${s.score}`,
    }));

  return {
    dealId,
    dealName: deal.deal_name as string,
    amount: deal.amount as number | null,
    dealStage: deal.deal_stage as string,
    probability: deal.probability as number | null,
    dealHealth: deal.deal_health as string | null,
    nextAction: deal.next_action as string | null,
    nextActionDate: deal.next_action_date as string | null,
    signals: dealSignals,
    riskLevel,
    momentumDirection,
    account: accountBrief,
    contacts,
    topRisks,
    queriedAt,
  };
}

// ================================================================
// getSignalPriorityQueue
// ================================================================

export interface PriorityQueueOptions {
  /** Filter by entity type */
  entityTypes?: SignalEntityType[];
  /** Filter by specific signal keys */
  signalKeys?: SignalKey[];
  /** Minimum score band to include (default: "low") */
  minBand?: ScoreBand;
  /** Max items to return (default: 25) */
  limit?: number;
}

export async function getSignalPriorityQueue(
  supabase: SupabaseClient,
  options: PriorityQueueOptions = {}
): Promise<SignalPriorityQueueResult> {
  const queriedAt = new Date().toISOString();
  const limit = options.limit ?? 25;
  const minBandSeverity = BAND_SEVERITY[options.minBand ?? "low"];

  // 1. Fetch all signals, ordered by score desc
  let query = t(supabase)
    .from("signals")
    .select("*")
    .order("score", { ascending: false })
    .limit(200); // over-fetch for filtering

  if (options.entityTypes && options.entityTypes.length > 0) {
    query = query.in("entity_type", options.entityTypes);
  }
  if (options.signalKeys && options.signalKeys.length > 0) {
    query = query.in("signal_key", options.signalKeys);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[agent-queries] Priority queue fetch error:`, error.message);
    return { items: [], totalSignals: 0, criticalCount: 0, highCount: 0, queriedAt };
  }

  const allSignals = (data || []) as SignalRow[];

  // 2. Filter by minimum band severity
  const filtered = allSignals.filter(
    (s) => BAND_SEVERITY[s.score_band] >= minBandSeverity
  );

  // 3. Collect unique entity IDs for label resolution
  const accountIds = new Set<string>();
  const dealIds = new Set<string>();
  const contactIds = new Set<string>();

  for (const s of filtered) {
    if (s.entity_type === "account") accountIds.add(s.entity_id);
    else if (s.entity_type === "deal") dealIds.add(s.entity_id);
    else if (s.entity_type === "contact") contactIds.add(s.entity_id);
  }

  // 4. Resolve entity labels in parallel
  const [accountLabels, dealLabels, contactLabels] = await Promise.all([
    resolveAccountLabels(supabase, [...accountIds]),
    resolveDealLabels(supabase, [...dealIds]),
    resolveContactLabels(supabase, [...contactIds]),
  ]);

  // 5. Build priority queue — sort by urgency then score
  const items: PriorityQueueItem[] = filtered
    .map((s) => {
      const snapshot = toSnapshot(s);

      // Determine urgency based on signal type and band
      let urgency: PriorityQueueItem["urgency"];
      if (RISK_SIGNAL_KEYS.has(s.signal_key)) {
        // Risk signals: high score = critical urgency
        if (s.score >= 81) urgency = "critical";
        else if (s.score >= 61) urgency = "high";
        else if (s.score >= 31) urgency = "medium";
        else urgency = "low";
      } else {
        // Engagement/intent signals: use band directly
        if (s.score_band === "critical") urgency = "critical";
        else if (s.score_band === "high") urgency = "high";
        else if (s.score_band === "medium") urgency = "medium";
        else urgency = "low";
      }

      // Resolve label
      let entityLabel = s.entity_id;
      if (s.entity_type === "account") entityLabel = accountLabels.get(s.entity_id) ?? s.entity_id;
      else if (s.entity_type === "deal") entityLabel = dealLabels.get(s.entity_id) ?? s.entity_id;
      else if (s.entity_type === "contact") entityLabel = contactLabels.get(s.entity_id) ?? s.entity_id;

      // Derive reason
      const reason = RISK_SIGNAL_KEYS.has(s.signal_key)
        ? deriveRiskReason(snapshot)
        : deriveOpportunityReason(snapshot);

      return {
        entityType: s.entity_type,
        entityId: s.entity_id,
        entityLabel,
        signalKey: s.signal_key,
        score: s.score,
        previousScore: s.previous_score,
        band: s.score_band,
        trend: snapshot.trend,
        urgency,
        reason,
      };
    })
    .sort((a, b) => {
      // Sort by urgency tier first, then by score
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgDiff !== 0) return urgDiff;
      return b.score - a.score;
    })
    .slice(0, limit);

  const criticalCount = items.filter((i) => i.urgency === "critical").length;
  const highCount = items.filter((i) => i.urgency === "high").length;

  return {
    items,
    totalSignals: allSignals.length,
    criticalCount,
    highCount,
    queriedAt,
  };
}

// ─── Label Resolution Helpers ───────────────────────────────

async function resolveAccountLabels(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from("accounts")
    .select("id, company_name")
    .in("id", ids);

  for (const row of data || []) {
    map.set(row.id as string, row.company_name as string);
  }
  return map;
}

async function resolveDealLabels(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from("deals")
    .select("id, deal_name")
    .in("id", ids);

  for (const row of data || []) {
    map.set(row.id as string, row.deal_name as string);
  }
  return map;
}

async function resolveContactLabels(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from("leads")
    .select("id, first_name, last_name")
    .in("id", ids);

  for (const row of data || []) {
    const name =
      `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Unknown";
    map.set(row.id as string, name);
  }
  return map;
}
