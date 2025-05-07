from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import os
from dotenv import load_dotenv
import asyncio
from datetime import datetime
from openmeteo_py import OWmanager
import json
from anthropic import Anthropic  # New import for Anthropic client

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

class AttractionRequest(BaseModel):
    city: str

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

        # Initialize Anthropic client for Claude
        load_dotenv()
        claude_api_key = os.getenv("ANTHROPIC_API_KEY")
        if not claude_api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY environment variable not set")
        
        anthropic_client = Anthropic(api_key=claude_api_key)
        
        prompt = f"What is the typical weather in {request.destination} between {formatted_start_date} and {formatted_end_date}? Keep it under 3 or 4 sentences but talk about the weather patterns around that time of year in that location. Use fahrenheit for units and metric units for wind speed."

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
            # Make weather API call
            weather_task = client.get("https://api.open-meteo.com/v1/forecast", params=weather_params)
            
            # Make Claude API call asynchronously outside of httpx client
            claude_task = asyncio.create_task(get_claude_response(anthropic_client, prompt))
            
            # Gather responses
            claude_response, weather_response = await asyncio.gather(claude_task, weather_task, return_exceptions=True)
            
            # Process Claude response
            if isinstance(claude_response, Exception):
                print(f"Error getting Claude description: {claude_response}")
                description = None
            else:
                description = claude_response

            # Process weather response
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

# Helper function to call Claude asynchronously
async def get_claude_response(client: Anthropic, prompt: str) -> str:
    """
    Call Claude API asynchronously using the new Python SDK.
    """
    try:
        # Run in an executor to avoid blocking
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1024,
                system="You are a helpful AI assistant for a travel application.",
                messages=[{"role": "user", "content": prompt}]
            )
        )
        
        return response.content[0].text
    except Exception as e:
        print(f"Error calling Claude API: {e}")
        raise e

@app.post("/get_attractions")
async def get_attractions(request: AttractionRequest):
    """
    Get the top 5 must-see attractions for a city by asking Claude.
    """
    try:
        print(f"[MCP] Getting attractions for city: {request.city}")
        
        # Load the API key and initialize Anthropic client
        load_dotenv()
        claude_api_key = os.getenv("ANTHROPIC_API_KEY")
        if not claude_api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY environment variable not set.")
        
        anthropic_client = Anthropic(api_key=claude_api_key)
        
        # Create the prompt for Claude
        prompt = f"""What are the 6 most popular tourist attractions in {request.city}? 
        For each attraction, include:
        1. The name of the attraction
        2. A brief 1-2 sentence description
        3. A rating out of 5

        Format the output as a JSON array with these fields: title, description, rating.
        Only return the JSON array, nothing else."""
        
        print(f"[MCP] Calling Claude for attractions in {request.city}")
        
        try:
            # Call Claude API using the new SDK
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: anthropic_client.messages.create(
                    model="claude-3-haiku-20240307",
                    max_tokens=1024,
                    system="You are a helpful AI assistant for a travel application that provides accurate tourist information.",
                    messages=[{"role": "user", "content": prompt}]
                )
            )
            
            # Extract the text response from Claude
            attractions_text = response.content[0].text
            print(f"[MCP] Claude response: {attractions_text}")
            
            try:
                # Try to parse the JSON from Claude's response
                # Sometimes Claude might include markdown code blocks or extra text
                if "```json" in attractions_text:
                    # Extract JSON from code block
                    attractions_text = attractions_text.split("```json")[1].split("```")[0].strip()
                elif "```" in attractions_text:
                    # Extract from generic code block
                    attractions_text = attractions_text.split("```")[1].split("```")[0].strip()
                
                attractions_data = json.loads(attractions_text)
                print(f"[MCP] Parsed {len(attractions_data)} attractions from Claude")
                
                # Format the attractions with all required fields
                formatted_attractions = []
                for attraction in attractions_data:
                    formatted_attraction = {
                        'title': attraction.get('title', 'Unknown'),
                        'rating': float(attraction.get('rating', 4.5)),    # Convert to float
                        'description': attraction.get('description', '')
                    }
                    formatted_attractions.append(formatted_attraction)
                
                print(f"[MCP] Returning {len(formatted_attractions)} attractions for {request.city}")
                return {
                    "city": request.city,
                    "attractions": formatted_attractions
                }
                
            except json.JSONDecodeError as e:
                print(f"[MCP] Error parsing JSON from Claude: {e}")
                print(f"[MCP] Raw text from Claude: {attractions_text}")
                # Fall back to hardcoded attractions for common cities
                return get_hardcoded_attractions(request.city)
                
        except Exception as api_error:
            print(f"[MCP] Claude API Error: {str(api_error)}")
            return get_hardcoded_attractions(request.city)
                
    except Exception as e:
        print(f"[MCP] Error getting attractions: {str(e)}")
        return get_hardcoded_attractions(request.city)

