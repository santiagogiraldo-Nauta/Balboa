import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { upsertSequence } from "@/lib/db-sequences";
import { insertSequenceEnrollment } from "@/lib/db-touchpoints";

/**
 * POST /api/rocket/import
 *
 * Imports Rocket sequence export data into Balboa.
 *
 * Rocket exports contain:
 * - Lead info (name, email, company, title, LinkedIn)
 * - SP/BC classification (Strategic Priority / Business Challenge)
 * - ICP scoring data
 * - Sequence assignment (which 13-touch sequence they belong to)
 * - Personalization data (signals, metrics, talking points)
 *
 * Body: { leads: [...], sequence?: { name, description, steps } }
 *
 * CSV columns expected:
 * first_name, last_name, email, company, title, linkedin_url,
 * sp_category, bc_category, icp_score, segment,
 * sequence_name, phone, industry, revenue, employee_count
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const body = await req.json();
    const leads = body.leads || [];
    const sequenceInfo = body.sequence;

    if (!leads.length) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    console.log(`[Rocket Import] Importing ${leads.length} leads`);

    // 1. Create the sequence record if provided
    let sequenceId: string | null = null;
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
        stats: { enrolled: leads.length },
        synced_at: new Date().toISOString(),
      });
      sequenceId = seq?.id || null;
    }

    // 2. Import each lead
    let created = 0;
    let updated = 0;
    let enrolled = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const email = (lead.email || "").toLowerCase().trim();
        const firstName = lead.first_name || lead.firstName || "";
        const lastName = lead.last_name || lead.lastName || "";
        const company = lead.company || "";
        const position = lead.title || lead.position || "";
        const linkedinUrl = lead.linkedin_url || lead.linkedinUrl || null;

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
            phone: lead.phone || null,
            personalization: {
              signal: lead.signal || null,
              metric: lead.metric || null,
              talking_point: lead.talking_point || null,
            },
            imported_at: new Date().toISOString(),
          },
        };

        if (existingId) {
          // Update existing lead, merge data
          await supabase
            .from("leads")
            .update(leadData)
            .eq("id", existingId);
          updated++;
        } else {
          // Create new lead
          const { data: newLead } = await supabase
            .from("leads")
            .insert([leadData])
            .select("id")
            .single();
          existingId = newLead?.id || null;
          created++;
        }

        // 3. Enroll in sequence if we have one
        if (sequenceId && existingId) {
          await insertSequenceEnrollment(supabase, {
            user_id: user.id,
            lead_id: existingId,
            sequence_id: sequenceId,
            sequence_name: sequenceInfo?.name || "Rocket Sequence",
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
        errors.push(`Error importing ${lead.email || "unknown"}: ${leadError}`);
      }
    }

    console.log(`[Rocket Import] Created: ${created}, Updated: ${updated}, Enrolled: ${enrolled}`);

    return NextResponse.json({
      success: true,
      summary: {
        total: leads.length,
        created,
        updated,
        enrolled,
        sequenceId,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error("[Rocket Import] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
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
