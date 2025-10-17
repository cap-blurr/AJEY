import { NextResponse } from "next/server";
import { getAgentAccounts } from "@/lib/agents/wallet";

export async function GET() {
  try {
    const accounts = getAgentAccounts().map((a) => ({ role: a.role, address: a.account.address }));
    return NextResponse.json({ accounts });
  } catch (e: any) {
    return NextResponse.json({ accounts: [], error: e?.message || String(e) }, { status: 200 });
  }
}


