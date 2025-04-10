"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { ChatMessageList } from "../components/ui/chat/chat-message-list";
import { ChatInput } from "../components/ui/chat/chat-input";
import {
  ChatBubble,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "../components/ui/chat/chat-bubble";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Flight = {
  option: string;
  price: string;
  duration: string;
  details: string[];
};

import { TravelRequest } from "../lib/claude";

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

const FlightCard = ({ flight }: { flight: any }) => {
  const airlineInfo = flight.details[0] || "Flight";

  const formatDateTime = (dateTimeStr: string) => {
    // Expected format: YYYY-MM-DD HH:MM
    const [date, time] = dateTimeStr.split(" ");
    if (!date || !time) return dateTimeStr; // Return original if format unexpected

    try {
      const dateObj = new Date(date + "T" + time);
      const month = (dateObj.getMonth() + 1).toString(); // Remove padStart
      const day = dateObj.getDate().toString(); // Remove padStart
      const year = dateObj.getFullYear().toString().slice(2);
      const hours = dateObj.getHours().toString(); // Remove padStart
      const minutes = dateObj.getMinutes().toString().padStart(2, "0"); // Keep minutes padded

      return `${month}/${day}/${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateTimeStr; // Return original if parsing fails
    }
  };

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="text-lg font-medium flex items-center space-x-2 pb-1 px-0">
        <span className="text-blue-600">✈️</span>
        <span>{airlineInfo}</span>
      </CardHeader>
      <CardContent className="space-y-3 pt-2 px-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-green-600">💰</span>
            <span className="font-semibold text-lg">{flight.price}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-600">⏱️</span>
            <span className="font-medium">{flight.duration}</span>
          </div>
        </div>
        <div className="space-y-2">
          {flight.details.slice(1).map((detail: string, i: number) => {
            if (detail.includes("→")) {
              const [departure, arrival] = detail
                .split("→")
                .map((s) => s.trim());

              // Parse departure and arrival information
              const [depAirport, ...depParts] = departure.split(" ");
              const [arrAirport, ...arrParts] = arrival.split(" ");

              // Format the date and time parts
              const depDateTime = formatDateTime(depParts.join(" "));
              const arrDateTime = formatDateTime(arrParts.join(" "));

              return (
                <div
                  key={i}
                  className="flex items-center space-x-3 text-gray-600"
                >
                  <div className="flex-1">
                    <div className="flex items-center mb-1">
                      <span className="mr-2">🛫</span>
                      <span className="font-medium">{depAirport}</span>
                    </div>
                    <div className="text-sm text-gray-500 ml-6">
                      {depDateTime}
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <span className="text-blue-400 px-2">→</span>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center justify-end mb-1">
                      <span className="font-medium">{arrAirport}</span>
                      <span className="ml-2">🛬</span>
                    </div>
                    <div className="text-sm text-gray-500">{arrDateTime}</div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={i}
                className="flex items-center space-x-2 text-gray-600"
              >
                <span>📍</span>
                <span>{detail}</span>
              </div>
            );
          })}
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
  const [showFlightOptions, setShowFlightOptions] = useState<boolean>(false);
  const [flightResults, setFlightResults] = useState<Flight[]>([]);
  const [isLoadingFlights, setIsLoadingFlights] = useState<boolean>(false);
  const [weatherInfo, setWeatherInfo] = useState<string | null>(null);

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

    if (missing.length === 1) {
      return `Please provide the ${missing[0]}:`;
    } else if (missing.length === 2) {
      return `Please provide the ${missing[0]} and ${missing[1]}:`;
    } else {
      const lastField = missing.pop();
      return `Please provide the ${missing.join(", ")}, and ${lastField}:`;
    }
  };

  const parseTravelRequest = async (prompt: string): Promise<TravelRequest> => {
    try {
      const loadingId = `loading-${Date.now()}`;

      const loadingMessage = {
        id: loadingId,
        role: "assistant",
        content: "Processing your request...",
      };

      setMessages((prev) => [...prev, loadingMessage as any]);

      const res = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      setMessages((prev) =>
        prev.filter((msg) => !(msg as any).id || (msg as any).id !== loadingId)
      );

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
        if (!(field in data)) {
          throw new Error(`Missing required field in response: ${field}`);
        }
      }

      setTravelDetails(data);

      return data;
    } catch (error: any) {
      console.error("Error parsing travel request:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I had trouble understanding your request. Please try again with more details.`,
        },
      ]);
      throw error;
    }
  };

  const updateMissingFields = async (
    userInput: string,
    currentDetails: TravelRequest
  ): Promise<TravelRequest> => {
    try {
      const loadingId = `loading-${Date.now()}`;

      const loadingMessage = {
        id: loadingId,
        role: "assistant",
        content: "Processing...",
      };

      setMessages((prev) => [...prev, loadingMessage as any]);

      const res = await fetch("/api/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userInput,
          currentDetails,
        }),
      });

      setMessages((prev) =>
        prev.filter((msg) => !(msg as any).id || (msg as any).id !== loadingId)
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update travel details");
      }

      const data = await res.json();

      const requiredFields = [
        "start_date",
        "end_date",
        "origin",
        "destination",
      ];
      for (const field of requiredFields) {
        if (!(field in data)) {
          throw new Error(`Missing required field in response: ${field}`);
        }
      }

      return data;
    } catch (error: any) {
      console.error("Error updating travel details:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I couldn't update your travel information. Please try providing the details again.`,
        },
      ]);
      throw error;
    }
  };

  const fetchFlights = async (details: TravelRequest) => {
    setIsLoadingFlights(true);
    console.log("Fetching flights with details:", details);
    try {
      const response = await fetch("/api/flight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: details.origin,
          destination: details.destination,
          date: details.start_date,
        }),
      });

      console.log("Flight API response status:", response.status);

      if (!response.ok) {
        throw new Error("Failed to fetch flights");
      }

      const data = await response.json();
      console.log("Flight API response data:", data);

      if (data.flights && Array.isArray(data.flights)) {
        console.log("Number of flights received:", data.flights.length);
        setFlightResults(data.flights);
        setShowFlightOptions(true);
      } else {
        console.log("Invalid flight data received:", data);
        setFlightResults([]);
      }
    } catch (error) {
      console.error("Error fetching flights:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered an error while searching for flights. Please try again.",
        },
      ]);
      setFlightResults([]);
    } finally {
      setIsLoadingFlights(false);
    }
  };

  const processTravelInfo = async (details: TravelRequest) => {
    const processingMsg: Message = {
      role: "assistant",
      content:
        "Thanks for providing your travel details! Searching for flights now...",
    };
    setMessages((prev) => [...prev, processingMsg]);
    await fetchFlights(details);
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
        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200">
          <ChatMessageList className="p-4">
            {messages.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="mb-4">
                  Welcome to your personal travel assistant!
                </p>
                <p>
                  Tell me about your travel plans and I'll help you find flights
                  and check the weather.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <ChatBubble
                  key={idx}
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
              ))
            )}
          </ChatMessageList>
        </div>

        {showFlightOptions && (
          <div className="mt-6 animate-fadeIn">
            <h2 className="text-xl font-bold mb-4 text-blue-800 flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              Flight Options
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoadingFlights ? (
                <div className="col-span-full flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
                </div>
              ) : flightResults.length > 0 ? (
                flightResults.map((flight) => (
                  <FlightCard key={flight.option} flight={flight} />
                ))
              ) : (
                <div className="col-span-full text-center text-gray-500 py-8">
                  No flights found for this route. Try different dates or
                  locations.
                </div>
              )}
            </div>
          </div>
        )}

        {weatherInfo && (
          <div className="mt-6">
            <Card className="border-blue-100 shadow-md overflow-hidden">
              <CardHeader className="bg-blue-50 text-blue-800 font-medium border-b border-blue-100">
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 mr-2 text-blue-600"
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
                  Weather Forecast
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{weatherInfo}</p>
              </CardContent>
            </Card>
          </div>
        )}
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
