import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getDeals } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deals = await getDeals(supabase, user.id);
    return NextResponse.json({ deals });
  } catch (error) {
    console.error("Error fetching deals:", error);
    return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
  }
}
