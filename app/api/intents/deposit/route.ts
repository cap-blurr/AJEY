import { NextRequest, NextResponse } from "next/server";
import { addActivity } from "@/lib/activity";
import { generatePlan } from "@/lib/agents/openai";
// SOAP removed. In the new architecture, forward this plan to the internal workflow queue
// or an HTTPS endpoint owned by the workflow agent service (to be implemented).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({}, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const body = await req.json().catch(() => ({}));
  const signedIntent = body?.signedIntent || body;

  // 1) Reasoning agent produces execution plan
  const planRes = await generatePlan({
    kind: "deposit",
    payload: signedIntent,
  });

  // 2) Queue activity
  const planId = `plan_${Date.now()}`;
  addActivity({
    id: planId,
    type: "deposit",
    status: "queued",
    timestamp: Date.now(),
    title: "Deposit intent queued",
    details: planRes.rationale,
  });

  // 3) TODO: POST to workflow agent's /agent/plans with this plan for execution
  // await fetch(process.env.WORKFLOW_AGENT_URL + "/agent/plans", { method: "POST", headers: {"content-type":"application/json", "x-api-key": process.env.WORKFLOW_AGENT_API_KEY!}, body: JSON.stringify({ plan_id: planId, ...planRes.plan }) })

  return NextResponse.json({ planId, status: "queued" });
}


