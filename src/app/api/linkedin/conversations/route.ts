import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import {
  getConversations,
  createConversation,
  updateConversationClassification,
  toggleConversationExclusion,
} from "@/lib/db-linkedin";
import { createAuditEntry } from "@/lib/db-linkedin";
import { getFilterRules } from "@/lib/db-linkedin";
import { getLeads } from "@/lib/db";
import { classifyConversation } from "@/lib/linkedin-classifier";
import type { ConversationClassification } from "@/lib/types-linkedin";

// GET: List conversations (optional ?classification=professional|personal|unclassified)
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const classification = url.searchParams.get("classification") as ConversationClassification | null;

    const conversations = await getConversations(supabase, user.id, classification || undefined);

    return NextResponse.json({ conversations, total: conversations.length });
  } catch (error) {
    console.error("LinkedIn conversations GET error:", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

// POST: Import a new conversation (auto-classifies it)
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { linkedinThreadId, participantName, participantUrl, lastMessagePreview, lastMessageDate, leadId } = body;

    if (!linkedinThreadId || !participantName) {
      return NextResponse.json({ error: "Missing linkedinThreadId or participantName" }, { status: 400 });
    }

    // Auto-classify using the classifier engine
    const rules = await getFilterRules(supabase, user.id);
    const leads = await getLeads(supabase, user.id);

    // Create a temporary conversation object for classification
    const tempConv = {
      id: "temp",
      userId: user.id,
      linkedinThreadId,
      participantName,
      participantUrl,
      classification: "unclassified" as ConversationClassification,
      isExcluded: false,
      lastMessagePreview,
      lastMessageDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const classResult = classifyConversation(tempConv, rules, leads);

    // Create the conversation with classification result
    const conversation = await createConversation(supabase, user.id, {
      linkedinThreadId,
      participantName,
      participantUrl,
      classification: classResult.classification,
      classificationMethod: classResult.method,
      classificationReason: classResult.reasons.join("; "),
      classificationConfidence: classResult.confidence,
      lastMessagePreview,
      lastMessageDate,
      leadId,
    });

    if (!conversation) {
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    // Log audit entry
    await createAuditEntry(supabase, user.id, {
      conversationId: conversation.id,
      action: "classified",
      newClassification: classResult.classification,
      method: classResult.method,
      reason: classResult.reasons.join("; "),
    });

    return NextResponse.json({
      conversation,
      classification: classResult,
    });
  } catch (error) {
    console.error("LinkedIn conversations POST error:", error);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}

// PATCH: Reclassify or toggle exclusion
export async function PATCH(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, action, classification, reason } = await req.json();

    if (!conversationId || !action) {
      return NextResponse.json({ error: "Missing conversationId or action" }, { status: 400 });
    }

    if (action === "reclassify") {
      if (!classification) {
        return NextResponse.json({ error: "Missing classification for reclassify action" }, { status: 400 });
      }

      // Get current conversation for audit
      const convs = await getConversations(supabase, user.id);
      const current = convs.find(c => c.id === conversationId);
      const previousClassification = current?.classification;

      const updated = await updateConversationClassification(
        supabase, user.id, conversationId,
        classification, "manual", reason
      );

      if (!updated) {
        return NextResponse.json({ error: "Failed to reclassify conversation" }, { status: 500 });
      }

      // Log audit entry
      await createAuditEntry(supabase, user.id, {
        conversationId,
        action: "reclassified",
        previousClassification,
        newClassification: classification,
        method: "manual",
        reason,
      });

      return NextResponse.json({ conversation: updated });
    }

    if (action === "exclude" || action === "include") {
      const isExcluded = action === "exclude";
      const success = await toggleConversationExclusion(supabase, user.id, conversationId, isExcluded);

      if (!success) {
        return NextResponse.json({ error: "Failed to toggle exclusion" }, { status: 500 });
      }

      // Log audit entry
      await createAuditEntry(supabase, user.id, {
        conversationId,
        action: isExcluded ? "excluded" : "included",
        method: "manual",
        reason,
      });

      return NextResponse.json({ success: true, isExcluded });
    }

    return NextResponse.json({ error: "Invalid action. Use: reclassify, exclude, include" }, { status: 400 });
  } catch (error) {
    console.error("LinkedIn conversations PATCH error:", error);
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
  }
}
