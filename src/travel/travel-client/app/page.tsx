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
} from "lucide-react";
import { TravelRequest } from "../lib/claude";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";

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
        <div className="text-sm text-gray-500 ml-5">
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
        <div className="text-sm text-gray-500">{segment.arrival.formatted}</div>
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

      setTravelDetails(normalizedData); // Set state with normalized data
      return normalizedData; // Return normalized data
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

  const fetchFlights = async (details: TravelRequest) => {
    console.log("Fetching flights with details:", details);
    try {
      const response = await fetch("/api/flight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: details.origin,
          destination: details.destination,
          date: details.start_date,
          returnDate: details.end_date !== "unknown" ? details.end_date : null,
        }),
      });
      console.log("Flight API response status:", response.status);
      if (!response.ok) throw new Error("Failed to fetch flights");
      const data = await response.json();
      console.log("Flight API response data:", data);

      if (
        (data.departingFlights && data.departingFlights.length > 0) ||
        (data.returningFlights && data.returningFlights.length > 0)
      ) {
        const flightMessage: Message = {
          role: "assistant",
          flights: {
            departingFlights: data.departingFlights || [],
            returningFlights: data.returningFlights || [],
            hasReturn: data.hasReturn,
            origin: details.origin,
            destination: details.destination,
          },
        };
        setMessages((prev) => [...prev, flightMessage]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I couldn't find any flights for that route or date.",
          },
        ]);
      }
    } catch (error) {
      console.error("Error fetching flights:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, an error occurred while searching for flights.",
        },
      ]);
    }
  };

  const fetchWeather = async (details: TravelRequest) => {
    console.log("--- Fetching Weather (Client) ---");
    console.log("[Client Weather] Request Details:", details);
    try {
      const response = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: details.destination,
          startDate: details.start_date,
          endDate: details.end_date,
        }),
      });
      console.log("[Client Weather] API Response Status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Client Weather] API Error Response Text:", errorText);
        throw new Error(`Failed to fetch weather (${response.status})`);
      }
      const data = await response.json();
      console.log("[Client Weather] API Response Data Parsed:", data);

      // Ensure essential data is present
      if (!data.description || !data.destination) {
        console.warn(
          "[Client Weather] Incomplete weather data received:",
          data
        );
        throw new Error("Incomplete weather data from API");
      }

      // Create the weather message object
      const weatherMessage: Message = {
        role: "assistant",
        weather: {
          description: data.description,
          destination: data.destination,
          forecasts: data.forecasts || null, // Assign null if missing
          location: data.location || null, // Assign null if missing
        },
      };
      console.log(
        "[Client Weather] Created Weather Message Object:",
        weatherMessage
      );

      setMessages((prev) => {
        console.log("[Client Weather] Adding weather message to state.");
        return [...prev, weatherMessage];
      });
    } catch (error: any) {
      console.error(
        "[Client Weather] Error fetching or processing weather:",
        error
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, an error occurred while fetching weather information: ${error.message}`,
        },
      ]);
    }
  };

  const processTravelInfo = async (details: TravelRequest) => {
    setIsLoading(true);
    const loadingId = `loading-results-${Date.now()}`;
    const loadingMessage: Message = {
      id: loadingId,
      role: "assistant",
      content: "Thanks! Looking up flights and weather for you now...",
    };
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      await Promise.all([fetchFlights(details), fetchWeather(details)]);
      // Add follow-up message after results are added by fetch functions
      const followUpMessage: Message = {
        role: "assistant",
        content: `Okay, I've found flights and weather info for ${capitalizeCityName(
          details.destination
        )}. Let me know if you want to know anything else about the destination!`,
      };
      // Use setTimeout to ensure it appears after flight/weather messages
      setTimeout(() => {
        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== loadingId),
          followUpMessage,
        ]); // Remove loading & add follow-up
        setChatMode("general_qa"); // <-- Transition mode
        setIsLoading(false);
      }, 100); // Small delay to allow state updates from fetches
    } catch (error) {
      console.error("Error processing travel info fetches:", error);
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== loadingId),
        {
          role: "assistant",
          content: "Sorry, there was an error getting the travel details.",
        },
      ]);
      setIsLoading(false);
    }
    // Removed finally block as state is set within try/catch
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
    setMessages((prev) => [...prev, loadingMessage]);

    try {
      const response = await fetch("/api/general_query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, destination }),
      });

      setMessages((prev) => prev.filter((msg) => msg.id !== loadingId)); // Remove loading

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

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    } catch (error: any) {
      console.error("Error handling general query:", error);
      // Make sure loading message is removed even if parsing response.json() fails
      setMessages((prev) => prev.filter((msg) => msg.id !== loadingId));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I couldn't answer that: ${error.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Updated handleSend ---
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput("");

    // Branch based on chat mode
    if (chatMode === "gathering") {
      // --- Gathering Mode Logic ---
      try {
        if (waitingForFields) {
          try {
            const updated = await updateMissingFields(
              currentInput,
              travelDetails
            );
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
              setMessages((prev) => [...prev, missingMsg]);
            } else {
              setWaitingForFields(false);
              await processTravelInfo(updated); // Process & transition mode
            }
          } catch (error) {
            /* Handled in updateMissingFields */
          }
        } else {
          try {
            const parsed = await parseTravelRequest(currentInput);
            // travelDetails set inside parseTravelRequest
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
              setMessages((prev) => [...prev, needMsg]);
            } else {
              await processTravelInfo(parsed); // Process & transition mode
            }
          } catch (error) {
            /* Handled in parseTravelRequest */
          }
        }
      } catch (error) {
        console.error("Unexpected error in gathering mode:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "An unexpected error occurred. Please try again.",
          },
        ]);
        setIsLoading(false); // Ensure loading stops
      }
    } else {
      // --- General QA Mode Logic ---
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
          Travel Assistant
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
                          "Flights from SF to Paris in early June",
                          "Weather in Rome next week",
                          "Recommend things to do in Tokyo",
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

                // If it's a text message
                if (msg.content) {
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
                      </ChatBubbleMessage>
                    </ChatBubble>
                  );
                }

                // If it's a flight or weather message
                if (msg.flights || msg.weather) {
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
