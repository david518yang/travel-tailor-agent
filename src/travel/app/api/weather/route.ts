import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { destination, startDate, endDate } = body;

    // Call MCP server
    const mcpResponse = await fetch("http://localhost:8000/get_weather", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destination,
        startDate,
        endDate,
      }),
    });

    if (!mcpResponse.ok) {
      throw new Error(
        `MCP server responded with status: ${mcpResponse.status}`
      );
    }

    const weatherData = await mcpResponse.json();
    return NextResponse.json(weatherData);
  } catch (error) {
    console.error("Error in weather route:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}
