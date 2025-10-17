import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
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


