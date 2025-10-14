import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activity";

export async function GET() {
  return NextResponse.json({ items: listActivity() });
}


