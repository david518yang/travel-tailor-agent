import { NextResponse } from "next/server";
import { fetchWeatherApi } from "openmeteo";
import { callClaude } from "../../../lib/claude";

// Helper function to form time ranges
const range = (start: number, stop: number, step: number) =>
  Array.from({ length: (stop - start) / step }, (_, i) => start + i * step);

export async function POST(request: Request) {
  console.log("--- Weather API Request Received ---");
  try {
    const { destination, startDate, endDate } = await request.json();
    console.log("[Weather API] Request Body:", {
      destination,
      startDate,
      endDate,
    });

    // Parse dates as UTC
    const startDateObj = new Date(startDate + "T00:00:00Z");
    const endDateObj = new Date(endDate + "T00:00:00Z");
    console.log("[Weather API] Parsed Dates (UTC):", {
      startDateObj,
      endDateObj,
    });

    // --- Always call Claude for historical description ---
    const formattedStartDate = startDateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC", // Specify UTC for formatting
    });
    const formattedEndDate = endDateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC", // Specify UTC for formatting
    });
    const prompt = `What is the typical weather in ${destination} between ${formattedStartDate} and ${formattedEndDate}? Keep it under 3 or 4 sentences but talk about the weather patterns around that time of year in that location. Use fahrenheit for units and metric units for wind speed.`;
    console.log("[Weather API] Calling Claude with prompt:", prompt);
    const claudeResponse = await callClaude(prompt);
    console.log("[Weather API] Claude Response:", claudeResponse);

    // --- Always attempt to fetch forecast data ---
    let forecasts: any[] | null = null;
    let location: any | null = null;
    console.log("[Weather API] Attempting to fetch forecast...");

    try {
      // Use default coordinates (can be enhanced with geocoding)
      const params = {
        latitude: 37.5503,
        longitude: 126.9971,
        daily: [
          "temperature_2m_max",
          "temperature_2m_min",
          "wind_speed_10m_max",
          "precipitation_probability_max",
        ],
        forecast_days: 16,
        wind_speed_unit: "mph",
        temperature_unit: "fahrenheit",
      };
      console.log("[Weather API] Open-Meteo Params:", params);
      const url = "https://api.open-meteo.com/v1/forecast";
      const responses = await fetchWeatherApi(url, params);
      const response = responses[0];

      // Get timezone and location information
      const utcOffsetSeconds = response.utcOffsetSeconds();
      const timezone = response.timezone();
      const timezoneAbbreviation = response.timezoneAbbreviation();
      const latitude = response.latitude();
      const longitude = response.longitude();
      location = { latitude, longitude, timezone, timezoneAbbreviation };
      console.log("[Weather API] Location Info:", location);

      const daily = response.daily()!;
      const weatherData = {
        daily: {
          time: range(
            Number(daily.time()),
            Number(daily.timeEnd()),
            daily.interval()
          ).map((t) => new Date((t + utcOffsetSeconds) * 1000)),
          temperature2mMax: daily.variables(0)!.valuesArray()!,
          temperature2mMin: daily.variables(1)!.valuesArray()!,
          windSpeed10mMax: daily.variables(2)!.valuesArray()!,
          precipitationProbabilityMax: daily.variables(3)!.valuesArray()!,
        },
      };

      // Filter forecasts based on the requested date range (using UTC date strings)
      const relevantForecasts = [];
      const startUtcDateString = startDateObj.toISOString().slice(0, 10); // YYYY-MM-DD
      const endUtcDateString = endDateObj.toISOString().slice(0, 10); // YYYY-MM-DD
      console.log(
        `[Weather API] Filtering ${weatherData.daily.time.length} fetched days against UTC range: ${startUtcDateString} - ${endUtcDateString}`
      );
      for (let i = 0; i < weatherData.daily.time.length; i++) {
        const currentDate = weatherData.daily.time[i];
        const currentUtcDateString = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD

        // Compare date strings
        if (
          currentUtcDateString >= startUtcDateString &&
          currentUtcDateString <= endUtcDateString
        ) {
          relevantForecasts.push({
            date: weatherData.daily.time[i].toISOString(), // Keep sending the full ISO string
            maxTemperature: weatherData.daily.temperature2mMax[i],
            minTemperature: weatherData.daily.temperature2mMin[i],
            windSpeed: weatherData.daily.windSpeed10mMax[i],
            precipitationProbability:
              weatherData.daily.precipitationProbabilityMax[i],
          });
        }
      }
      forecasts = relevantForecasts; // Assign all relevant forecasts
      console.log(
        `[Weather API] Found ${forecasts.length} relevant forecasts within the requested range.`
      );
    } catch (forecastError: any) {
      console.error(
        "[Weather API] Error fetching forecast data:",
        forecastError.message
      );
      // Set to null if the API call itself fails
      forecasts = null;
      location = null;
    }

    // --- Return combined response ---
    const finalResponse = {
      description: claudeResponse,
      destination: destination,
      forecasts: forecasts, // Will be [] if dates are out of range, null if API error
      location: location,
    };
    console.log("[Weather API] Sending Final Response:", finalResponse);
    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error("[Weather API] General weather API error:", error.message);
    return NextResponse.json(
      { error: "Failed to process weather request: " + error.message },
      { status: 500 }
    );
  }
}
