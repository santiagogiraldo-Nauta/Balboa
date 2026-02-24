import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getAccounts } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accounts = await getAccounts(supabase, user.id);
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}
