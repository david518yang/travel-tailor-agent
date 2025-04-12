import { NextResponse } from "next/server";
import { callClaude } from "../../../lib/claude"; // Adjust path if necessary

export async function POST(request: Request) {
  console.log("--- General Query API Request Received ---");
  try {
    const { query, destination } = await request.json();
    console.log("[General Query API] Request Body:", { query, destination });

    if (!query || typeof query !== "string" || query.trim() === "") {
      return NextResponse.json(
        { error: "Missing or invalid query" },
        { status: 400 }
      );
    }
    if (
      !destination ||
      typeof destination !== "string" ||
      destination === "unknown" ||
      destination.trim() === ""
    ) {
      // Don't treat 'unknown' destination as a server error, guide the user
      console.log(
        "[General Query API] Request rejected: Destination unknown or missing."
      );
      return NextResponse.json({
        answer:
          "I need a confirmed destination to answer questions about it. What location are we discussing?",
      });
    }

    // Construct a more contextual prompt for Claude
    const system = `You are a helpful travel assistant currently discussing travel plans for ${destination}. Answer the user's follow-up question about this destination concisely and informatively. Focus on providing helpful travel-related information.`;
    // Keep the main prompt simple, the system prompt adds context
    const prompt = query;

    console.log(
      "[General Query API] Calling Claude with query about:",
      destination
    );
    let claudeResponseText = "";
    try {
      claudeResponseText = await callClaude(prompt, system);
      console.log(
        "[General Query API] Claude Raw Response:",
        claudeResponseText
      );
      if (!claudeResponseText || typeof claudeResponseText !== "string") {
        throw new Error("Received invalid response from language model.");
      }
    } catch (claudeError: any) {
      console.error(
        "[General Query API] Error calling Claude:",
        claudeError.message
      );
      // Return a user-friendly error if Claude fails
      return NextResponse.json(
        {
          error:
            "Sorry, I encountered an issue trying to get that information.",
        },
        { status: 500 }
      );
    }

    // Return the answer
    const finalResponse = {
      answer: claudeResponseText.trim(), // Trim whitespace
    };
    console.log("[General Query API] Sending Final Response:", finalResponse);
    return NextResponse.json(finalResponse);
  } catch (error: any) {
    // Catch errors from request.json() or other unexpected issues
    console.error("[General Query API] Unexpected Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process general query: " + error.message },
      { status: 500 }
    );
  }
}
