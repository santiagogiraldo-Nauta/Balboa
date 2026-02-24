import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Log the webhook for now
    console.log("[Aircall Webhook]", payload.event, payload);

    // Future: process call completion events
    // - Match caller to lead by phone number
    // - Auto-log call in lead's callLogs
    // - Trigger follow-up action generation
    // - Update lead.lastOutreachMethod to "call"
    // - Create touchpoint event in touchpointTimeline

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Aircall webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
