"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ChatMessageList } from "../components/ui/chat/chat-message-list";
import { ChatInput } from "../components/ui/chat/chat-input";
import {
  ChatBubble,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "../components/ui/chat/chat-bubble";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import {
  ChevronsUpDown,
  Wind,
  Droplets,
  PlaneTakeoff,
  Sparkles,
  Info,
  SendHorizontal,
  MapPin,
} from "lucide-react";
import { TravelRequest } from "../lib/claude";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";

const styleEl =
  typeof document !== "undefined" ? document.createElement("style") : null;
if (styleEl) {
  styleEl.textContent = `
    .animation-delay-200 {
      animation-delay: 200ms;
    }
    .animation-delay-400 {
      animation-delay: 400ms;
    }
  `;
  document.head.appendChild(styleEl);
}

type Flight = {
  option: string;
  price: string;
  duration: string;
  details: string[];
};

type WeatherForecast = {
  date: string;
  maxTemperature: number;
  minTemperature: number;
  windSpeed: number;
  precipitationProbability: number;
};

type WeatherLocation = {
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneAbbreviation: string;
};

type Attraction = {
  title: string;
  reviews: number | string;
  rating: number;
  address: string;
  website: string;
  description: string;
  thumbnail: string;
  hours: string;
  phone: string;
  place_id: string;
};

type Message = {
  role: "user" | "assistant";
  content?: string;
  flights?: {
    departingFlights: Flight[];
    returningFlights: Flight[];
    hasReturn: boolean;
    origin: string;
    destination: string;
  };
  weather?: {
    description: string;
    forecasts?: WeatherForecast[] | null;
    location?: WeatherLocation | null;
    destination: string;
  };
  attractions?: {
    city: string;
    attractions: Attraction[];
  };
  id?: string;
};

const DEFAULT_TRAVEL_DETAILS: TravelRequest = {
  start_date: "unknown",
  end_date: "unknown",
  origin: "unknown",
  destination: "unknown",
};

const dummyFlightOptions = [
  {
    option: "1",
    price: "$639",
    duration: "6h 50m",
    details: [
      "Norse Atlantic Airways N0 302",
      "JFK 2025-06-01 00:15 → CDG 2025-06-01 13:05",
    ],
  },
  {
    option: "2",
    price: "$791",
    duration: "7h 50m",
    details: ["Delta DL 266", "JFK 2025-06-01 20:10 → CDG 2025-06-02 10:00"],
  },
  {
    option: "3",
    price: "$791",
    duration: "7h 50m",
    details: ["Delta DL 266", "JFK 2025-06-01 20:10 → CDG 2025-06-02 10:00"],
  },
  {
    option: "4",
    price: "$791",
    duration: "7h 50m",
    details: ["Delta DL 266", "JFK 2025-06-01 20:10 → CDG 2025-06-02 10:00"],
  },
  {
    option: "5",
    price: "$791",
    duration: "7h 50m",
    details: ["Delta DL 266", "JFK 2025-06-01 20:10 → CDG 2025-06-02 10:00"],
  },
];

// Helper function to capitalize city names
const capitalizeCityName = (name: string): string => {
  if (!name || name === "unknown") return name;
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// --- Normalization Data & Function ---
const cityNameVariations: Record<string, string> = {
  // USA
  nyc: "new york",
  "new york city": "new york",
  la: "los angeles",
  lax: "los angeles", // Sometimes users might use codes
  chi: "chicago",
  ord: "chicago",
  sf: "san francisco",
  sfo: "san francisco",
  vegas: "las vegas",
  dca: "washington",
  iad: "washington",
  bwi: "washington", // Close enough for context
  // Europe
  cdg: "paris",
  lhr: "london",
  lgw: "london",
  fco: "rome",
  ams: "amsterdam",
  mad: "madrid",
  bcn: "barcelona",
  ber: "berlin",
  muc: "munich",
  // Asia
  nrt: "tokyo",
  hnd: "tokyo",
  icn: "seoul",
  pek: "beijing",
  pvg: "shanghai",
  hkg: "hong kong",
  sin: "singapore",
  bkk: "bangkok",
  // Add more common variations as needed
};

const normalizeCityName = (city: string): string => {
  if (!city || city === "unknown") return city;
  const lowerCity = city.toLowerCase().trim();
  return cityNameVariations[lowerCity] || lowerCity; // Return mapped name or original lowercased name
};

const LoadingDots = () => {
  return (
    <span className="inline-flex items-center">
      <span className="animate-pulse bg-blue-600 rounded-full h-1.5 w-1.5 mx-0.5"></span>
      <span className="animate-pulse bg-blue-600 rounded-full h-1.5 w-1.5 mx-0.5 animation-delay-200"></span>
      <span className="animate-pulse bg-blue-600 rounded-full h-1.5 w-1.5 mx-0.5 animation-delay-400"></span>
    </span>
  );
};

const FlightCard = ({ flight }: { flight: Flight }) => {
  const [isItineraryOpen, setIsItineraryOpen] = useState(false);

  const airlineInfo = flight.details
    .filter(
      (line: string) =>
        !line.includes("→") && !line.toLowerCase().includes("layover")
    )
    .join(", ");

  const formatDateTime = (dateTimeStr: string) => {
    const [date, time] = dateTimeStr.split(" ");
    if (!date || !time) return dateTimeStr;

    try {
      const dateObj = new Date(date + "T" + time);
      const month = (dateObj.getMonth() + 1).toString();
      const day = dateObj.getDate().toString();
      const year = dateObj.getFullYear().toString().slice(2);
      const hours = dateObj.getHours().toString();
      const minutes = dateObj.getMinutes().toString().padStart(2, "0");

      return `${month}/${day}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateTimeStr;
    }
  };

  type FlightSegment = {
    departure: { airport: string; dateTime: string; formatted: string };
    arrival: { airport: string; dateTime: string; formatted: string };
    flightNumber?: string;
  };

  type LayoverInfo = {
    airport: string;
    duration: string;
  };

  const segments: FlightSegment[] = [];
  const layovers: LayoverInfo[] = [];

  flight.details.forEach((detail: string, index: number) => {
    if (detail.includes("→")) {
      const [departure, arrival] = detail.split("→").map((s) => s.trim());
      const [depAirport, ...depParts] = departure.split(" ");
      const [arrAirport, ...arrParts] = arrival.split(" ");
      const depDateTime = depParts.join(" ");
      const arrDateTime = arrParts.join(" ");
      segments.push({
        departure: {
          airport: depAirport,
          dateTime: depDateTime,
          formatted: formatDateTime(depDateTime),
        },
        arrival: {
          airport: arrAirport,
          dateTime: arrDateTime,
          formatted: formatDateTime(arrDateTime),
        },
      });
    } else if (detail.toLowerCase().includes("layover")) {
      const layoverMatch = detail.match(/Layover at ([A-Z]{3}):?\s*(.+)/i);
      if (layoverMatch) {
        layovers.push({
          airport: layoverMatch[1],
          duration: layoverMatch[2],
        });
      }
    } else if (
      index > 0 &&
      flight.details[index - 1].includes("→") &&
      !detail.includes("Layover")
    ) {
      if (segments.length > 0) {
        segments[segments.length - 1].flightNumber = detail;
      }
    }
  });

  const renderSegment = (segment: FlightSegment) => (
    <div className="flex items-center space-x-2 text-gray-600">
      <div className="flex-1">
        <div className="flex items-center mb-1">
          <span className="font-medium">{segment.departure.airport}</span>
          <span className="ml-1">🛫</span>
        </div>
        <div className="text-sm text-gray-500">
          {segment.departure.formatted}
        </div>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-blue-400 px-2">→</span>
      </div>
      <div className="flex-1 text-right">
        <div className="flex items-center justify-end mb-1">
          <span className="mr-1">🛬</span>
          <span className="font-medium">{segment.arrival.airport}</span>
        </div>
        <div className="text-sm text-gray-500 text-right ml-5">
          {segment.arrival.formatted}
        </div>
      </div>
    </div>
  );

  const renderLayover = (layover: LayoverInfo) => (
    <div className="flex items-center my-1.5 text-sm text-indigo-600 bg-indigo-50 rounded py-1 px-2">
      <span className="mr-1">🕒</span>
      <span>
        Layover at {layover.airport}: {layover.duration}
      </span>
    </div>
  );

  return (
    <Card className="p-2 hover:shadow-lg transition-shadow duration-200 bg-white border border-gray-200 mb-3">
      <CardHeader className="text-sm font-medium flex items-center space-x-2 pb-1 px-0 pt-0">
        <span className="text-blue-600">✈️</span>
        <span className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          {airlineInfo}
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-2 px-0 pb-0">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <div className="flex items-center space-x-1 text-green-700">
            <span className="text-green-600">💰</span>
            <span className="font-semibold">{flight.price}</span>
          </div>
          <div className="flex items-center space-x-1 text-blue-700">
            <span className="text-blue-600">⏱️</span>
            <span className="font-medium">{flight.duration}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {segments.length > 0 && renderSegment(segments[0])}
          {segments.length === 1 && null}
          {segments.length > 1 && (
            <Collapsible
              open={isItineraryOpen}
              onOpenChange={setIsItineraryOpen}
              className="mt-1.5"
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center h-7 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  View Full Itinerary
                  {segments.length - 1 > 1 ? "s" : ""})
                  <ChevronsUpDown className="h-3 w-3 ml-1" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1.5 space-y-1.5 pt-1.5 border-t border-dashed border-gray-300">
                {segments.slice(1).map((segment, index) => (
                  <React.Fragment key={index + 1}>
                    {layovers[index] && renderLayover(layovers[index])}
                    {renderSegment(segment)}
                  </React.Fragment>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const AttractionCard = ({ attraction }: { attraction: Attraction }) => {
  // Simple card with name, rating and description
  return (
    <Card className="p-3 hover:shadow-lg transition-shadow duration-200 bg-white border border-gray-200 mb-3">
      <CardHeader className="text-md font-semibold px-0 pt-0 pb-2 flex items-start">
        <span className="text-gray-400 mr-2">📍</span>
        <span>{attraction.title}</span>
      </CardHeader>
      <div className="px-0 pb-2 ml-1 flex items-center">
        <span className="text-amber-500 mr-1">⭐</span>
        <span className="text-sm text-gray-700 font-medium">
          {attraction.rating.toFixed(1)}
        </span>
      </div>
      <CardContent className="space-y-2 px-0 pb-0">
        <div className="text-sm text-gray-700">{attraction.description}</div>
      </CardContent>
    </Card>
  );
};

// Add a helper function to safely use the performance API at the top level
const safePerformance = {
  now: () => {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  },
  mark: (name: string) => {
    if (
      typeof performance !== "undefined" &&
      typeof performance.mark === "function"
    ) {
      try {
        performance.mark(name);
      } catch (e) {
        console.warn("Performance marking not supported", e);
      }
    }
  },
  measure: (name: string, startMark: string, endMark: string) => {
    if (
      typeof performance !== "undefined" &&
      typeof performance.measure === "function"
    ) {
      try {
        performance.measure(name, startMark, endMark);
      } catch (e) {
        console.warn("Performance measuring not supported", e);
      }
    }
  },
  getEntriesByName: (name: string) => {
    if (
      typeof performance !== "undefined" &&
      typeof performance.getEntriesByName === "function"
    ) {
      try {
        return performance.getEntriesByName(name);
      } catch (e) {
        console.warn("Performance entries not supported", e);
        return [{ duration: 0 }];
      }
    }
    return [{ duration: 0 }];
  },
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [travelDetails, setTravelDetails] = useState<TravelRequest>(
    DEFAULT_TRAVEL_DETAILS
  );
  const [waitingForFields, setWaitingForFields] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [chatMode, setChatMode] = useState<"gathering" | "general_qa">(
    "gathering"
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- Effect for Auto-Scrolling - Reverting to scrollTop + increased padding ---
  useEffect(() => {
    // Log the ref to ensure it's pointing to the element
    console.log(
      "[AutoScroll] Effect triggered. Scroll container ref:",
      scrollContainerRef.current
    );
    if (scrollContainerRef.current) {
      const scrollElement = scrollContainerRef.current;
      // Add a very small delay to allow DOM to update fully
      setTimeout(() => {
        console.log(
          `[AutoScroll] Setting scrollTop: current=${scrollElement.scrollTop}, scrollHeight=${scrollElement.scrollHeight}`
        );
        scrollElement.scrollTop = scrollElement.scrollHeight;
        console.log(`[AutoScroll] New scrollTop=${scrollElement.scrollTop}`);
      }, 0); // setTimeout with 0ms delay
    }
  }, [messages]);

  // Add effects to validate travelDetails state changes
  useEffect(() => {
    console.log("[Debug] Travel details updated:", travelDetails);
  }, [travelDetails]);

  const missingFields = (): string[] => {
    const missing: string[] = [];
    if (travelDetails.start_date === "unknown") missing.push("start date");
    if (travelDetails.end_date === "unknown") missing.push("end date");
    if (travelDetails.origin === "unknown") missing.push("departure city");
    if (travelDetails.destination === "unknown") missing.push("destination");
    return missing;
  };

  const getMissingFieldsPrompt = (missing: string[]): string => {
    if (missing.length === 0) return "";
    if (missing.length === 1) return `Please provide the ${missing[0]}:`;
    if (missing.length === 2)
      return `Please provide the ${missing[0]} and ${missing[1]}:`;
    const lastField = missing.pop();
    return `Please provide the ${missing.join(", ")}, and ${lastField}:`;
  };

  const parseTravelRequest = async (prompt: string): Promise<TravelRequest> => {
    const loadingId = `loading-${Date.now()}`;
    const loadingMessage: Message = {
      id: loadingId,
      role: "assistant",
      content: "Processing your request...",
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      setMessages((prev) => prev.filter((msg) => msg.id !== loadingId));

      if (!res.ok) {
        try {
          const errorData = await res.json();
          throw new Error(errorData.error || "Failed to parse travel request");
        } catch (jsonError) {
          throw new Error(
            `Request failed with status: ${res.status} ${res.statusText}`
          );
        }
      }

      const data = await res.json();
      const requiredFields = [
        "start_date",
        "end_date",
        "origin",
        "destination",
      ];

      for (const field of requiredFields) {
        if (!(field in data))
          throw new Error(`Missing required field: ${field}`);
      }

      // Normalize city names before setting state
      const normalizedData: TravelRequest = {
        ...data,
        origin: normalizeCityName(data.origin),
        destination: normalizeCityName(data.destination),
      };

      console.log(
        "[Client Parse] Original vs Normalized Cities:",
        { O_orig: data.origin, D_orig: data.destination },
        { O_norm: normalizedData.origin, D_norm: normalizedData.destination }
      );

      // Set state with normalized data
      setTravelDetails(normalizedData);

      return normalizedData;
    } catch (error: any) {
      console.error("Error parsing travel request:", error);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingId),
        {
          role: "assistant",
          content: `Sorry, I had trouble understanding. Please try again.`,
        },
      ]);
      throw error;
    }
  };

  const updateMissingFields = async (
    userInput: string,
    currentDetails: TravelRequest
  ): Promise<TravelRequest> => {
    const loadingId = `loading-${Date.now()}`;
    const loadingMessage: Message = {
      id: loadingId,
      role: "assistant",
      content: "Processing...",
    };
    setMessages((prev) => [...prev, loadingMessage]);
    try {
      const res = await fetch("/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput, currentDetails }),
      });
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingId));
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update details");
      }
      const data = await res.json();
      const requiredFields = [
        "start_date",
        "end_date",
        "origin",
        "destination",
      ];
      for (const field of requiredFields) {
        if (!(field in data))
          throw new Error(`Missing required field: ${field}`);
      }

      // Normalize city names before returning
      const normalizedData: TravelRequest = {
        ...data,
        origin: normalizeCityName(data.origin),
        destination: normalizeCityName(data.destination),
      };
      console.log(
        "[Client Update] Original vs Normalized Cities:",
        { O_orig: data.origin, D_orig: data.destination },
        { O_norm: normalizedData.origin, D_norm: normalizedData.destination }
      );

      // Note: We setTravelDetails *after* this returns in handleSend
      return normalizedData; // Return normalized data
    } catch (error: any) {
      console.error("Error updating travel details:", error);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingId),
        {
          role: "assistant",
          content: `Sorry, couldn't update info. Try again.`,
        },
      ]);
      throw error;
    }
  };

  const fetchFlights = async (
    details: TravelRequest
  ): Promise<{
    departingFlights: Flight[];
    returningFlights: Flight[];
    hasReturn: boolean;
  } | null> => {
    console.log("[Client Flights] Fetching flights with details:", details);
    const flightStartTime = safePerformance.now();

    // Validate input
    if (
      !details ||
      !details.origin ||
      !details.destination ||
      details.origin === "unknown" ||
      details.destination === "unknown"
    ) {
      console.error("[Client Flights] Invalid flight details:", details);
      return null;
    }

    try {
      // Normalize city names before sending to API
      const normalizedOrigin = normalizeCityName(details.origin);
      const normalizedDestination = normalizeCityName(details.destination);

      // Double check that normalization happened properly
      if (
        normalizedOrigin === "unknown" ||
        normalizedDestination === "unknown"
      ) {
        console.error("[Client Flights] Normalization failed:", {
          origin: details.origin,
          destination: details.destination,
          normalizedOrigin,
          normalizedDestination,
        });
        return null;
      }

      console.log(
        `[Client Flights] Normalized cities: ${normalizedOrigin} → ${normalizedDestination}`
      );

      // Performance mark for API call start
      const apiStartTime = safePerformance.now();

      const response = await fetch("/api/flight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: normalizedOrigin,
          destination: normalizedDestination,
          date: details.start_date,
          returnDate: details.end_date !== "unknown" ? details.end_date : null,
        }),
      });

      // Calculate API response time
      const apiEndTime = safePerformance.now();
      console.log(
        `[Client Flights] API response time: ${(
          apiEndTime - apiStartTime
        ).toFixed(0)}ms`
      );

      console.log("Flight API response status:", response.status);

      if (!response.ok) {
        // Try to get error message from API
        let errorMessage = "Failed to fetch flights";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (_) {
          // If parsing JSON fails, use status text
          errorMessage = `Server error (${response.status}): ${response.statusText}`;
        }

        console.error("Flight API error:", errorMessage);
        return null;
      }

      const data = await response.json();
      console.log("Flight API response data:", data);

      if (
        (data.departingFlights && data.departingFlights.length > 0) ||
        (data.returningFlights && data.returningFlights.length > 0)
      ) {
        const flightData = {
          departingFlights: data.departingFlights || [],
          returningFlights: data.returningFlights || [],
          hasReturn: data.hasReturn,
        };

        // Calculate total function execution time
        const flightEndTime = safePerformance.now();
        console.log(
          `[Client Flights] Total execution time: ${(
            flightEndTime - flightStartTime
          ).toFixed(0)}ms`
        );

        return flightData;
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error fetching flights:", error);
      return null;
    }
  };

  const fetchWeather = async (
    details: TravelRequest
  ): Promise<{
    description: string;
    destination: string;
    forecasts: WeatherForecast[] | null;
    location: WeatherLocation | null;
  } | null> => {
    console.log("--- Fetching Weather (Client) ---");
    console.log("[Client Weather] Request Details:", details);
    const weatherStartTime = safePerformance.now();

    try {
      if (!details.destination || details.destination === "unknown") {
        console.error(
          "[Client Weather] Invalid destination:",
          details.destination
        );
        throw new Error("Missing destination for weather information");
      }

      const normalizedDestination = normalizeCityName(details.destination);
      console.log(
        `[Client Weather] Using normalized destination: '${normalizedDestination}' (original: '${details.destination}')`
      );

      // Performance mark for API call start
      const apiStartTime = safePerformance.now();

      const response = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: normalizedDestination,
          startDate: details.start_date,
          endDate: details.end_date,
        }),
      });

      // Calculate API response time
      const apiEndTime = safePerformance.now();
      console.log(
        `[Client Weather] API response time: ${(
          apiEndTime - apiStartTime
        ).toFixed(0)}ms`
      );

      console.log("[Client Weather] API Response Status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Client Weather] API Error Response Text:", errorText);
        throw new Error(
          `Failed to fetch weather (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      console.log("[Client Weather] API Response Data:", data);

      // Ensure essential data is present
      if (!data.description || !data.destination) {
        console.warn(
          "[Client Weather] Incomplete weather data received:",
          data
        );
        throw new Error("Incomplete weather data from API");
      }

      // Create the weather data object
      const weatherData = {
        description: data.description,
        destination: normalizedDestination,
        forecasts: data.forecasts || null,
        location: data.location || null,
      };

      // Calculate total function execution time
      const weatherEndTime = safePerformance.now();
      console.log(
        `[Client Weather] Total execution time: ${(
          weatherEndTime - weatherStartTime
        ).toFixed(0)}ms`
      );

      return weatherData;
    } catch (error: any) {
      console.error(
        "[Client Weather] Error fetching or processing weather:",
        error
      );
      return null;
    }
  };

  const fetchAttractions = async (
    city: string
  ): Promise<{
    city: string;
    attractions: Attraction[];
  } | null> => {
    console.log("[Client Attractions] Fetching attractions");
    const attractionStartTime = safePerformance.now();

    try {
      if (!city || city === "unknown") {
        console.error("[Client Attractions] Invalid city provided:", city);
        return {
          city: city || "unknown",
          attractions: [],
        };
      }

      // Normalize city name
      const normalizedCity = normalizeCityName(city);
      console.log(
        `[Client Attractions] Normalized city: '${normalizedCity}' (original: '${city}')`
      );

      // Performance mark for API call start
      const apiStartTime = safePerformance.now();

      const response = await fetch("/api/attractions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ city: normalizedCity }),
      });

      // Calculate API response time
      const apiEndTime = safePerformance.now();
      console.log(
        `[Client Attractions] API response time: ${(
          apiEndTime - apiStartTime
        ).toFixed(0)}ms`
      );

      if (!response.ok) {
        const errorMessage = `Failed to fetch attractions: ${response.status} ${response.statusText}`;
        console.error(errorMessage);
        return {
          city: normalizedCity,
          attractions: [],
        };
      }

      const data = await response.json();
      console.log(
        `[Client Attractions] Received data for ${normalizedCity}:`,
        data
      );

      if (!data || !data.attractions) {
        console.error(
          `[Client Attractions] Invalid data format for ${normalizedCity}:`,
          data
        );
        return {
          city: normalizedCity,
          attractions: [],
        };
      }

      console.log(
        `[Client Attractions] Found ${data.attractions.length} attractions for ${normalizedCity}`
      );

      // Ensure each attraction has the required fields
      const standardizedAttractions = data.attractions.map(
        (attraction: any) => ({
          title: attraction.title || `Attraction in ${normalizedCity}`,
          description:
            attraction.description ||
            `A popular attraction in ${normalizedCity}.`,
          address: attraction.address || normalizedCity,
          rating: attraction.rating || 4.5,
          reviews: attraction.reviews || 1000,
          website: attraction.website || "",
          thumbnail: attraction.thumbnail || "",
          hours: attraction.hours || "",
          phone: attraction.phone || "",
          place_id: attraction.place_id || "",
        })
      );

      // Calculate total function execution time
      const attractionEndTime = safePerformance.now();
      console.log(
        `[Client Attractions] Total execution time: ${(
          attractionEndTime - attractionStartTime
        ).toFixed(0)}ms`
      );

      return {
        city: normalizedCity,
        attractions: standardizedAttractions,
      };
    } catch (error) {
      console.error(`[Client Attractions] Error:`, error);
      return {
        city: normalizeCityName(city),
        attractions: [],
      };
    }
  };

  const processTravelInfo = async (
    travelDetails: TravelRequest,
    setChatLoading: (loading: boolean) => void,
    setMessages: (messages: Message[]) => void,
    messages: Message[],
    setChatInput: (input: string) => void,
    setChatMode: (mode: "gathering" | "general_qa") => void
  ) => {
    setChatLoading(true);
    try {
      console.log("Processing travel info with details:", travelDetails);

      // Verify that we have all required fields
      if (
        travelDetails.origin === "unknown" ||
        travelDetails.destination === "unknown" ||
        travelDetails.start_date === "unknown"
      ) {
        console.error("Missing required travel details:", travelDetails);
        setMessages([
          ...messages,
          {
            role: "assistant",
            content:
              "I need complete information about your trip. Please provide the origin, destination, and travel dates.",
          },
        ]);
        setChatMode("gathering");
        setChatLoading(false);
        return;
      }

      // Add a loading message with more detailed status
      const loadingId = `loading-results-${Date.now()}`;
      const loadingMessage: Message = {
        id: loadingId,
        role: "assistant",
        content: `Looking up travel options from ${capitalizeCityName(
          travelDetails.origin
        )} to ${capitalizeCityName(
          travelDetails.destination
        )}. This might take a moment...`,
      };

      // Update messages with loading message
      let currentMessages = [...messages, loadingMessage];
      setMessages(currentMessages);

      try {
        // Add performance marks to measure API fetch times
        safePerformance.mark("api-calls-start");

        // Fetch flights, weather, and attractions in parallel
        const [flightsResponse, weatherResponse, attractionsResponse] =
          await Promise.all([
            fetchFlights(travelDetails),
            fetchWeather(travelDetails),
            fetchAttractions(travelDetails.destination),
          ]);

        safePerformance.mark("api-calls-end");
        safePerformance.measure(
          "api-calls-duration",
          "api-calls-start",
          "api-calls-end"
        );
        const apiDuration =
          safePerformance.getEntriesByName("api-calls-duration")[0]?.duration ||
          0;
        console.log(`All API calls completed in ${apiDuration.toFixed(0)}ms`);

        // Update loading message to indicate data is being processed
        const processingMessage: Message = {
          id: loadingId,
          role: "assistant",
          content:
            "Processing your travel information and preparing results...",
        };
        currentMessages = currentMessages.map((msg) =>
          msg.id === loadingId ? processingMessage : msg
        );
        setMessages(currentMessages);

        // Short delay to ensure loading animation is visible (especially for cached results)
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Remove the loading message and add a summary message
        currentMessages = currentMessages.filter((msg) => msg.id !== loadingId);

        const summaryMessage: Message = {
          role: "assistant",
          content: `Here's what I found for your trip from ${capitalizeCityName(
            travelDetails.origin
          )} to ${capitalizeCityName(travelDetails.destination)} on ${
            travelDetails.start_date
          }:`,
        };

        currentMessages = [...currentMessages, summaryMessage];
        setMessages(currentMessages);

        // Add flights message if available
        if (flightsResponse) {
          const flightMessage: Message = {
            role: "assistant",
            flights: {
              ...flightsResponse,
              origin: travelDetails.origin,
              destination: travelDetails.destination,
            },
          };
          currentMessages = [...currentMessages, flightMessage];
          setMessages(currentMessages);
        }

        // Add weather message if available
        if (weatherResponse) {
          const weatherMessage: Message = {
            role: "assistant",
            weather: weatherResponse,
          };
          currentMessages = [...currentMessages, weatherMessage];
          setMessages(currentMessages);
        }

        // Add attractions message if available
        if (
          attractionsResponse &&
          attractionsResponse.attractions &&
          attractionsResponse.attractions.length > 0
        ) {
          const attractionsMessage: Message = {
            role: "assistant",
            attractions: attractionsResponse,
          };
          currentMessages = [...currentMessages, attractionsMessage];
          setMessages(currentMessages);
        }

        // Add a follow-up message
        const followUpMessage: Message = {
          role: "assistant",
          content: `I've found information for your trip to ${capitalizeCityName(
            travelDetails.destination
          )}. Let me know if you want to know anything else about the destination!`,
        };
        currentMessages = [...currentMessages, followUpMessage];
        setMessages(currentMessages);

        // Reset chat input and mode
        setChatInput("");
        setChatMode("general_qa");
      } catch (error) {
        console.error("Error processing travel info:", error);

        // Remove loading message and add error message
        currentMessages = currentMessages.filter((msg) => msg.id !== loadingId);
        currentMessages = [
          ...currentMessages,
          {
            role: "assistant",
            content:
              "Sorry, there was an error getting the travel details. Please try again.",
          },
        ];
        setMessages(currentMessages);
      }
    } catch (error) {
      console.error("Unexpected error processing travel info:", error);
      setMessages([
        ...messages,
        {
          role: "assistant",
          content:
            "I'm sorry, but I couldn't process your travel request. Please try again with different information.",
        },
      ]);
      setChatMode("general_qa");
    } finally {
      setChatLoading(false);
    }
  };

  // --- New function: handleGeneralQuery ---
  const handleGeneralQuery = async (query: string, destination: string) => {
    if (!destination || destination === "unknown") {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I need a destination before I can answer questions about it.",
        },
      ]);
      return;
    }

    setIsLoading(true);
    const loadingId = `loading-query-${Date.now()}`;
    const loadingMessage: Message = {
      id: loadingId,
      role: "assistant",
      content: "Thinking...",
    };
    // Get the current messages including the user's query
    let currentMessages = [...messages];
    // Add loading message
    currentMessages = [...currentMessages, loadingMessage];
    setMessages(currentMessages);

    try {
      const response = await fetch("/api/general_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, destination }),
      });

      // Remove loading message but preserve other messages
      currentMessages = currentMessages.filter((msg) => msg.id !== loadingId);
      setMessages(currentMessages);

      const data = await response.json(); // Try parsing JSON regardless of status first
      console.log("[Client Query] Parsed Response:", data);

      if (!response.ok) {
        // Use error from JSON if available, otherwise use status text
        throw new Error(
          data.error || `Request failed with status ${response.status}`
        );
      }

      // Check if the expected 'answer' field is present
      if (typeof data.answer !== "string") {
        console.error(
          "[Client Query] Invalid response format, missing 'answer':",
          data
        );
        throw new Error("Received an invalid response from the server.");
      }

      // Add the answer message
      const answerMessage: Message = {
        role: "assistant",
        content: data.answer,
      };
      currentMessages = [...currentMessages, answerMessage];
      setMessages(currentMessages);
    } catch (error: any) {
      console.error("Error handling general query:", error);
      // Make sure loading message is removed even if parsing response.json() fails
      currentMessages = currentMessages.filter((msg) => msg.id !== loadingId);

      // Add error message
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I couldn't answer that: ${error.message}`,
      };
      currentMessages = [...currentMessages, errorMessage];
      setMessages(currentMessages);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Updated handleSend ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add the user message to the chat
    const userMsg: Message = { role: "user", content: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Save the current input and clear it
    const currentInput = input;
    setInput("");

    // Branch based on chat mode
    if (chatMode === "gathering") {
      // --- Gathering Mode Logic ---
      try {
        if (waitingForFields) {
          try {
            // Update missing fields
            const updated = await updateMissingFields(
              currentInput,
              travelDetails
            );

            // Important: Set the state with updated details
            setTravelDetails(updated);

            const stillMissing = Object.entries(updated)
              .filter(([_, value]) => value === "unknown")
              .map(([key]) => {
                switch (key) {
                  case "start_date":
                    return "start date";
                  case "end_date":
                    return "end date";
                  case "origin":
                    return "departure city";
                  case "destination":
                    return "destination";
                  default:
                    return key;
                }
              });

            if (stillMissing.length > 0) {
              const missingMsg: Message = {
                role: "assistant",
                content: getMissingFieldsPrompt(stillMissing),
              };
              setMessages([...updatedMessages, missingMsg]);
            } else {
              setWaitingForFields(false);
              console.log("All fields collected, processing with:", updated);

              // Use the updated object directly, pass the updatedMessages to preserve user message
              await processTravelInfo(
                updated, // Use updated instead of travelDetails state
                setIsLoading,
                setMessages,
                updatedMessages, // Pass the updated messages array that includes user message
                setInput,
                setChatMode
              );
            }
          } catch (error) {
            /* Handled in updateMissingFields */
          }
        } else {
          try {
            // Parse travel request
            const parsed = await parseTravelRequest(currentInput);

            // Check for missing fields
            const unknown = Object.entries(parsed)
              .filter(([_, value]) => value === "unknown")
              .map(([key]) => {
                switch (key) {
                  case "start_date":
                    return "start date";
                  case "end_date":
                    return "end date";
                  case "origin":
                    return "departure city";
                  case "destination":
                    return "destination";
                  default:
                    return key;
                }
              });

            if (unknown.length > 0) {
              setWaitingForFields(true);
              const needMsg: Message = {
                role: "assistant",
                content: getMissingFieldsPrompt(unknown),
              };
              setMessages([...updatedMessages, needMsg]);
            } else {
              console.log(
                "All fields provided in initial request, processing with:",
                parsed
              );

              // Use the parsed object directly, pass the updatedMessages to preserve user message
              await processTravelInfo(
                parsed, // Use parsed instead of travelDetails state
                setIsLoading,
                setMessages,
                updatedMessages, // Pass the updated messages array that includes user message
                setInput,
                setChatMode
              );
            }
          } catch (error) {
            /* Handled in parseTravelRequest */
          }
        }
      } catch (error) {
        console.error("Unexpected error in gathering mode:", error);
        setMessages([
          ...updatedMessages,
          {
            role: "assistant",
            content: "An unexpected error occurred. Please try again.",
          },
        ]);
        setIsLoading(false);
      }
    } else {
      // --- General QA Mode Logic ---
      // Pass the current message collection to preserve history
      await handleGeneralQuery(currentInput, travelDetails.destination);
    }
  };

  // --- New Handler for Example Prompts ---
  const handleExamplePromptClick = (promptText: string) => {
    setInput(promptText);
    // Optional: Focus the input field after setting value
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm py-3 px-6 border-b border-gray-200 sticky top-0 z-10">
        <h1 className="text-xl font-semibold text-gray-800 flex items-center">
          <PlaneTakeoff
            className="h-5 w-5 mr-2.5 text-blue-600"
            strokeWidth={2}
          />
          Travel Tailor Agent
        </h1>
      </header>

      {/* Chat messages area - Fixed height calculation */}
      <div
        ref={scrollContainerRef}
        className="h-[calc(100vh-8rem)] overflow-y-auto px-4 md:px-6 pt-4 md:pt-6"
      >
        <div className="max-w-4xl mx-auto">
          <ChatMessageList className="space-y-4">
            {messages.length === 0 ? (
              <ChatBubble
                key="welcome"
                variant={"received"}
                ref={lastMessageRef}
              >
                <ChatBubbleAvatar fallback="AI" />
                <ChatBubbleMessage variant={"received"}>
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center">
                      <Sparkles className="w-5 h-5 mr-2 text-yellow-500" />
                      Welcome! How can I help plan your trip?
                    </h2>
                    <p className="text-sm text-gray-600">
                      I can find flights, check weather forecasts (or typical
                      conditions), and answer questions about your destination.
                    </p>
                    <div>
                      <h3 className="text-sm font-medium mb-1.5 text-gray-700">
                        Try asking:
                      </h3>
                      <div className="flex flex-col sm:flex-row gap-2">
                        {[
                          "Plan my trip from SF to Paris in early June",
                          "I'm thinking of going Rome next week",
                          "Recommend things to do in Tokyo in May",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => handleExamplePromptClick(prompt)}
                            className="text-left text-sm bg-blue-50 hover:bg-blue-100 text-blue-800 px-3 py-1.5 rounded-md transition-colors duration-150 cursor-pointer border border-blue-100"
                          >
                            &rarr; {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </ChatBubbleMessage>
              </ChatBubble>
            ) : (
              messages.map((msg, idx) => {
                const isLastMessage = idx === messages.length - 1;
                console.log(`Message ${idx} properties:`, {
                  role: msg.role,
                  hasContent: !!msg.content,
                  hasFlights: !!msg.flights,
                  hasWeather: !!msg.weather,
                  hasAttractions: !!msg.attractions,
                  attractionsCount: msg.attractions?.attractions?.length || 0,
                });

                // If it's a text message
                if (msg.content) {
                  // Check if this is a loading message
                  const isLoadingMessage = msg.id?.includes("loading");

                  return (
                    <ChatBubble
                      key={msg.id || idx}
                      variant={msg.role === "user" ? "sent" : "received"}
                      ref={isLastMessage ? lastMessageRef : null}
                    >
                      <ChatBubbleAvatar
                        fallback={msg.role === "user" ? "Me" : "AI"}
                      />
                      <ChatBubbleMessage
                        variant={msg.role === "user" ? "sent" : "received"}
                      >
                        {msg.content}
                        {isLoadingMessage && (
                          <span className="ml-2 inline-block">
                            <LoadingDots />
                          </span>
                        )}
                      </ChatBubbleMessage>
                    </ChatBubble>
                  );
                }

                // If it's a flight, weather, or attractions message
                if (msg.flights || msg.weather || msg.attractions) {
                  return (
                    <div
                      key={msg.id || idx}
                      className="flex items-start space-x-3 w-full my-3"
                      ref={isLastMessage ? lastMessageRef : null}
                    >
                      <ChatBubbleAvatar fallback="AI" />
                      <div className="flex-1 overflow-hidden">
                        {msg.flights && (
                          <div className="mt-1">
                            <h3 className="text-md font-semibold mb-2 text-blue-700 flex items-center">
                              <span className="mr-2">🛫</span>
                              Departing Flights:{" "}
                              {capitalizeCityName(msg.flights.origin)} to{" "}
                              {capitalizeCityName(msg.flights.destination)}
                            </h3>
                            {msg.flights.departingFlights.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {msg.flights.departingFlights.map((flight) => (
                                  <FlightCard
                                    key={`dep-${flight.option}-${flight.price}`}
                                    flight={flight}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                No departing flights found.
                              </p>
                            )}
                            {msg.flights.hasReturn && (
                              <>
                                <h3 className="text-md font-semibold mt-4 mb-2 text-blue-700 flex items-center">
                                  <span className="mr-2">🛬</span>
                                  Returning Flights:{" "}
                                  {capitalizeCityName(
                                    msg.flights.destination
                                  )}{" "}
                                  to {capitalizeCityName(msg.flights.origin)}
                                </h3>
                                {msg.flights.returningFlights.length > 0 ? (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {msg.flights.returningFlights.map(
                                      (flight) => (
                                        <FlightCard
                                          key={`ret-${flight.option}-${flight.price}`}
                                          flight={flight}
                                        />
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500 italic">
                                    No returning flights found.
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )}
                        {msg.weather && (
                          <div className="mt-1 space-y-2">
                            <Card className="rounded-lg border border-orange-200 shadow-sm overflow-hidden bg-white transition-all duration-200 hover:shadow-md">
                              <CardHeader className="p-0">
                                <div className=" text-orange-900 font-semibold px-4 py-0 text-lg leading-tight flex items-center">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-5 w-5 mr-2 text-orange-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                    />
                                  </svg>
                                  <span>
                                    Typical Weather in{" "}
                                    {capitalizeCityName(
                                      msg.weather.destination
                                    )}
                                  </span>
                                </div>
                              </CardHeader>
                              <CardContent className="p-3">
                                <p className="text-gray-700 text-sm leading-relaxed">
                                  {msg.weather.description}
                                </p>
                              </CardContent>
                            </Card>
                            {msg.weather.forecasts &&
                              msg.weather.forecasts.length > 0 && (
                                <div>
                                  <h3 className="text-md font-semibold mb-2 text-blue-700 flex items-center">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4 mr-1.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                      />
                                    </svg>
                                    Weather Forecast for{" "}
                                    {capitalizeCityName(
                                      msg.weather.destination
                                    )}
                                  </h3>
                                  <ScrollArea className="w-full whitespace-nowrap pb-3">
                                    <div className="flex w-max space-x-2 p-1">
                                      {msg.weather.forecasts.map(
                                        (forecast, index) => {
                                          const date = new Date(forecast.date);
                                          const formattedDate =
                                            date.toLocaleDateString("en-US", {
                                              weekday: "short",
                                              month: "short",
                                              day: "numeric",
                                              timeZone: "UTC",
                                            });
                                          const maxTemp = Math.round(
                                            forecast.maxTemperature
                                          );
                                          const minTemp = Math.round(
                                            forecast.minTemperature
                                          );
                                          const windSpeed = Math.round(
                                            forecast.windSpeed
                                          );
                                          const precipProb =
                                            forecast.precipitationProbability;

                                          return (
                                            <Card
                                              key={index}
                                              className="bg-white shadow rounded-lg border border-gray-200 hover:shadow-md transition-shadow overflow-hidden w-[120px] shrink-0"
                                            >
                                              <CardHeader className="px-2 py-1 text-center">
                                                <div className="font-medium text-sm text-gray-700">
                                                  {formattedDate}
                                                </div>
                                              </CardHeader>
                                              <CardContent className="p-1.5 space-y-0.5 text-sm">
                                                <div className="text-center font-semibold mb-0.5">
                                                  <span className="text-lg text-gray-800">
                                                    {maxTemp}°
                                                  </span>
                                                  <span className="text-gray-400 mx-0.5">
                                                    /
                                                  </span>
                                                  <span className="text-lg text-gray-500">
                                                    {minTemp}°
                                                  </span>
                                                  <span className="text-xs text-gray-400 font-normal ml-0.5">
                                                    F
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                  <span className="text-gray-500 flex items-center">
                                                    <Wind className="w-3 h-3 mr-1 text-gray-400" />
                                                    Wind
                                                  </span>
                                                  <span className="font-medium text-gray-600">
                                                    {windSpeed} mph
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                  <span className="text-gray-500 flex items-center">
                                                    <Droplets className="w-3 h-3 mr-1 text-blue-400" />
                                                    Precip
                                                  </span>
                                                  <span className="font-medium text-gray-600">
                                                    {precipProb}%
                                                  </span>
                                                </div>
                                              </CardContent>
                                            </Card>
                                          );
                                        }
                                      )}
                                    </div>
                                    <ScrollBar orientation="horizontal" />
                                  </ScrollArea>
                                </div>
                              )}
                          </div>
                        )}
                        {msg.attractions && (
                          <div className="mt-6 mb-4 border-t border-indigo-100 pt-4">
                            <div className="flex items-center bg-indigo-50 p-2 rounded-lg mb-3">
                              <MapPin className="h-5 w-5 text-indigo-500 mr-1.5" />
                              <h3 className="text-md font-semibold text-indigo-700">
                                {msg.attractions.attractions &&
                                msg.attractions.attractions.length > 0
                                  ? `Top Attractions in ${capitalizeCityName(
                                      msg.attractions.city
                                    )}`
                                  : `No attractions found for ${capitalizeCityName(
                                      msg.attractions.city
                                    )}`}
                              </h3>
                            </div>

                            {msg.attractions.attractions &&
                            msg.attractions.attractions.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {msg.attractions.attractions.map(
                                  (attraction, idx) => (
                                    <AttractionCard
                                      key={`${attraction.title}-${idx}`}
                                      attraction={attraction}
                                    />
                                  )
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 italic p-3">
                                I couldn't find attractions information for this
                                location. Please try another city.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                return null;
              })
            )}
          </ChatMessageList>
        </div>
      </div>

      {/* Chat input area - Fixed at bottom */}
      <div className="h-20 border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-2">
            <ChatInput
              ref={inputRef}
              placeholder="Ask about flights, weather, or your destination..."
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInput(e.target.value)
              }
              onSend={handleSend}
              disabled={isLoading}
              className="flex-1 bg-white rounded-lg border-gray-300 focus:border-blue-400 shadow-sm resize-none"
            />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              <SendHorizontal className="h-5 w-5" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
