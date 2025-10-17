import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activity";
// Start the event watcher when this module loads on the server
import { startVaultEventWatcher } from "@/lib/services/vault-events";
startVaultEventWatcher();

export async function GET() {
  return NextResponse.json({ items: listActivity() });
}


