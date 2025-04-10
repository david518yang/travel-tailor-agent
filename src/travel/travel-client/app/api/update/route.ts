import { NextResponse } from "next/server";
import { updateMissingFields } from "../../../lib/claude";
import type { TravelRequest } from "../../../lib/claude";

export async function POST(request: Request) {
  try {
    const { userInput, currentDetails } = (await request.json()) as {
      userInput: string;
      currentDetails: TravelRequest;
    };
    const result = await updateMissingFields(userInput, currentDetails);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
