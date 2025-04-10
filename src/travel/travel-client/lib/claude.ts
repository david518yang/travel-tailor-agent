import Anthropic from "@anthropic-ai/sdk";

export interface TravelRequest {
  start_date: string;
  end_date: string;
  origin: string;
  destination: string;
}

/**
 * Calls the Anthropic Claude API using the official SDK client.
 */
export async function callClaude(
  prompt: string,
  system?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  //   console.log("API Key exists:", !!apiKey);
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in your environment.");
  }

  // Create Anthropic client
  const client = new Anthropic({
    apiKey: apiKey,
  });

  try {
    // Create message request object
    const messageParams: Anthropic.MessageParams = {
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    // Add system parameter if provided
    if (system) {
      messageParams.system = system;
    }

    // Send the message request
    const response = await client.messages.create(messageParams);

    // Extract the text content from the response
    if (
      response.content &&
      Array.isArray(response.content) &&
      response.content.length > 0
    ) {
      return response.content[0].text;
    } else {
      console.error("Unexpected Claude API response:", response);
      throw new Error("Unexpected response format from Claude API");
    }
  } catch (error) {
    console.error("Error calling Claude API:", error);
    throw error;
  }
}

/**
 * parseTravelRequest:
 * Sends a prompt to Claude to parse a natural language travel request into
 * a structured JSON object with keys "start_date", "end_date", "origin", and "destination".
 */
export async function parseTravelRequest(
  prompt: string
): Promise<TravelRequest> {
  const system =
    "You are a travel request parser. Extract structured information from natural language travel requests. Return ONLY the raw JSON with no markdown code blocks, no explanation, nothing but the JSON object.";
  const claudePrompt = `Parse this travel request and extract the key information. For dates, assume they are in M/D format for *2025* unless otherwise specified. If a key's value is not explicitly mentioned, mark it as 'unknown'.

Travel request: "${prompt}"

Return ONLY the raw JSON object with these exact keys (no explanation, no markdown code blocks, just the plain JSON):
{
  "start_date": "YYYY-MM-DD format",
  "end_date": "YYYY-MM-DD format",
  "origin": "departure city full name in lowercase",
  "destination": "destination city full name in lowercase"
}`;

  try {
    const completion = await callClaude(claudePrompt, system);
    let jsonStr = completion.trim();

    // Strip any markdown code block formatting if present
    jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*$/g, "");

    // Try to parse the JSON directly first
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // If direct parsing fails, try to extract JSON with regex
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      result = JSON.parse(jsonMatch[0]);
    }

    // Check which fields are missing or unknown
    const requiredFields = ["start_date", "end_date", "origin", "destination"];
    const missingFields = [];

    for (const field of requiredFields) {
      if (!(field in result)) {
        result[field] = "unknown";
        missingFields.push(field);
      } else if (result[field] === "" || result[field] === "unknown") {
        missingFields.push(field);
      }
    }

    // Return result even with missing fields - UI will handle prompting
    return result;
  } catch (error: any) {
    console.error("Error parsing travel request:", error);
    throw new Error("Error parsing travel request: " + error.message);
  }
}

/**
 * updateMissingFields:
 * Given additional user input and current travel details (with missing fields marked as "unknown"),
 * this function calls Claude to update ONLY the missing fields.
 * Claude is instructed to return ONLY a valid JSON object with all keys.
 */
export async function updateMissingFields(
  userInput: string,
  currentDetails: TravelRequest
): Promise<TravelRequest> {
  const missingKeys = Object.keys(currentDetails).filter(
    (key) => currentDetails[key as keyof TravelRequest] === "unknown"
  );
  const missingList = missingKeys.join(", ");

  const claudePrompt = `The user provided the following additional information: '${userInput}'
Current travel details: ${JSON.stringify(currentDetails, null, 2)}
Please update ONLY these missing fields if possible: ${missingList}
Rules:
1. If the information is invalid or unclear for any field, keep it as 'unknown'
2. Return ONLY a valid JSON object with all fields, including unchanged ones
3. Do not include any explanation text, ONLY the JSON object
4. Format dates as YYYY-MM-DD, and in the year *2025* unless otherwise specified
5. Use lowercase full city names

Response format example:
{
    "start_date": "2025-04-15",
    "end_date": "2025-04-20",
    "origin": "new york",
    "destination": "london"
}`;

  const system =
    "You are a travel assistant with expert skills in extracting travel information. Carefully analyze user input for any dates or locations that can fill missing fields. Return only clean JSON with ZERO unknown fields if the information is present in any form.";
  try {
    const completion = await callClaude(claudePrompt, system);
    let jsonStr = completion.trim();

    // Strip any markdown code block formatting if present
    jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*$/g, "");

    // Try to parse the JSON directly first
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      // If direct parsing fails, try to extract JSON with regex
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      result = JSON.parse(jsonMatch[0]);
    }

    // Make sure all required fields exist
    const requiredFields = ["start_date", "end_date", "origin", "destination"];
    for (const field of requiredFields) {
      if (!(field in result)) {
        result[field] = "unknown";
      }
    }

    return result;
  } catch (error: any) {
    throw new Error("Error updating missing fields: " + error.message);
  }
}
