import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { upsertSequence } from "@/lib/db-sequences";
import { insertSequenceEnrollment } from "@/lib/db-touchpoints";
import { trackEvent } from "@/lib/tracking";

/**
 * POST /api/rocket/import
 *
 * Imports Rocket sequence export data into Balboa.
 * Now with: import history, quality scoring, event tracking, field validation.
 *
 * Body: {
 *   leads: [...],
 *   sequence?: { name, description, steps },
 *   filename?: string,
 *   fileType?: string,
 *   columnMapping?: Record<string, string>,
 *   sourcePlatform?: string
 * }
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const body = await req.json();
    const leads = body.leads || [];
    const sequenceInfo = body.sequence;
    const filename = body.filename || "unknown.csv";
    const fileType = body.fileType || "csv";
    const columnMapping = body.columnMapping || {};
    const sourcePlatform = body.sourcePlatform || null;

    if (!leads.length) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    // ── Track import started ──────────────────────────────────────
    await trackEvent(supabase, user.id, {
      eventCategory: "lead",
      eventAction: "csv_imported",
      numericValue: leads.length,
      metadata: {
        phase: "started",
        filename,
        fileType,
        sourcePlatform,
        hasSequence: !!sequenceInfo,
      },
      source: "api",
    });

    console.log(`[Rocket Import] Importing ${leads.length} leads from ${filename}`);

    // ── Validate leads & compute quality metrics ─────────────────
    const validationErrors: string[] = [];
    const validLeads: typeof leads = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const email = (lead.email || "").toLowerCase().trim();
      const name = lead.first_name || lead.firstName || lead.name || "";
      const linkedin = lead.linkedin_url || lead.linkedinUrl || "";

      // Must have at least email OR linkedin URL OR name+company
      if (!email && !linkedin && !(name && (lead.company || ""))) {
        validationErrors.push(
          `Row ${i + 1}: Skipped — no email, LinkedIn URL, or name+company`
        );
        continue;
      }

      validLeads.push(lead);
    }

    // Quality score calculation
    const qualityScore = computeQualityScore(validLeads);

    // ── Create sequence record if provided ────────────────────────
    let sequenceId: string | null = null;
    let sequenceName: string | null = null;
    if (sequenceInfo) {
      const seq = await upsertSequence(supabase, {
        user_id: user.id,
        external_id: `rocket_${Date.now()}`,
        source: "rocket",
        name: sequenceInfo.name || `Rocket Import ${new Date().toISOString().split("T")[0]}`,
        description: sequenceInfo.description || null,
        status: "active",
        total_steps: sequenceInfo.steps?.length || 13,
        steps: sequenceInfo.steps || generateDefaultRocketSteps(),
        stats: { enrolled: validLeads.length },
        synced_at: new Date().toISOString(),
      });
      sequenceId = seq?.id || null;
      sequenceName = seq?.name || sequenceInfo.name || null;
    }

    // ── Import each valid lead ────────────────────────────────────
    let created = 0;
    let updated = 0;
    let enrolled = 0;
    const importErrors: string[] = [];
    const importedLeadIds: string[] = [];

    for (const lead of validLeads) {
      try {
        const email = (lead.email || "").toLowerCase().trim();
        const firstName = lead.first_name || lead.firstName || "";
        const lastName = lead.last_name || lead.lastName || "";
        const company = lead.company || "";
        const position = lead.title || lead.position || "";
        const linkedinUrl = lead.linkedin_url || lead.linkedinUrl || null;
        const phone = lead.phone || null;

        // SP/BC classification
        const spCategory = lead.sp_category || lead.strategicPriority || null;
        const bcCategory = lead.bc_category || lead.businessChallenge || null;
        const segment = lead.segment || null;

        // ICP score
        const icpRaw = lead.icp_score || lead.icpScore || 0;
        const icpOverall = typeof icpRaw === "number" ? icpRaw : parseInt(icpRaw) || 0;
        const tier = icpOverall >= 70 ? "hot" : icpOverall >= 40 ? "warm" : "cold";

        // Check if lead already exists
        let existingId: string | null = null;
        if (email) {
          const { data: existing } = await supabase
            .from("leads")
            .select("id")
            .eq("email", email)
            .eq("user_id", user.id)
            .single();
          existingId = existing?.id || null;
        }

        // Also check by LinkedIn URL if no email match
        if (!existingId && linkedinUrl) {
          const { data: existing } = await supabase
            .from("leads")
            .select("id")
            .eq("linkedin_url", linkedinUrl)
            .eq("user_id", user.id)
            .single();
          existingId = existing?.id || null;
        }

        const leadData = {
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          company,
          position,
          linkedin_url: linkedinUrl,
          linkedin_stage: "not_connected",
          icp_score: {
            overall: icpOverall,
            companyFit: lead.company_fit || Math.round(icpOverall * 0.4),
            roleFit: lead.role_fit || Math.round(icpOverall * 0.3),
            industryFit: lead.industry_fit || Math.round(icpOverall * 0.3),
            signals: [
              spCategory ? `SP: ${spCategory}` : null,
              bcCategory ? `BC: ${bcCategory}` : null,
              segment ? `Segment: ${segment}` : null,
            ].filter(Boolean),
            tier,
          },
          company_intel: {
            industry: lead.industry || "",
            estimatedRevenue: lead.revenue || "",
            employeeCount: lead.employee_count || "",
            techStack: lead.tech_stack || [],
            recentNews: [],
            balboaFitReason: spCategory ? `Strategic Priority: ${spCategory}` : "",
            painPoints: bcCategory ? [bcCategory] : [],
          },
          draft_messages: [],
          contact_history: [],
          channels: {
            linkedin: !!linkedinUrl,
            email: !!email,
            phone: !!phone,
            linkedinConnected: false,
            emailVerified: !!email,
          },
          source: "rocket",
          raw_data: {
            contactStatus: "not_contacted",
            rocket_import: true,
            sp_category: spCategory,
            bc_category: bcCategory,
            segment,
            phone,
            personalization: {
              signal: lead.signal || null,
              metric: lead.metric || null,
              talking_point: lead.talking_point || null,
            },
            imported_at: new Date().toISOString(),
            import_filename: filename,
            source_platform: sourcePlatform,
          },
        };

        if (existingId) {
          await supabase
            .from("leads")
            .update(leadData)
            .eq("id", existingId);
          updated++;
          importedLeadIds.push(existingId);
        } else {
          const { data: newLead } = await supabase
            .from("leads")
            .insert([leadData])
            .select("id")
            .single();
          existingId = newLead?.id || null;
          if (existingId) importedLeadIds.push(existingId);
          created++;
        }

        // Enroll in sequence if we have one
        if (sequenceId && existingId) {
          await insertSequenceEnrollment(supabase, {
            user_id: user.id,
            lead_id: existingId,
            sequence_id: sequenceId,
            sequence_name: sequenceName || "Rocket Sequence",
            sequence_source: "rocket",
            current_step: 1,
            total_steps: sequenceInfo?.steps?.length || 13,
            status: "active",
            last_step_at: null,
            completed_at: null,
            metadata: {
              sp_category: spCategory,
              bc_category: bcCategory,
              segment,
            },
          });
          enrolled++;
        }
      } catch (leadError) {
        importErrors.push(`Error importing ${lead.email || "unknown"}: ${leadError}`);
      }
    }

    // ── Combine all errors ────────────────────────────────────────
    const allErrors = [...validationErrors, ...importErrors];
    const durationMs = Date.now() - startTime;

    // ── Save import history record ────────────────────────────────
    const { data: importRecord } = await supabase
      .from("rocket_imports")
      .insert([{
        user_id: user.id,
        filename,
        file_type: fileType,
        total_rows: leads.length,
        created_count: created,
        updated_count: updated,
        error_count: allErrors.length,
        enrolled_count: enrolled,
        sequence_id: sequenceId,
        sequence_name: sequenceName,
        quality_score: qualityScore,
        column_mapping: columnMapping,
        error_details: allErrors.slice(0, 50),
        enrichment_status: "pending",
        enriched_count: 0,
        source_platform: sourcePlatform,
        duration_ms: durationMs,
      }])
      .select("id")
      .single();

    // ── Track import completed ────────────────────────────────────
    await trackEvent(supabase, user.id, {
      eventCategory: "lead",
      eventAction: "csv_imported",
      numericValue: created + updated,
      metadata: {
        phase: "completed",
        importId: importRecord?.id,
        filename,
        totalRows: leads.length,
        created,
        updated,
        enrolled,
        errors: allErrors.length,
        skipped: validationErrors.length,
        durationMs,
        qualityScore: qualityScore.overall,
        sourcePlatform,
        hasSequence: !!sequenceInfo,
      },
      source: "api",
    });

    console.log(
      `[Rocket Import] Done in ${durationMs}ms — Created: ${created}, Updated: ${updated}, Enrolled: ${enrolled}, Errors: ${allErrors.length}, Quality: ${qualityScore.overall}%`
    );

    return NextResponse.json({
      success: true,
      summary: {
        total: leads.length,
        valid: validLeads.length,
        skipped: validationErrors.length,
        created,
        updated,
        enrolled,
        sequenceId,
        sequenceName,
        errors: allErrors.length,
        durationMs,
        qualityScore,
        importId: importRecord?.id || null,
      },
      errors: allErrors.length > 0 ? allErrors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error("[Rocket Import] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}

// ─── Quality Score Calculator ─────────────────────────────────────

function computeQualityScore(leads: Record<string, unknown>[]) {
  if (leads.length === 0) {
    return { overall: 0, pctWithEmail: 0, pctWithCompany: 0, pctWithLinkedin: 0, pctWithClassification: 0, pctWithPhone: 0 };
  }

  let withEmail = 0;
  let withCompany = 0;
  let withLinkedin = 0;
  let withClassification = 0;
  let withPhone = 0;

  for (const lead of leads) {
    if ((lead.email as string || "").trim()) withEmail++;
    if ((lead.company as string || "").trim()) withCompany++;
    if ((lead.linkedin_url as string || lead.linkedinUrl as string || "").trim()) withLinkedin++;
    if ((lead.sp_category as string || lead.bc_category as string || lead.classification as string || "").trim()) withClassification++;
    if ((lead.phone as string || "").trim()) withPhone++;
  }

  const total = leads.length;
  const pctWithEmail = Math.round((withEmail / total) * 100);
  const pctWithCompany = Math.round((withCompany / total) * 100);
  const pctWithLinkedin = Math.round((withLinkedin / total) * 100);
  const pctWithClassification = Math.round((withClassification / total) * 100);
  const pctWithPhone = Math.round((withPhone / total) * 100);

  // Weighted overall: email 30%, company 25%, linkedin 20%, classification 15%, phone 10%
  const overall = Math.round(
    pctWithEmail * 0.3 +
    pctWithCompany * 0.25 +
    pctWithLinkedin * 0.2 +
    pctWithClassification * 0.15 +
    pctWithPhone * 0.1
  );

  return { overall, pctWithEmail, pctWithCompany, pctWithLinkedin, pctWithClassification, pctWithPhone };
}

// ─── Default Rocket 13-Touch Sequence Steps ──────────────────────

function generateDefaultRocketSteps() {
  return [
    { step_number: 1, channel: "email", type: "initial_email", delay_days: 0, subject: "Initial outreach" },
    { step_number: 2, channel: "call", type: "intro_call", delay_days: 1 },
    { step_number: 3, channel: "email", type: "follow_up_1", delay_days: 3, subject: "Follow-up" },
    { step_number: 4, channel: "call", type: "follow_up_call", delay_days: 4 },
    { step_number: 5, channel: "call", type: "persistence_call", delay_days: 6 },
    { step_number: 6, channel: "email", type: "value_email", delay_days: 8, subject: "Value share" },
    { step_number: 7, channel: "call", type: "value_call", delay_days: 9 },
    { step_number: 8, channel: "call", type: "check_in_call", delay_days: 11 },
    { step_number: 9, channel: "email", type: "case_study", delay_days: 14, subject: "Case study" },
    { step_number: 10, channel: "call", type: "case_study_call", delay_days: 15 },
    { step_number: 11, channel: "linkedin", type: "linkedin_connect", delay_days: 17 },
    { step_number: 12, channel: "call", type: "final_call", delay_days: 19 },
    { step_number: 13, channel: "email", type: "breakup_email", delay_days: 22, subject: "Final follow-up" },
  ];
}
