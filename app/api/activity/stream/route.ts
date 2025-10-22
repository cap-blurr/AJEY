import { listActivity, getActivityEmitter, latestTrace } from "@/lib/activity";
import { startVaultEventWatcher } from "@/lib/services/vault-events";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Avoid static generation/export trying to execute this endless SSE route
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return new Response("", { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  try { startVaultEventWatcher(); } catch {}
  // eslint-disable-next-line no-console
  console.log("[sse] client connecting to /api/activity/stream");
  const encoder = new TextEncoder();
  const abortSignal = req.signal;
  let closed = false;
  const emitter = getActivityEmitter();
  const stream = new ReadableStream({
    start(controller) {
      const safeWrite = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          // eslint-disable-next-line no-console
          console.log("[sse] sent", { event, size: typeof data === "string" ? data.length : undefined });
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error("[sse] write failed", e?.message || e);
          closed = true;
          try { controller.close(); } catch {}
          cleanup();
        }
      };
      const onAdd = (item: any) => { safeWrite("activity:add", item); };
      const onUpdate = (item: any) => { safeWrite("activity:update", item); };
      const onTrace = (payload: any) => { safeWrite("activity:trace", payload); };
      const cleanup = () => {
        emitter.off("activity:add", onAdd);
        emitter.off("activity:update", onUpdate);
        emitter.off("activity:trace", onTrace);
        // eslint-disable-next-line no-console
        console.log("[sse] client disconnected");
      };
      emitter.on("activity:add", onAdd);
      emitter.on("activity:update", onUpdate);
      emitter.on("activity:trace", onTrace);
      const snapshot = { items: listActivity(), latestTrace: latestTrace() };
      // eslint-disable-next-line no-console
      console.log("[sse] sending snapshot", { items: snapshot.items.length, hasTrace: !!snapshot.latestTrace });
      safeWrite("snapshot", snapshot);
      abortSignal.addEventListener("abort", () => {
        closed = true;
        try { controller.close(); } catch {}
        cleanup();
      });
    },
    cancel() {
      closed = true;
      // eslint-disable-next-line no-console
      console.log("[sse] stream canceled by consumer");
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}


