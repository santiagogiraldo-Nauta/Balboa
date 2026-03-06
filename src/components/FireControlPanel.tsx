"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Flame, Zap, Brain, RefreshCw, CheckCircle, Clock,
  AlertTriangle, XCircle, ChevronDown, ChevronRight,
  Activity, BarChart3, MessageSquare, Shield, Plus, Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

interface FireAction {
  id: string;
  user_id: string;
  lead_id: string | null;
  trigger_type: string;
  action_type: string;
  channel: string | null;
  status: string;
  reply_classification: string | null;
  reply_confidence: number | null;
  template_key: string | null;
  scheduled_for: string | null;
  executed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface BranchingRule {
  id: string;
  name: string;
  trigger_event: string;
  trigger_sentiment: string | null;
  trigger_classification: string | null;
  trigger_silence_days: number | null;
  action_type: string;
  action_channel: string | null;
  action_snooze_days: number | null;
  priority: number;
  is_active: boolean;
  is_global: boolean;
  sequence_id: string | null;
}

interface FireStats {
  totalActions: number;
  byStatus: Record<string, number>;
  byActionType: Record<string, number>;
  byTriggerType: Record<string, number>;
  classifications: number;
  classificationBreakdown: Record<string, number>;
}

interface FireControlPanelProps {
  userId: string | null;
}

// ─── Component ───────────────────────────────────────────────

export default function FireControlPanel({ userId }: FireControlPanelProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "rules" | "classifier">("dashboard");
  const [actions, setActions] = useState<FireAction[]>([]);
  const [rules, setRules] = useState<BranchingRule[]>([]);
  const [stats, setStats] = useState<FireStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [classifyInput, setClassifyInput] = useState({ subject: "", body: "" });
  const [classifyResult, setClassifyResult] = useState<Record<string, unknown> | null>(null);
  const [classifying, setClassifying] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [actionsRes, rulesRes, statsRes] = await Promise.all([
        fetch(`/api/fire/actions?userId=${userId}&limit=30`),
        fetch(`/api/fire/rules?userId=${userId}`),
        fetch(`/api/fire/stats?userId=${userId}`),
      ]);

      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setActions(data.actions || []);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error("[FireControlPanel] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Action Handlers ────────────────────────────────────────

  const handleCancelAction = async (actionId: string) => {
    try {
      await fetch("/api/fire/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, status: "cancelled" }),
      });
      setActions(prev => prev.map(a => a.id === actionId ? { ...a, status: "cancelled" } : a));
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!userId) return;
    try {
      await fetch(`/api/fire/rules?ruleId=${ruleId}&userId=${userId}`, {
        method: "DELETE",
      });
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch (err) {
      console.error("Delete rule error:", err);
    }
  };

  const handleClassify = async () => {
    if (!userId || !classifyInput.body) return;
    setClassifying(true);
    setClassifyResult(null);
    try {
      const res = await fetch("/api/fire/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subject: classifyInput.subject,
          bodyPreview: classifyInput.body,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setClassifyResult(data.classification);
      }
    } catch (err) {
      console.error("Classify error:", err);
    } finally {
      setClassifying(false);
    }
  };

  // ─── Helper Functions ───────────────────────────────────────

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case "executing": return <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case "completed": return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case "cancelled": return <XCircle className="w-3.5 h-3.5 text-gray-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const classificationColor = (c: string) => {
    switch (c) {
      case "interested": return "text-emerald-600 bg-emerald-50";
      case "objection": return "text-amber-600 bg-amber-50";
      case "not_now": return "text-blue-600 bg-blue-50";
      case "wrong_person": return "text-gray-600 bg-gray-100";
      case "auto_reply": return "text-gray-500 bg-gray-50";
      case "referral": return "text-purple-600 bg-purple-50";
      case "unsubscribe": return "text-red-600 bg-red-50";
      default: return "text-gray-600 bg-gray-50";
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #FF6B35, #FF8C42)" }}>
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--balboa-navy)" }}>
              Balboa Fire
            </h2>
            <p className="text-xs" style={{ color: "var(--balboa-text-muted)" }}>
              Autonomous outreach engine
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: loading ? "var(--balboa-card-bg)" : "var(--balboa-blue)",
            color: loading ? "var(--balboa-text-muted)" : "#fff",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            label="Actions Today"
            value={stats.totalActions}
            sub={`${stats.byStatus?.completed || 0} completed`}
          />
          <StatCard
            icon={<Brain className="w-4 h-4 text-purple-500" />}
            label="Classifications"
            value={stats.classifications}
            sub={`${Object.keys(stats.classificationBreakdown).length} types`}
          />
          <StatCard
            icon={<Activity className="w-4 h-4 text-blue-500" />}
            label="Pending"
            value={stats.byStatus?.pending || 0}
            sub={`${stats.byStatus?.executing || 0} executing`}
          />
          <StatCard
            icon={<Shield className="w-4 h-4 text-emerald-500" />}
            label="Rules Active"
            value={rules.filter(r => r.is_active).length}
            sub={`${rules.filter(r => r.is_global).length} global`}
          />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--balboa-card-bg)" }}>
        {(["dashboard", "rules", "classifier"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all"
            style={{
              background: activeTab === tab ? "#fff" : "transparent",
              color: activeTab === tab ? "var(--balboa-navy)" : "var(--balboa-text-muted)",
              boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {tab === "dashboard" && <><BarChart3 className="w-3.5 h-3.5 inline mr-1.5" />Actions Queue</>}
            {tab === "rules" && <><Zap className="w-3.5 h-3.5 inline mr-1.5" />Branching Rules</>}
            {tab === "classifier" && <><Brain className="w-3.5 h-3.5 inline mr-1.5" />Reply Classifier</>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" && (
        <div className="space-y-2">
          {actions.length === 0 ? (
            <EmptyState message="No fire actions yet. Actions will appear here when Fire triggers on inbound events." />
          ) : (
            actions.map(action => (
              <div
                key={action.id}
                className="rounded-lg border p-3 transition-all hover:shadow-sm cursor-pointer"
                style={{
                  background: "#fff",
                  borderColor: "var(--balboa-border)",
                }}
                onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {statusIcon(action.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: "var(--balboa-navy)" }}>
                          {action.action_type.replace(/_/g, " ")}
                        </span>
                        {action.channel && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{ background: "var(--balboa-card-bg)", color: "var(--balboa-text-muted)" }}>
                            {action.channel}
                          </span>
                        )}
                        {action.reply_classification && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${classificationColor(action.reply_classification)}`}>
                            {action.reply_classification}
                            {action.reply_confidence ? ` ${(action.reply_confidence * 100).toFixed(0)}%` : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--balboa-text-muted)" }}>
                        {action.trigger_type.replace(/_/g, " ")} &middot; {timeAgo(action.created_at)}
                        {action.template_key && ` \u00b7 template: ${action.template_key}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {action.status === "pending" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCancelAction(action.id); }}
                        className="text-[10px] px-2 py-1 rounded text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {expandedAction === action.id ? (
                      <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)" }} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--balboa-text-muted)" }} />
                    )}
                  </div>
                </div>

                {expandedAction === action.id && (
                  <div className="mt-3 pt-3 border-t text-[11px] space-y-1.5"
                    style={{ borderColor: "var(--balboa-border)", color: "var(--balboa-text-secondary)" }}>
                    <div><strong>Lead:</strong> {action.lead_id || "—"}</div>
                    {action.error_message && (
                      <div className="text-red-600"><strong>Error:</strong> {action.error_message}</div>
                    )}
                    {action.scheduled_for && (
                      <div><strong>Scheduled:</strong> {new Date(action.scheduled_for).toLocaleString()}</div>
                    )}
                    {action.executed_at && (
                      <div><strong>Executed:</strong> {new Date(action.executed_at).toLocaleString()}</div>
                    )}
                    {action.metadata && Object.keys(action.metadata).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-blue-600">View metadata</summary>
                        <pre className="mt-1 p-2 rounded text-[10px] overflow-x-auto"
                          style={{ background: "var(--balboa-card-bg)" }}>
                          {JSON.stringify(action.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <EmptyState message="No branching rules configured. Create rules to define how Fire responds to events." />
          ) : (
            rules.map(rule => (
              <div
                key={rule.id}
                className="rounded-lg border p-3"
                style={{ background: "#fff", borderColor: "var(--balboa-border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className={`w-3.5 h-3.5 ${rule.is_active ? "text-amber-500" : "text-gray-300"}`} />
                    <div>
                      <span className="text-xs font-semibold" style={{ color: "var(--balboa-navy)" }}>
                        {rule.name}
                      </span>
                      {rule.is_global && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          Global
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono" style={{ color: "var(--balboa-text-muted)" }}>
                      P{rule.priority}
                    </span>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: "var(--balboa-text-secondary)" }}>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--balboa-card-bg)" }}>
                    {rule.trigger_event}
                    {rule.trigger_sentiment ? ` + ${rule.trigger_sentiment}` : ""}
                    {rule.trigger_classification ? ` + ${rule.trigger_classification}` : ""}
                    {rule.trigger_silence_days ? ` (${rule.trigger_silence_days}d)` : ""}
                  </span>
                  <span style={{ color: "var(--balboa-text-muted)" }}>&rarr;</span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--balboa-card-bg)" }}>
                    {rule.action_type.replace(/_/g, " ")}
                    {rule.action_channel ? ` via ${rule.action_channel}` : ""}
                    {rule.action_snooze_days ? ` (${rule.action_snooze_days}d)` : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "classifier" && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4" style={{ background: "#fff", borderColor: "var(--balboa-border)" }}>
            <h3 className="text-xs font-semibold mb-3" style={{ color: "var(--balboa-navy)" }}>
              <Brain className="w-3.5 h-3.5 inline mr-1.5" />
              Test Reply Classifier
            </h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Email subject (optional)"
                value={classifyInput.subject}
                onChange={e => setClassifyInput(prev => ({ ...prev, subject: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-xs"
                style={{ borderColor: "var(--balboa-border)", background: "var(--balboa-card-bg)" }}
              />
              <textarea
                placeholder="Paste the reply body here..."
                value={classifyInput.body}
                onChange={e => setClassifyInput(prev => ({ ...prev, body: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border text-xs resize-none"
                style={{ borderColor: "var(--balboa-border)", background: "var(--balboa-card-bg)" }}
              />
              <button
                onClick={handleClassify}
                disabled={classifying || !classifyInput.body}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all"
                style={{
                  background: classifying ? "#999" : "var(--balboa-blue)",
                  opacity: !classifyInput.body ? 0.5 : 1,
                }}
              >
                {classifying ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Classifying...</>
                ) : (
                  <><MessageSquare className="w-3.5 h-3.5" />Classify Reply</>
                )}
              </button>
            </div>

            {classifyResult && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: "var(--balboa-card-bg)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${classificationColor(classifyResult.classification as string)}`}>
                    {(classifyResult.classification as string) || "unknown"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--balboa-text-muted)" }}>
                    {((classifyResult.confidence as number) * 100).toFixed(0)}% confidence
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#fff" }}>
                    via {classifyResult.classifiedBy as string}
                  </span>
                </div>
                {classifyResult.subClassification ? (
                  <p className="text-[11px]" style={{ color: "var(--balboa-text-secondary)" }}>
                    Sub: {String(classifyResult.subClassification)}
                  </p>
                ) : null}
                <p className="text-[11px] mt-1" style={{ color: "var(--balboa-text-secondary)" }}>
                  Routed: {classifyResult.routedAction as string}
                </p>
              </div>
            )}
          </div>

          {/* Classification Breakdown */}
          {stats?.classificationBreakdown && Object.keys(stats.classificationBreakdown).length > 0 && (
            <div className="rounded-lg border p-4" style={{ background: "#fff", borderColor: "var(--balboa-border)" }}>
              <h3 className="text-xs font-semibold mb-3" style={{ color: "var(--balboa-navy)" }}>
                Classification History
              </h3>
              <div className="space-y-1.5">
                {Object.entries(stats.classificationBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cls, count]) => (
                    <div key={cls} className="flex items-center justify-between">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${classificationColor(cls)}`}>
                        {cls}
                      </span>
                      <span className="text-[11px] font-mono" style={{ color: "var(--balboa-text-muted)" }}>
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "#fff", borderColor: "var(--balboa-border)" }}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[10px] font-medium" style={{ color: "var(--balboa-text-muted)" }}>
          {label}
        </span>
      </div>
      <div className="text-xl font-bold" style={{ color: "var(--balboa-navy)" }}>
        {value}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--balboa-text-muted)" }}>
        {sub}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 rounded-lg border border-dashed"
      style={{ borderColor: "var(--balboa-border)" }}>
      <Flame className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--balboa-text-muted)", opacity: 0.3 }} />
      <p className="text-xs" style={{ color: "var(--balboa-text-muted)" }}>
        {message}
      </p>
    </div>
  );
}