def get_hardcoded_attractions(city: str) -> dict:
    """Fallback function to get hardcoded attractions for common cities."""
    city_key = city.lower().strip()
    
    # Dictionary of popular attractions by city
    popular_attractions = {
        'paris': [
            {'title': 'Eiffel Tower', 'reviews': 140000, 'rating': 4.6, 'address': 'Champ de Mars, 5 Av. Anatole France, Paris', 'description': 'Iconic wrought-iron tower with observation decks'},
            {'title': 'Louvre Museum', 'reviews': 230000, 'rating': 4.7, 'address': 'Rue de Rivoli, 75001 Paris', 'description': 'World-famous art museum home to Leonardo da Vinci\'s "Mona Lisa"'},
            {'title': 'Notre-Dame Cathedral', 'reviews': 110000, 'rating': 4.7, 'address': '6 Parvis Notre-Dame, 75004 Paris', 'description': 'Medieval Gothic cathedral with twin towers and spire'},
            {'title': 'Arc de Triomphe', 'reviews': 140000, 'rating': 4.7, 'address': 'Place Charles de Gaulle, 75008 Paris', 'description': 'Triumphal arch with observation deck and eternal flame'},
            {'title': 'Sacré-Cœur', 'reviews': 120000, 'rating': 4.8, 'address': '35 Rue du Chevalier de la Barre, 75018 Paris', 'description': 'Romano-Byzantine basilica with scenic Paris views'}
        ],
        'london': [
            {'title': 'Tower of London', 'reviews': 87000, 'rating': 4.6, 'address': 'London', 'description': 'Historic castle and former prison on the Thames'},
            {'title': 'British Museum', 'reviews': 140000, 'rating': 4.8, 'address': 'Great Russell St, London', 'description': 'Museum of human history, art, and culture'},
            {'title': 'Buckingham Palace', 'reviews': 110000, 'rating': 4.5, 'address': 'London', 'description': 'Queen\'s official London residence with changing of the guard'},
            {'title': 'London Eye', 'reviews': 130000, 'rating': 4.5, 'address': 'London', 'description': 'Giant observation wheel with panoramic city views'},
            {'title': 'Big Ben', 'reviews': 90000, 'rating': 4.7, 'address': 'London', 'description': 'Iconic clock tower at the Houses of Parliament'}
        ],
        'rome': [
            {'title': 'Colosseum', 'reviews': 230000, 'rating': 4.7, 'address': 'Rome', 'description': 'Ancient Roman amphitheater for gladiatorial contests'},
            {'title': 'Vatican Museums', 'reviews': 160000, 'rating': 4.6, 'address': 'Rome', 'description': 'Museums with classical and Renaissance masterpieces'},
            {'title': 'Trevi Fountain', 'reviews': 190000, 'rating': 4.8, 'address': 'Rome', 'description': 'Baroque fountain known for coin-throwing tradition'},
            {'title': 'Pantheon', 'reviews': 140000, 'rating': 4.8, 'address': 'Rome', 'description': 'Ancient Roman temple with a domed roof'},
            {'title': 'Roman Forum', 'reviews': 130000, 'rating': 4.7, 'address': 'Rome', 'description': 'Ancient government buildings and temples'}
        ],
        'new york': [
            {'title': 'Empire State Building', 'reviews': 91500, 'rating': 4.7, 'address': 'New York', 'description': 'Art Deco skyscraper with observation decks'},
            {'title': 'Statue of Liberty', 'reviews': 70000, 'rating': 4.7, 'address': 'New York', 'description': 'Iconic copper statue and symbol of freedom'},
            {'title': 'Central Park', 'reviews': 133000, 'rating': 4.8, 'address': 'New York', 'description': 'Urban park with lakes, trails, and attractions'},
            {'title': 'Metropolitan Museum of Art', 'reviews': 53000, 'rating': 4.8, 'address': 'New York', 'description': 'Major art museum with extensive collections'},
            {'title': 'Times Square', 'reviews': 127000, 'rating': 4.7, 'address': 'New York', 'description': 'Bustling commercial intersection with billboards'}
        ],
        'tokyo': [
            {'title': 'Tokyo Skytree', 'reviews': 25000, 'rating': 4.5, 'address': 'Tokyo', 'description': 'Tall broadcasting and observation tower'},
            {'title': 'Senso-ji Temple', 'reviews': 24000, 'rating': 4.7, 'address': 'Tokyo', 'description': 'Ancient Buddhist temple in Asakusa'},
            {'title': 'Meiji Shrine', 'reviews': 16000, 'rating': 4.7, 'address': 'Tokyo', 'description': 'Shinto shrine dedicated to Emperor Meiji'},
            {'title': 'Tokyo Disneyland', 'reviews': 43000, 'rating': 4.7, 'address': 'Tokyo', 'description': 'Disney theme park with rides and entertainment'},
            {'title': 'Shinjuku Gyoen', 'reviews': 15000, 'rating': 4.7, 'address': 'Tokyo', 'description': 'Large park with Japanese, English, and French gardens'}
        ]
    }
    
    if city_key in popular_attractions:
        print(f"[MCP] Using hardcoded attractions for {city_key}")
        formatted_attractions = []
        for attraction in popular_attractions[city_key]:
            formatted_attractions.append({
                'title': attraction.get('title', 'Unknown'),
                'reviews': attraction.get('reviews', 10000),
                'rating': attraction.get('rating', 4.5),
                'address': attraction.get('address', city),
                'website': '',
                'description': attraction.get('description', f"Popular attraction in {city}"),
                'thumbnail': '',
                'hours': '',
                'phone': '',
                'place_id': ''
            })
        return {
            "city": city,
            "attractions": formatted_attractions
        }
    else:
        # Generate generic attractions for unknown cities
        print(f"[MCP] Using generic attractions for {city_key}")
        return {
            "city": city,
            "attractions": [
                {
                    'title': f"Main attraction in {city}",
                    'reviews': 50000,
                    'rating': 4.5,
                    'address': city,
                    'website': '',
                    'description': f"Popular tourist destination in {city}",
                    'thumbnail': '',
                    'hours': '',
                    'phone': '',
                    'place_id': ''
                },
                {
                    'title': f"Museum of {city}",
                    'reviews': 40000,
                    'rating': 4.6,
                    'address': city,
                    'website': '',
                    'description': f"Famous museum in {city}",
                    'thumbnail': '',
                    'hours': '',
                    'phone': '',
                    'place_id': ''
                },
                {
                    'title': f"{city} Park",
                    'reviews': 35000,
                    'rating': 4.7,
                    'address': city,
                    'website': '',
                    'description': f"Beautiful park in {city}",
                    'thumbnail': '',
                    'hours': '',
                    'phone': '',
                    'place_id': ''
                },
                {
                    'title': f"{city} Cathedral",
                    'reviews': 30000,
                    'rating': 4.8,
                    'address': city,
                    'website': '',
                    'description': f"Historic cathedral in {city}",
                    'thumbnail': '',
                    'hours': '',
                    'phone': '',
                    'place_id': ''
                },
                {
                    'title': f"{city} Tower",
                    'reviews': 25000,
                    'rating': 4.4,
                    'address': city,
                    'website': '',
                    'description': f"Iconic tower in {city}",
                    'thumbnail': '',
                    'hours': '',
                    'phone': '',
                    'place_id': ''
                }
            ]
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
