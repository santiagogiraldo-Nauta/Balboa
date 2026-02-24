import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getFilterRules, createFilterRule, deleteFilterRule, toggleFilterRule } from "@/lib/db-linkedin";
import { createAuditEntry } from "@/lib/db-linkedin";

// GET: List all filter rules
export async function GET() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rules = await getFilterRules(supabase, user.id);

    return NextResponse.json({ rules, total: rules.length });
  } catch (error) {
    console.error("Filter rules GET error:", error);
    return NextResponse.json({ error: "Failed to fetch filter rules" }, { status: 500 });
  }
}

// POST: Create a new filter rule
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ruleType, ruleValue, classification } = await req.json();

    if (!ruleType || !ruleValue || !classification) {
      return NextResponse.json({ error: "Missing ruleType, ruleValue, or classification" }, { status: 400 });
    }

    const validTypes = ["keyword", "participant", "relationship", "pattern"];
    if (!validTypes.includes(ruleType)) {
      return NextResponse.json({ error: `Invalid ruleType. Use: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const validClassifications = ["professional", "personal", "unclassified"];
    if (!validClassifications.includes(classification)) {
      return NextResponse.json({ error: `Invalid classification. Use: ${validClassifications.join(", ")}` }, { status: 400 });
    }

    const rule = await createFilterRule(supabase, user.id, { ruleType, ruleValue, classification });

    if (!rule) {
      return NextResponse.json({ error: "Failed to create filter rule" }, { status: 500 });
    }

    // Audit log
    await createAuditEntry(supabase, user.id, {
      action: "rule_created",
      method: "manual",
      reason: `Created ${ruleType} rule: "${ruleValue}" → ${classification}`,
      metadata: { ruleId: rule.id, ruleType, ruleValue, classification },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Filter rules POST error:", error);
    return NextResponse.json({ error: "Failed to create filter rule" }, { status: 500 });
  }
}

// DELETE: Remove a filter rule
export async function DELETE(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ruleId } = await req.json();

    if (!ruleId) {
      return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });
    }

    // Get rule info before deleting for audit
    const rules = await getFilterRules(supabase, user.id);
    const rule = rules.find(r => r.id === ruleId);

    const success = await deleteFilterRule(supabase, user.id, ruleId);

    if (!success) {
      return NextResponse.json({ error: "Failed to delete filter rule" }, { status: 500 });
    }

    // Audit log
    if (rule) {
      await createAuditEntry(supabase, user.id, {
        action: "rule_deleted",
        method: "manual",
        reason: `Deleted ${rule.ruleType} rule: "${rule.ruleValue}"`,
        metadata: { ruleId, ruleType: rule.ruleType, ruleValue: rule.ruleValue },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Filter rules DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete filter rule" }, { status: 500 });
  }
}

// PATCH: Toggle a filter rule active/inactive
export async function PATCH(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ruleId, isActive } = await req.json();

    if (!ruleId || isActive === undefined) {
      return NextResponse.json({ error: "Missing ruleId or isActive" }, { status: 400 });
    }

    const success = await toggleFilterRule(supabase, user.id, ruleId, isActive);

    if (!success) {
      return NextResponse.json({ error: "Failed to toggle filter rule" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isActive });
  } catch (error) {
    console.error("Filter rules PATCH error:", error);
    return NextResponse.json({ error: "Failed to toggle filter rule" }, { status: 500 });
  }
}
