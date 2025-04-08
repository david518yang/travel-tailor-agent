import os
import re
import asyncio
import streamlit as st
import httpx
import json
import time
from typing import List, Dict, Optional, Callable, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
from dotenv import load_dotenv
from datetime import datetime, timedelta
import anthropic

# -------------------------------
# Data Classes
# -------------------------------
@dataclass
class ChatContext:
    """
    Maintains a conversation context for interactions with Claude.
    - messages: A list of message dictionaries.
    - created_at: The timestamp when the conversation started.
    """
    messages: List[Dict]
    created_at: datetime

# -------------------------------
# Travel Assistant Class
# -------------------------------
class TravelAssistant:
    """
    Provides methods to assist with travel planning by:
      - Interacting with Claude API for travel planning
      - Managing conversation context
      - Handling API calls with retries and rate limiting
    """
    def __init__(self, anthropic_api_key: str):
        self.client = anthropic.Anthropic(api_key=anthropic_api_key)
        self.chat_contexts: Dict[str, ChatContext] = {}
        self.status_callback: Optional[Callable[[str, Any], None]] = None

    async def call_claude(self, prompt: str, context_id: Optional[str] = None, system: str = "You are a helpful travel planning assistant.") -> str:
        """
        Makes a call to the Claude API with the provided prompt.
        If a context_id is given and found, it maintains the conversation history.
        Includes rate limit handling with exponential backoff.
        """
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                if self.status_callback:
                    self.status_callback("claude_call", prompt[:50] + "...")
                
                # Prepare messages
                if context_id and context_id in self.chat_contexts:
                    context = self.chat_contexts[context_id]
                    context.messages.append({
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}]
                    })
                    messages = context.messages
                else:
                    messages = [{
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}]
                    }]
                    if context_id:
                        self.chat_contexts[context_id] = ChatContext(
                            messages=messages,
                            created_at=datetime.now()
                        )
                
                response = self.client.messages.create(
                    model="claude-3-haiku-20240307",
                    max_tokens=4096,
                    temperature=0,
                    system=system,
                    messages=messages
                )
                
                content = response.content[0].text
                
                if context_id and context_id in self.chat_contexts:
                    self.chat_contexts[context_id].messages.append({
                        "role": "assistant",
                        "content": [{"type": "text", "text": content}]
                    })
                
                return content.strip()
                
            except anthropic.RateLimitError:
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"Rate limit reached. Waiting {wait_time}s before retrying...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise Exception("Rate limit exceeded after all retries")
            except Exception as e:
                error_msg = str(e)
                print(f"Error calling Claude API (attempt {attempt+1}/{max_retries}): {error_msg}")
                
                if attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise Exception(f"Failed to call Claude API after {max_retries} attempts: {error_msg}")

