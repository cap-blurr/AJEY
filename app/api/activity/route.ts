import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activity";
import { startVaultEventWatcher } from "@/lib/services/vault-events";

export const runtime = "nodejs";

export async function GET() {
  // Lazily start watcher on first activity fetch to avoid starting during build/static generation
  try { startVaultEventWatcher(); } catch {}
  return NextResponse.json({ items: listActivity() });
}