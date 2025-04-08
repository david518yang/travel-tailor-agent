from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
from dotenv import load_dotenv
import asyncio
from datetime import datetime

app = FastAPI()

CITY_TO_AIRPORT = {
    "new york": ["JFK", "LGA", "EWR"],
    "london": ["LHR", "LGW", "STN"],
    "paris": ["CDG", "ORY"],
    "tokyo": ["HND", "NRT"],
    "seoul": "ICN",
    "los angeles": "LAX",
    "chicago": ["ORD", "MDW"],
    "beijing": "PEK",
    "shanghai": "PVG",
    "dubai": "DXB",
    "singapore": "SIN",
    "hong kong": "HKG",
    "sydney": "SYD",
    "melbourne": "MEL",
    "san francisco": "SFO",
    "austin": "AUS",
    "seattle": "SEA",
    "miami": "MIA",
    "dallas": "DFW",
    "houston": "IAH",
    "atlanta": "ATL",
    "boston": "BOS",
    "washington": ["IAD", "DCA"],
    "denver": "DEN",
    "las vegas": "LAS",
    "toronto": "YYZ",
    "vancouver": "YVR",
    "montreal": "YUL",
}

class FlightRequest(BaseModel):
    departure_location: str
    arrival_location: str
    departure_date_and_time: str
    return_date: Optional[str] = None

class WeatherRequest(BaseModel):
    location: str
    dates: List[str]

def get_airport_code(city: str) -> str:
    """
    Convert a city name to its primary airport code.
    For cities with multiple airports, returns the main airport code.
    """
    city = city.lower().strip()
    if city in CITY_TO_AIRPORT:
        codes = CITY_TO_AIRPORT[city]
        return codes[0] if isinstance(codes, list) else codes
    return city.upper()  # If not found, assume the input might be an airport code

@app.post("/get_flight")
async def get_flight(request: FlightRequest):
    """
    Search for flights using the Google Flights API via SerpApi.
    """
    try:
        load_dotenv()
        api_key = os.getenv("SERPAPI_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="SERPAPI_KEY environment variable not set.")

        departure_code = get_airport_code(request.departure_location)
        arrival_code = get_airport_code(request.arrival_location)

        try:
            date_obj = datetime.strptime(request.departure_date_and_time.split()[0], "%Y-%m-%d")
            formatted_date = date_obj.strftime("%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

        params = {
            "engine": "google_flights",
            "departure_id": departure_code,
            "arrival_id": arrival_code,
            "outbound_date": formatted_date,
            "currency": "USD",
            "hl": "en",
            "api_key": api_key
        }

        # Add return date if provided (for round trips)
        if request.return_date:
            try:
                return_date_obj = datetime.strptime(request.return_date, "%Y-%m-%d")
                params["return_date"] = return_date_obj.strftime("%Y-%m-%d")
                params["type"] = "1"  # Round trip
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid return date format. Use YYYY-MM-DD.")
        else:
            params["type"] = "2"  # One way

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://serpapi.com/search",
                params=params,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()

            # Format the flight results
            result = []
            flights = data.get("best_flights", []) + data.get("other_flights", [])
            
            if not flights:
                return "No flights found for the specified route and dates."

            for idx, flight in enumerate(flights[:5]):  # top 5 flights
                flight_info = [f"Option {idx + 1}:"]
                
                price = flight.get("price")
                if price:
                    flight_info.append(f"Price: ${price}")

                total_duration = flight.get("total_duration")
                if total_duration:
                    hours = total_duration // 60
                    minutes = total_duration % 60
                    flight_info.append(f"Duration: {hours}h {minutes}m")

                for segment in flight.get("flights", []):
                    dep = segment["departure_airport"]
                    arr = segment["arrival_airport"]
                    airline = segment.get("airline", "Unknown Airline")
                    flight_num = segment.get("flight_number", "")
                    
                    flight_info.append(
                        f"\n{airline} {flight_num}"
                        f"\n{dep['id']} {dep['time']} → {arr['id']} {arr['time']}"
                    )

                    if "layovers" in flight:
                        for layover in flight["layovers"]:
                            duration = layover.get("duration", 0)
                            hours = duration // 60
                            minutes = duration % 60
                            flight_info.append(
                                f"Layover at {layover['id']}: {hours}h {minutes}m"
                            )

                result.append("\n".join(flight_info))
                result.append("-" * 40)

            return "\n".join(result)

    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Error fetching flight information: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@app.post("/get_weather")
async def get_weather(request: WeatherRequest):
    """
    Get weather information for a location and dates.
    """
    # TODO: Implement weather API integration
    return f"Weather forecast for {request.location} on dates {request.dates}"

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