# MCP tools
# Common airport codes for major cities
CITY_TO_AIRPORT = {
    "new york": ["JFK", "LGA", "EWR"],  # Multiple airports
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

def get_airport_code(city: str) -> str:
    """
    Convert a city name to its primary airport code.
    For cities with multiple airports, returns the main airport code.
    """
    city = city.lower().strip()
    if city in CITY_TO_AIRPORT:
        codes = CITY_TO_AIRPORT[city]
        return codes[0] if isinstance(codes, list) else codes
    return city.upper()

async def call_tool_get_flight(departure: str, arrival: str, departure_date: str, return_date: Optional[str] = None) -> str:
    """
    Search for flights using the MCP server endpoint.
    """
    try:
        # Format request data
        request_data = {
            "departure_location": departure.lower(),
            "arrival_location": arrival.lower(),
            "departure_date_and_time": departure_date,
            "return_date": return_date if return_date else None
        }
        
        # Debug: Print request data
        print(f"Sending flight request: {request_data}")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:8000/get_flight",
                json=request_data,
                timeout=30.0
            )
            
            # Debug: Print response status and headers
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {response.headers}")
            
            if response.status_code != 200:
                print(f"Error response body: {response.text}")
                return f"Error: Server returned {response.status_code} - {response.text}"
                
            response.raise_for_status()
            return response.text
    except httpx.HTTPError as e:
        error_msg = f"Error fetching flight information: {str(e)}"
        print(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        print(error_msg)
        return error_msg

async def call_tool_get_weather(location: str, dates: list) -> str:
    """
    Get weather information from the MCP server endpoint.
    """
    try:
        async with httpx.AsyncClient() as client:
            # Format the request to match WeatherRequest model
            request_data = {
                "location": location.lower(),  # ensure lowercase for consistency
                "dates": dates if isinstance(dates, list) else [dates]  # ensure dates is a list
            }
            
            response = await client.post(
                "http://localhost:8000/get_weather",
                json=request_data,
                timeout=30.0
            )
            response.raise_for_status()
            return response.text
    except httpx.HTTPError as e:
        return f"Error fetching weather information: {str(e)}"
    except Exception as e:
        return f"Unexpected error: {str(e)}"

def generate_date_list(start_date_str: str, end_date_str: str) -> list:
    """
    Generate a list of ISO-formatted dates between start_date and end_date (inclusive).
    """
    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        delta = end_date - start_date
        return [(start_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(delta.days + 1)]
    except ValueError as e:
        print(f"Error parsing dates: {e}")
        return []

async def parse_travel_request(prompt: str, assistant: TravelAssistant) -> dict:
    """
    Uses the Claude API to parse the user's travel planning request.
    """
    claude_prompt = (
        "Please parse this travel request and extract the key information. "
        "For dates, assume they are in M/D format for the year 2025. "
        "If a key's value is not explicitly mentioned, mark it as 'unknown'. "
        "Return ONLY a JSON object with these exact keys:\n"
        "- start_date: in YYYY-MM-DD format\n"
        "- end_date: in YYYY-MM-DD format\n"
        "- origin: the city the user is leaving from\n"
        "- destination: the destination city\n\n"
        f"Travel request: {prompt}\n\n"
        "Respond with ONLY the JSON object, no other text."
    )
    
    try:
        completion = await assistant.call_claude(
            claude_prompt,
            system="You are a travel request parser. You extract structured information from natural language travel requests."
        )
        
        # Clean up the JSON response if surrounded by markdown syntax.
        json_str = completion.strip()
        if json_str.startswith("```json"):
            json_str = json_str[7:]
        if json_str.endswith("```"):
            json_str = json_str[:-3]
        json_str = json_str.strip()
        
        result = json.loads(json_str)
        return result
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}\nResponse was: {completion}")
        return {"error": "Error parsing travel request: Could not parse JSON response"}
    except Exception as e:
        return {"error": f"Error parsing travel request: {str(e)}"}

async def update_missing_fields(user_input: str, assistant: TravelAssistant, current_details: dict) -> dict:
    """
    Uses the Claude API to update only the missing fields (ones that are still 'unknown')
    from the given user input.
    """
    # Identify which fields are still unknown.
    missing_keys = [key for key, value in current_details.items() if value == "unknown"]
    missing_list = ", ".join(missing_keys)
    
    parse_prompt = (
        f"The user provided the following additional information: '{user_input}'\n"
        f"Current travel details: {json.dumps(current_details, indent=2)}\n\n"
        f"Please update ONLY these missing fields if possible: {missing_list}\n"
        "Rules:\n"
        "1. If the information is invalid or unclear for any field, keep it as 'unknown'\n"
        "2. Return ONLY a valid JSON object with all fields, including unchanged ones\n"
        "3. Do not include any explanation text, ONLY the JSON object\n"
        "4. Format dates as YYYY-MM-DD\n"
        "5. Use lowercase city names\n\n"
        "Response format example:\n"
        "{\n"
        '    "start_date": "2024-04-15",\n'
        '    "end_date": "2024-04-20",\n'
        '    "origin": "new york",\n'
        '    "destination": "london"\n'
        "}"
    )
    
    completion = await assistant.call_claude(
       parse_prompt,
       system="You are a travel request parser. Return only valid JSON objects with no additional text."
    )
    
    # Clean up the response to get just the JSON part
    json_str = completion.strip()
    
    # Remove any markdown code block markers
    if "```" in json_str:
        # Extract content between first and last ```
        parts = json_str.split("```")
        for part in parts:
            # Remove any "json" language identifier
            clean_part = part.replace("json", "").strip()
            try:
                # Try to parse each potential JSON string
                return json.loads(clean_part)
            except json.JSONDecodeError:
                continue
    
    # If no code blocks, try parsing the whole string
    try:
        return json.loads(json_str)
    except json.JSONDecodeError:
        # If parsing fails, keep the current details unchanged
        return current_details

def parse_flight_response(data: str):
    """
    Parse the raw flight API response into a list of dictionaries.
    Each dictionary represents one flight option with its details.
    """
    # Remove any surrounding quotes and escape characters
    data = data.strip('"').replace('\\n', '\n')
    
    options = []
    # Split the raw data on the separator line
    for chunk in data.split('----------------------------------------'):
        chunk = chunk.strip()
        if not chunk:
            continue
        
        # Break the chunk into non-empty lines
        lines = [line.strip() for line in chunk.splitlines() if line.strip()]
        if not lines:  # Skip if no valid lines
            continue
            
        try:
            # Extract option number
            option_number = lines[0].replace("Option", "").replace(":", "").strip()
            
            # Extract price (should be on second line)
            price = next((line.replace("Price:", "").strip() 
                         for line in lines if line.startswith("Price:")), "N/A")
            
            # Extract duration (should be on third line)
            duration = next((line.replace("Duration:", "").strip() 
                           for line in lines if line.startswith("Duration:")), "N/A")
            
            # Everything else goes into details
            details = [line for line in lines[3:] if line and not line.startswith("Option")]
            
            options.append({
                "option": option_number,
                "price": price,
                "duration": duration,
                "details": details
            })
        except Exception as e:
            st.error(f"Error parsing flight option: {str(e)}")
            continue
            
    return options

async def process_travel_info():
    """
    Once we have all the travel details, show them, call the flight and weather tools,
    and then reset the session state for a new travel request.
    """
    # Show final travel details
    final_details = st.session_state.travel_details
    response = "Great! I've gathered all the necessary travel details:\n```json\n" + json.dumps(final_details, indent=2) + "\n```"
    st.session_state.messages.append({"role": "assistant", "content": response})
    with st.chat_message("assistant"):
        st.write(response)
    
    # TEMPORARY: Use hardcoded flight data for testing
    # TODO: Uncomment the API call when ready for production
    """
    # Debug: Print travel details before API call
    print(f"Making flight request with details: {final_details}")
    
    # Get flight information
    flight_result = await call_tool_get_flight(
        final_details["origin"],
        final_details["destination"],
        final_details["start_date"],
        final_details["end_date"]
    )
    
    # Check if the result is an error message
    if flight_result.startswith("Error"):
        st.error(flight_result)
        return
    
    # Parse flight options
    try:
        flight_options = parse_flight_response(flight_result)
        if not flight_options:
            st.warning("No flight options were found for your search criteria.")
            return
    except Exception as e:
        st.error(f"Error parsing flight data: {str(e)}")
        return
    """
    
    # Hardcoded flight options for testing
    flight_options = [
        {
            "option": "1",
            "price": "$639",
            "duration": "6h 50m",
            "details": [
                "Norse Atlantic Airways N0 302",
                "JFK 2025-06-01 00:15 → CDG 2025-06-01 13:05"
            ]
        },
        {
            "option": "2",
            "price": "$791",
            "duration": "7h 50m",
            "details": [
                "Delta DL 266",
                "JFK 2025-06-01 20:10 → CDG 2025-06-02 10:00"
            ]
        },
        {
            "option": "3",
            "price": "$916",
            "duration": "7h 25m",
            "details": [
                "Air France AF 1",
                "JFK 2025-06-01 16:30 → CDG 2025-06-02 05:55"
            ]
        },
        {
            "option": "4",
            "price": "$956",
            "duration": "7h 25m",
            "details": [
                "American AA 44",
                "JFK 2025-06-01 17:30 → CDG 2025-06-02 06:55"
            ]
        },
        {
            "option": "5",
            "price": "$673",
            "duration": "20h 5m",
            "details": [
                "Norse Atlantic UK Z0 702",
                "JFK 2025-06-01 18:20 → LGW 2025-06-02 06:20",
                "Layover at LGW: 11h 50m",
                "easyJet U2 8407",
                "LGW 2025-06-02 18:10 → CDG 2025-06-02 20:25",
                "Layover at LGW: 11h 50m"
            ]
        }
    ]

    with st.chat_message("assistant"):
        st.write("Here are the available flight options:")
        
        # Add CSS for flight cards styling
        st.markdown(
            """
            <style>
            .flight-card {
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 12px;
                background-color: white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                height: 100%;
            }
            .flight-card h3 {
                color: #1E88E5;
                margin: 0 0 8px 0;
                font-size: 1rem;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .flight-detail {
                margin: 6px 0;
                color: #333;
                font-size: 0.85rem;
            }
            .flight-detail strong {
                color: #1E88E5;
            }
            .flight-info {
                margin: 8px 0;
                padding-left: 0;
                list-style-type: none;
                font-size: 0.85rem;
            }
            .flight-info li {
                padding: 3px 0;
                color: #555;
                word-break: break-word;
            }
            .layover {
                color: #FFA000;
                font-style: italic;
            }
            </style>
            """,
            unsafe_allow_html=True
        )
        
        # Create columns for the flight cards
        cols = st.columns(5)
        
        # Add each flight card to a column
        for idx, (flight, col) in enumerate(zip(flight_options, cols)):
            with col:
                card_html = f"""
                <div class="flight-card">
                    <h3>Flight Option {flight['option']}</h3>
                    <div class="flight-detail">
                        <strong>Price:</strong> {flight['price']}<br>
                        <strong>Duration:</strong> {flight['duration']}
                    </div>
                    <ul class="flight-info">
                """
                
                for detail in flight['details']:
                    css_class = 'layover' if 'Layover' in detail else ''
                    card_html += f'<li class="{css_class}">{detail}</li>'
                
                card_html += """
                    </ul>
                </div>
                """
                # Render each card in its column
                st.markdown(card_html, unsafe_allow_html=True)
    
    # Get weather information
    dates = generate_date_list(final_details["start_date"], final_details["end_date"])
    if dates:
        weather_result = await call_tool_get_weather(
            final_details["destination"],
            dates
        )
        weather_response = f"Here's the weather forecast:\n```\n{weather_result}\n```"
        st.session_state.messages.append({"role": "assistant", "content": weather_response})
        with st.chat_message("assistant"):
            st.write(weather_response)
    
    # Reset state for new travel request
    st.session_state.travel_details = {
        "start_date": "unknown",
        "end_date": "unknown",
        "origin": "unknown",
        "destination": "unknown"
    }
    st.session_state.waiting_for_fields = None

async def main():
    st.set_page_config(layout="wide")
    st.title("Trip Planner Chat Interface")
    
    # Initialize session state variables.
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "travel_assistant" not in st.session_state:
        load_dotenv()
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            st.error("ANTHROPIC_API_KEY environment variable not set.")
            return
        st.session_state.travel_assistant = TravelAssistant(api_key)
    if "travel_details" not in st.session_state:
        st.session_state.travel_details = {
            "start_date": "unknown",
            "end_date": "unknown",
            "origin": "unknown",
            "destination": "unknown"
        }
    # waiting_for_fields now is used as a flag to indicate missing info is awaited.
    if "waiting_for_fields" not in st.session_state:
        st.session_state.waiting_for_fields = False

    # Chat styling (same as before).
    st.markdown("""
        <style>
            .chat-message {
                padding: 1rem;
                border-radius: 0.5rem;
                margin-bottom: 1rem;
                display: flex;
                max-width: 80%;
            }
            .chat-message.user {
                background-color: #2b313e;
                margin-left: auto;
                border-bottom-right-radius: 0;
            }
            .chat-message.assistant {
                background-color: #475063;
                margin-right: auto;
                border-bottom-left-radius: 0;
            }
            .chat-message .content {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
            }
            .chat-message.user .content {
                align-items: flex-end;
            }
            .chat-message p {
                margin: 0;
            }
            .input-container {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background-color: #262b37;
                padding: 1rem;
                z-index: 1000;
            }
            .stTextInput input {
                border-radius: 1.5rem !important;
                padding: 0.5rem 1rem !important;
            }
        </style>
    """, unsafe_allow_html=True)
    
    # Display previous messages.
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.write(message["content"])

    # Chat input.
    if prompt := st.chat_input("Type your message here..."):
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.write(prompt)
        
        # Check if we are waiting for missing fields from a previous prompt.
        if st.session_state.waiting_for_fields:
            try:
                # Use the user's answer to update the missing fields.
                updated_details = await update_missing_fields(
                    prompt,
                    st.session_state.travel_assistant,
                    st.session_state.travel_details
                )
                st.session_state.travel_details.update(updated_details)
            except json.JSONDecodeError:
                response = "I couldn't understand that response for the missing details. Please try again."
                st.session_state.messages.append({"role": "assistant", "content": response})
                with st.chat_message("assistant"):
                    st.write(response)
                return
            
            # Check if any fields are still unknown.
            still_missing = []
            if st.session_state.travel_details["start_date"] == "unknown":
                still_missing.append("start date")
            if st.session_state.travel_details["end_date"] == "unknown":
                still_missing.append("end date")
            if st.session_state.travel_details["origin"] == "unknown":
                still_missing.append("departure city")
            if st.session_state.travel_details["destination"] == "unknown":
                still_missing.append("destination(s)")
                
            if still_missing:
                missing_info = ", ".join(still_missing)
                response = f"I still need the following details: {missing_info}. Please provide them all in one message."
                st.session_state.waiting_for_fields = True  # Keep waiting for missing info.
                st.session_state.messages.append({"role": "assistant", "content": response})
                with st.chat_message("assistant"):
                    st.write(response)
            else:
                st.session_state.waiting_for_fields = False
                # All details present – proceed with flight and weather details.
                await process_travel_info()
                
        else:
            # Process a new travel request.
            travel_details = await parse_travel_request(prompt, st.session_state.travel_assistant)
            if "error" in travel_details:
                response = travel_details["error"]
                st.session_state.messages.append({"role": "assistant", "content": response})
                with st.chat_message("assistant"):
                    st.write(response)
            else:
                st.session_state.travel_details.update(travel_details)
                missing_fields = []
                if st.session_state.travel_details["start_date"] == "unknown":
                    missing_fields.append("start date")
                if st.session_state.travel_details["end_date"] == "unknown":
                    missing_fields.append("end date")
                if st.session_state.travel_details["origin"] == "unknown":
                    missing_fields.append("departure city")
                if st.session_state.travel_details["destination"] == "unknown":
                    missing_fields.append("destination")
                
                if missing_fields:
                    missing_info = ", ".join(missing_fields)
                    response = f"To better assist you, I still need the following details: {missing_info}."
                    st.session_state.waiting_for_fields = True
                    st.session_state.messages.append({"role": "assistant", "content": response})
                    with st.chat_message("assistant"):
                        st.write(response)
                else:
                    # All necessary information is present, move ahead.
                    st.session_state.waiting_for_fields = False
                    await process_travel_info()

if __name__ == "__main__":
    asyncio.run(main())
