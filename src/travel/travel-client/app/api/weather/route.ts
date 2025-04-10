import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { destination, date } = await request.json();
    // TODO: Integrate actual weather API logic
    return NextResponse.json({
      forecast: `Sunny with a few clouds. High of 25°C in ${destination} on ${date}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
