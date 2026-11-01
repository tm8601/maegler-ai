import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "maegler-ai",
    timestamp: new Date().toISOString(),
  });
}
