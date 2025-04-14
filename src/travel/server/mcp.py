from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
from dotenv import load_dotenv
import asyncio
from datetime import datetime
from openmeteo_py import OWmanager
from typing import Dict, Any

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
    destination: str
    startDate: str
    endDate: str

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

        # Prepare parameters for departure flight
        departure_params = {
            "engine": "google_flights",
            "departure_id": departure_code,
            "arrival_id": arrival_code,
            "outbound_date": formatted_date,
            "currency": "USD",
            "hl": "en",
            "api_key": api_key,
            "type": "2"  # One way
        }

        # If return date is provided, prepare parameters for return flight
        return_params = None
        if request.return_date:
            try:
                return_date_obj = datetime.strptime(request.return_date, "%Y-%m-%d")
                return_params = {
                    "engine": "google_flights",
                    "departure_id": arrival_code,  # Swapped
                    "arrival_id": departure_code,  # Swapped
                    "outbound_date": return_date_obj.strftime("%Y-%m-%d"),
                    "currency": "USD",
                    "hl": "en",
                    "api_key": api_key,
                    "type": "2"  # One way
                }
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid return date format. Use YYYY-MM-DD.")

        async with httpx.AsyncClient() as client:
            # Create tasks for parallel execution
            tasks = [client.get("https://serpapi.com/search", params=departure_params, timeout=30.0)]
            if return_params:
                tasks.append(client.get("https://serpapi.com/search", params=return_params, timeout=30.0))
            
            # Execute API calls in parallel
            responses = await asyncio.gather(*tasks, return_exceptions=True)

            # Process departure flight results
            departure_response = responses[0]
            if isinstance(departure_response, Exception):
                raise departure_response
            departure_data = departure_response.json()
            departure_flights = departure_data.get("best_flights", []) + departure_data.get("other_flights", [])

            # Process return flight results if available
            return_flights = []
            if return_params and len(responses) > 1:
                return_response = responses[1]
                if isinstance(return_response, Exception):
                    print(f"Error fetching return flights: {return_response}")
                else:
                    return_data = return_response.json()
                    return_flights = return_data.get("best_flights", []) + return_data.get("other_flights", [])

            # Format flight results
            result = []
            for idx, flight in enumerate(departure_flights[:5]):
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
    try:
        # Parse dates as UTC
        start_date_obj = datetime.strptime(request.startDate, "%Y-%m-%d")
        end_date_obj = datetime.strptime(request.endDate, "%Y-%m-%d")

        # Format dates for Claude prompt
        formatted_start_date = start_date_obj.strftime("%B %d")
        formatted_end_date = end_date_obj.strftime("%B %d")

        # Call Claude for historical description
        load_dotenv()
        claude_api_key = os.getenv("ANTHROPIC_API_KEY")
        if not claude_api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY environment variable not set")

        prompt = f"What is the typical weather in {request.destination} between {formatted_start_date} and {formatted_end_date}? Keep it under 3 or 4 sentences but talk about the weather patterns around that time of year in that location. Use fahrenheit for units and metric units for wind speed."
        
        # Prepare API call parameters
        claude_request = {
            "url": "https://api.anthropic.com/v1/messages",
            "headers": {
                "x-api-key": claude_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            "json": {
                "model": "claude-3-sonnet-20240229",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            }
        }

        weather_params = {
            "latitude": 37.5503,
            "longitude": 126.9971,
            "daily": [
                "temperature_2m_max",
                "temperature_2m_min",
                "wind_speed_10m_max",
                "precipitation_probability_max",
            ],
            "forecast_days": 16,
            "wind_speed_unit": "mph",
            "temperature_unit": "fahrenheit",
        }

        async with httpx.AsyncClient() as client:
            # Make both API calls in parallel
            claude_task = client.post(**claude_request)
            weather_task = client.get("https://api.open-meteo.com/v1/forecast", params=weather_params)
            
            responses = await asyncio.gather(claude_task, weather_task, return_exceptions=True)
            
            # Process Claude response
            claude_response = responses[0]
            if isinstance(claude_response, Exception):
                print(f"Error getting Claude description: {claude_response}")
                description = None
            else:
                claude_data = claude_response.json()
                description = claude_data["content"][0]["text"]

            # Process weather response
            weather_response = responses[1]
            if isinstance(weather_response, Exception):
                print(f"Error fetching forecast data: {weather_response}")
                forecasts = None
                location = None
            else:
                weather_data = weather_response.json()
                daily_data = weather_data.get("daily", {})
                forecasts = []
                
                for i in range(len(daily_data.get("time", []))):
                    current_date = daily_data["time"][i]
                    if current_date >= request.startDate and current_date <= request.endDate:
                        forecasts.append({
                            "date": current_date,
                            "maxTemperature": daily_data["temperature_2m_max"][i],
                            "minTemperature": daily_data["temperature_2m_min"][i],
                            "windSpeed": daily_data["wind_speed_10m_max"][i],
                            "precipitationProbability": daily_data["precipitation_probability_max"][i],
                        })

                location = {
                    "latitude": weather_params["latitude"],
                    "longitude": weather_params["longitude"],
                    "timezone": "UTC",
                    "timezoneAbbreviation": "UTC"
                }

        return {
            "description": description,
            "destination": request.destination,
            "forecasts": forecasts,
            "location": location,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process weather request: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
