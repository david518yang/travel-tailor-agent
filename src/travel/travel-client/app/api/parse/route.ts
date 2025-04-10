import { NextResponse } from "next/server";
import { parseTravelRequest } from "../../../lib/claude";

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    const result = await parseTravelRequest(prompt);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
