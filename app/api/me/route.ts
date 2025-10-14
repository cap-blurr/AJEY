import { NextResponse } from "next/server";

export async function GET() {
  // In real app, verify Privy session token from headers
  return NextResponse.json({ address: "0x0000...mock", displayName: "User" });
}


