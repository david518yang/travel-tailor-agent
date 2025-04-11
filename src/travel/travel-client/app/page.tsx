"use client";

import React, { useState, useEffect } from "react";
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
import { ChevronsUpDown, Wind, Droplets } from "lucide-react";
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
                  View Full Itinerary ({segments.length - 1} more stop
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
      setTravelDetails(data);
      return data;
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
      return data;
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
    const processingMsg: Message = {
      role: "assistant",
      content:
        "Thanks for providing your travel details! Searching for flights and checking weather...",
    };
    setMessages((prev) => [...prev, processingMsg]);
    await fetchFlights(details);
    await fetchWeather(details);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      if (waitingForFields) {
        try {
          const before = Object.entries(travelDetails)
            .filter(([_, value]) => value === "unknown")
            .map(([key]) => key);
          console.log("Fields unknown BEFORE update:", before);

          const updated = await updateMissingFields(input, travelDetails);

          setTravelDetails(updated);

          const after = Object.entries(updated)
            .filter(([_, value]) => value === "unknown")
            .map(([key]) => key);
          console.log("Fields unknown AFTER update:", after);

          const stillMissing = after.map((key) => {
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
            await processTravelInfo(updated);
          }
        } catch (error) {}
      } else {
        try {
          const parsed = await parseTravelRequest(input);
          setTravelDetails(parsed);

          const unknown = Object.entries(parsed)
            .filter(([_, value]) => value === "unknown")
            .map(([key]) => key);
          console.log("Fields still unknown after parsing:", unknown);

          const missing = unknown.map((key) => {
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

          if (missing.length > 0) {
            setWaitingForFields(true);
            const needMsg: Message = {
              role: "assistant",
              content: getMissingFieldsPrompt(missing),
            };
            setMessages((prev) => [...prev, needMsg]);
          } else {
            await processTravelInfo(parsed);
          }
        } catch (error) {}
      }
    } catch (error) {
      console.error("Unexpected error in message handling:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered an unexpected error. Please try again.",
        },
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-6 border-b border-blue-100">
        <h1 className="text-xl font-semibold text-blue-800 flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 mr-2 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Travel Assistant
        </h1>
      </header>

      {/* Chat messages area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200 p-4">
          <ChatMessageList>
            {messages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="mb-4">
                  Welcome to your personal travel assistant!
                </p>
                <p>
                  Tell me about your travel plans (e.g., "flights from New York
                  to Paris from June 1st to June 10th").
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                // If it's a text message, render the standard bubble
                if (msg.content) {
                  return (
                    <ChatBubble
                      key={msg.id || idx}
                      variant={msg.role === "user" ? "sent" : "received"}
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

                // If it's a flight or weather message, render it directly without the bubble message wrapper
                if (msg.flights || msg.weather) {
                  return (
                    <div
                      key={msg.id || idx}
                      className="flex items-start space-x-3 w-full my-3"
                    >
                      {" "}
                      {/* Outer container with avatar alignment */}
                      <ChatBubbleAvatar fallback="AI" />
                      <div className="flex-1 overflow-hidden">
                        {" "}
                        {/* Container for the actual content */}
                        {msg.flights && (
                          <div className="mt-1">
                            {" "}
                            {/* Adjusted margin slightly */}
                            {/* Departing Flights Title - Apply capitalization */}
                            <h3 className="text-md font-semibold mb-2 text-blue-700 flex items-center">
                              <span className="mr-2">🛫</span>
                              Departing Flights:{" "}
                              {capitalizeCityName(msg.flights.origin)} to{" "}
                              {capitalizeCityName(msg.flights.destination)}
                            </h3>
                            {/* Departing Flights Grid */}
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
                            {/* Returning Flights Section (Conditional) */}
                            {msg.flights.hasReturn && (
                              <>
                                {/* Returning Flights Title - Apply capitalization */}
                                <h3 className="text-md font-semibold mt-4 mb-2 text-blue-700 flex items-center">
                                  <span className="mr-2">🛬</span>
                                  Returning Flights:{" "}
                                  {capitalizeCityName(
                                    msg.flights.destination
                                  )}{" "}
                                  to {capitalizeCityName(msg.flights.origin)}
                                </h3>
                                {/* Returning Flights Grid */}
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
                            {" "}
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
                            {/* Updated: Forecast Weather Section (Conditional) */}
                            {msg.weather.forecasts &&
                              msg.weather.forecasts.length > 0 && (
                                <div>
                                  {/* Forecast Title */}
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
                                  {/* Scrollable Forecast Cards Area */}
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
                                                {/* Temperatures - Inline Hi/Lo */}
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
                                                {/* Wind */}
                                                <div className="flex justify-between items-center text-xs">
                                                  <span className="text-gray-500 flex items-center">
                                                    <Wind className="w-3 h-3 mr-1 text-gray-400" />
                                                    Wind
                                                  </span>
                                                  <span className="font-medium text-gray-600">
                                                    {windSpeed} mph
                                                  </span>
                                                </div>
                                                {/* Precipitation */}
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

                // Return null or an empty fragment if the message type is somehow unexpected
                return null;
              })
            )}
          </ChatMessageList>
        </div>
      </div>

      {/* Chat input area */}
      <div className="border-t border-blue-100 p-4 bg-white sticky bottom-0 shadow-md">
        <ChatInput
          placeholder="Tell me about your travel plans..."
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setInput(e.target.value)
          }
          onSend={handleSend}
          className="bg-white rounded-lg border-blue-200 focus:border-blue-400 shadow-sm"
        />
      </div>
    </div>
  );
}
