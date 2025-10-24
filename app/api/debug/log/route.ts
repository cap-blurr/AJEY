import { NextRequest, NextResponse } from "next/server";
import { startVaultEventWatcher } from "@/lib/services/vault-events";
import { hydrateActivityStore } from "@/lib/activity";

export async function POST(req: NextRequest) {
  try {
    // Ensure event watcher is started on any debug hit (deposit flow uses this endpoint)
    startVaultEventWatcher();
    try { await hydrateActivityStore(); } catch {}
    const body = await req.json().catch(() => ({}));
    const scope = body?.scope || "app";
    const step = body?.step || "unknown";
    const data = body?.data;
    // eslint-disable-next-line no-console
    console.log(`[debug:${scope}] ${new Date().toISOString()} step=${step}`, data ?? "");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}


