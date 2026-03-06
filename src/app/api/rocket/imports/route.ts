import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

/**
 * GET /api/rocket/imports
 *
 * Fetches import history for the authenticated user.
 * Query params:
 *   - limit (default: 20)
 *   - offset (default: 0)
 *   - enrichment_status (optional filter)
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const enrichmentStatus = url.searchParams.get("enrichment_status");

  try {
    let query = supabase
      .from("rocket_imports")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (enrichmentStatus) {
      query = query.eq("enrichment_status", enrichmentStatus);
    }

    const { data, count, error: queryError } = await query;

    if (queryError) {
      console.error("[Rocket Imports] Query error:", queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    // Compute aggregate stats
    const { data: statsData } = await supabase
      .from("rocket_imports")
      .select("total_rows, created_count, updated_count, error_count, enrolled_count, quality_score, duration_ms")
      .eq("user_id", user.id);

    const stats = {
      totalImports: count || 0,
      totalLeadsImported: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalErrors: 0,
      totalEnrolled: 0,
      avgQualityScore: 0,
      avgDurationMs: 0,
    };

    if (statsData && statsData.length > 0) {
      let qualitySum = 0;
      let durationSum = 0;
      let qualityCount = 0;

      for (const row of statsData) {
        stats.totalLeadsImported += row.total_rows || 0;
        stats.totalCreated += row.created_count || 0;
        stats.totalUpdated += row.updated_count || 0;
        stats.totalErrors += row.error_count || 0;
        stats.totalEnrolled += row.enrolled_count || 0;
        if (row.quality_score?.overall) {
          qualitySum += row.quality_score.overall;
          qualityCount++;
        }
        if (row.duration_ms) {
          durationSum += row.duration_ms;
        }
      }

      stats.avgQualityScore = qualityCount > 0 ? Math.round(qualitySum / qualityCount) : 0;
      stats.avgDurationMs = statsData.length > 0 ? Math.round(durationSum / statsData.length) : 0;
    }

    return NextResponse.json({
      imports: data || [],
      total: count || 0,
      stats,
    });
  } catch (err) {
    console.error("[Rocket Imports] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch imports" },
      { status: 500 }
    );
  }
}
