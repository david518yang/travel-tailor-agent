import { NextResponse } from "next/server";

// Common airport codes for major cities
const cityToAirportCode: Record<string, string> = {
  "new york": "JFK",
  nyc: "JFK",
  "los angeles": "LAX",
  la: "LAX",
  chicago: "ORD",
  "san francisco": "SFO",
  sf: "SFO",
  dallas: "DFW",
  miami: "MIA",
  atlanta: "ATL",
  denver: "DEN",
  seattle: "SEA",
  boston: "BOS",
  washington: "IAD",
  dc: "IAD",
  "las vegas": "LAS",
  london: "LHR",
  paris: "CDG",
  tokyo: "HND",
  sydney: "SYD",
  toronto: "YYZ",
  rome: "FCO",
  amsterdam: "AMS",
  dubai: "DXB",
  "hong kong": "HKG",
  beijing: "PEK",
  shanghai: "PVG",
  seoul: "ICN",
  singapore: "SIN",
  bangkok: "BKK",
  madrid: "MAD",
  berlin: "BER",
  munich: "MUC",
  zurich: "ZRH",
  vienna: "VIE",
  istanbul: "IST",
  dublin: "DUB",
};

// Function to convert city name to airport code
function getAirportCode(city: string): string {
  // Normalize city name: lowercase and trim
  const normalizedCity = city.toLowerCase().trim();

  // Check if we have a direct match
  if (cityToAirportCode[normalizedCity]) {
    return cityToAirportCode[normalizedCity];
  }

  // Check if the city contains a known city name
  for (const [cityName, code] of Object.entries(cityToAirportCode)) {
    if (normalizedCity.includes(cityName)) {
      return code;
    }
  }

  // If no match is found, return the city in uppercase as a fallback
  // This assumes the MCP might be able to handle some city names directly
  return normalizedCity.substring(0, 3).toUpperCase();
}

// Process flight data from MCP response
function processFlightData(flightData: string, limit: number = 4) {
  // Remove quotes and unescape newlines
  const cleanedData = flightData.replace(/^"|"$/g, "").replace(/\\n/g, "\n");

  if (
    cleanedData.includes("No flights found") ||
    typeof cleanedData !== "string"
  ) {
    console.log("No flights found in response");
    return [];
  }

  try {
    const sections = cleanedData.split("-".repeat(40));

    const flightOptions = sections
      .map((section) => section.trim())
      .filter(Boolean)
      .map((section) => {
        const lines = section.split("\n").filter((line) => line.trim());

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
        return flight;
      })
      .filter((flight) => flight.price && flight.duration); // Only include complete flight entries

    // Return only the requested number of flights
    return flightOptions.slice(0, limit);
  } catch (parseError) {
    console.error("Error parsing flight data:", parseError);
    return [];
  }
}

// Define the Flight type
interface Flight {
  option: string;
  price: string;
  duration: string;
  details: string[];
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST method to search for flights",
  });
}

export async function POST(request: Request) {
  console.log("--- Flight API Request Received ---");
  try {
    // Expecting flight search parameters
    const { origin, destination, date, returnDate } = await request.json();
    console.log("[Flight API] Request Body:", {
      origin,
      destination,
      date,
      returnDate,
    });

    // Convert city names to airport codes
    const originCode = getAirportCode(origin);
    const destinationCode = getAirportCode(destination);

    console.log("[Flight API] Converted to airport codes:", {
      origin: `${origin} → ${originCode}`,
      destination: `${destination} → ${destinationCode}`,
    });

    // Departing flights
    const departingRequestBody = {
      departure_location: originCode,
      arrival_location: destinationCode,
      departure_date_and_time: date,
      return_date: null, // MCP expects null here
    };

    console.log(
      "[Flight API] Departing flights request to MCP:",
      departingRequestBody
    );

    const departingResponse = await fetch("http://localhost:8000/get_flight", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(departingRequestBody),
    });
    console.log(
      "[Flight API] Departing MCP response status:",
      departingResponse.status
    );

    if (!departingResponse.ok) {
      const errorText = await departingResponse.text();
      console.error("[Flight API] Departing MCP Error:", errorText);
      throw new Error(
        `Departing flight search failed (${departingResponse.status})`
      );
    }

    const departingFlightData = await departingResponse.text();
    const departingFlights: Flight[] = processFlightData(
      departingFlightData,
      4
    );
    console.log(
      `[Flight API] Processed ${departingFlights.length} departing flights.`
    );

    let returningFlights: Flight[] = [];

    // Only search for returning flights if returnDate is provided
    if (returnDate) {
      console.log(
        "[Flight API] Return date provided, fetching returning flights..."
      );
      const returningRequestBody = {
        departure_location: destinationCode, // Swapped
        arrival_location: originCode, // Swapped
        departure_date_and_time: returnDate,
        return_date: null,
      };

      console.log(
        "[Flight API] Returning flights request to MCP:",
        returningRequestBody
      );

      const returningResponse = await fetch(
        "http://localhost:8000/get_flight",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(returningRequestBody),
        }
      );
      console.log(
        "[Flight API] Returning MCP response status:",
        returningResponse.status
      );

      if (!returningResponse.ok) {
        const errorText = await returningResponse.text();
        console.error("[Flight API] Returning MCP Error:", errorText);
        // Don't throw here, just log and return empty results for return leg
        console.warn(
          `Returning flight search failed (${returningResponse.status}), proceeding without return flights.`
        );
      } else {
        const returningFlightData = await returningResponse.text();
        returningFlights = processFlightData(returningFlightData, 4);
        console.log(
          `[Flight API] Processed ${returningFlights.length} returning flights.`
        );
      }
    }

    // Return the correct flight data structure
    const finalResponse = {
      departingFlights,
      returningFlights,
      hasReturn:
        returnDate !== null &&
        returnDate !== undefined &&
        returnDate !== "unknown", // Check unknown too
    };
    console.log("[Flight API] Sending Final Response:", finalResponse);
    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error("[Flight API] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process flight search: " + error.message },
      { status: 500 }
    );
  }
}
