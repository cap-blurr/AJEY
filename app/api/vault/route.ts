import { NextResponse } from "next/server";

export async function GET() {
  // This route is deprecated in favor of direct on-chain reads in the client.
  return NextResponse.json({ deprecated: true });
}


