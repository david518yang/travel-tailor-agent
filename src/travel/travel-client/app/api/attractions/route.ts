import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { city } = body;

    console.log("[Attractions API] Request:", { city });

    if (!city) {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }

    // Call MCP server
    console.log("[Attractions API] Calling MCP with city:", city);
    const mcpResponse = await fetch("http://localhost:8000/get_attractions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ city }),
    });

    console.log("[Attractions API] MCP response status:", mcpResponse.status);

    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      console.error(`[Attractions API] MCP Error: ${errorText}`);
      throw new Error(
        `MCP server responded with status: ${mcpResponse.status}`
      );
    }

    const attractionsData = await mcpResponse.json();
    console.log("[Attractions API] MCP response data:", attractionsData);
    console.log(
      "[Attractions API] Attractions count:",
      attractionsData?.attractions?.length || 0
    );

    return NextResponse.json(attractionsData);
  } catch (error: any) {
    console.error("[Attractions API] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch attractions data: " + error.message },
      { status: 500 }
    );
  }
}
