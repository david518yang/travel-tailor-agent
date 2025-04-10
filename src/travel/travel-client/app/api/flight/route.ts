import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Use POST method to search for flights",
  });
}

export async function POST(request: Request) {
  try {
    const { origin, destination, date } = await request.json();
    console.log("Flight search request:", { origin, destination, date });

    // Format the request body according to the FastAPI endpoint requirements
    const mcpRequestBody = {
      departure_location: origin,
      arrival_location: destination,
      departure_date_and_time: date,
      return_date: null, // Add this if you want to support round trips later
    };
    console.log("MCP request body:", mcpRequestBody);

    // Call the MCP FastAPI endpoint
    const response = await fetch("http://localhost:8000/get_flight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mcpRequestBody),
    });

    console.log("MCP response status:", response.status);

    if (!response.ok) {
      throw new Error(`Flight search failed: ${response.statusText}`);
    }

    const flightData = await response.text();
    // Remove quotes and unescape newlines
    const cleanedData = flightData.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    console.log("Cleaned flight data:", cleanedData);

    // Check if the response is an error message
    if (
      cleanedData.includes("No flights found") ||
      typeof cleanedData !== "string"
    ) {
      console.log("No flights found in response");
      return NextResponse.json({ flights: [] });
    }

    try {
      const sections = cleanedData.split("-".repeat(40));
      console.log("Number of flight sections found:", sections.length);
      console.log("Flight sections:", sections);

      const flightOptions = sections
        .map((section) => section.trim())
        .filter(Boolean)
        .map((section) => {
          const lines = section.split("\n").filter((line) => line.trim());
          console.log("Processing flight section lines:", lines);

          // More defensive parsing
          let option = "1";
          let price = "";
          let duration = "";
          let details: string[] = [];

          // Try to parse each line
          for (const line of lines) {
            if (line.includes("Option")) {
              option = line.split(":")[0].replace("Option", "").trim();
            } else if (line.includes("Price:")) {
              price = line.split("Price:")[1].trim();
            } else if (line.includes("Duration:")) {
              duration = line.split("Duration:")[1].trim();
            } else if (line.trim()) {
              details.push(line.trim());
            }
          }

          const flight = {
            option,
            price,
            duration,
            details: details.filter(Boolean), // Remove any empty strings
          };
          console.log("Parsed flight:", flight);
          return flight;
        })
        .filter((flight) => flight.price && flight.duration); // Only include complete flight entries

      console.log("Final processed flights:", flightOptions);

      if (flightOptions.length === 0) {
        console.log("No valid flights after processing");
        return NextResponse.json({ flights: [] });
      }

      return NextResponse.json({ flights: flightOptions });
    } catch (parseError) {
      console.error("Error parsing flight data:", parseError);
      console.log("Raw flight data that caused error:", flightData);
      return NextResponse.json({ flights: [] });
    }
  } catch (error: any) {
    console.error("Flight search error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search flights" },
      { status: 500 }
    );
  }
}
