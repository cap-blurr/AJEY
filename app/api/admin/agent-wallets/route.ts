import { NextResponse } from "next/server";
import { getAgentAccounts } from "@/lib/agents/wallet";

export async function GET() {
  const accounts = getAgentAccounts().map((a) => ({ role: a.role, address: a.account.address }));
  return NextResponse.json({ accounts });
}


