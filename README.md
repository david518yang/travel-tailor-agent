# Travel Tailor Agent

<img width="1512" height="861" alt="travel-tailor" src="https://github.com/user-attachments/assets/ba28620c-68e1-4735-a180-c1c5ca031ec8" />

Travel Tailor is an AI-powered travel concierge application that helps you plan your trips with personalized recommendations and real-time information.

## Features

- **Intelligent Trip Planning**: Enter your travel details in natural language and let our AI understand your needs
- **Flight Search**: Find available flights for your travel dates with detailed pricing and itinerary information
- **Weather Forecasts**: Get accurate weather predictions and historical weather patterns for your destination
- **Attractions Recommendations**: Discover top-rated attractions and points of interest at your travel destination
- **Conversational Interface**: Interact naturally with our AI assistant to get answers about your destination
- **Seamless Experience**: All your travel information is presented in an intuitive, easy-to-navigate interface

## [Link to Video Demo](https://streamable.com/mnk91p)

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js with Next.js API routes
- **AI Integration**: Anthropic Claude API for natural language understanding and personalized recommendations
- **APIs**: Integration with weather forecasting (Open-Meteo) and attractions data services

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- Python 3.8 or later (for backend services)
- npm or yarn package manager
- Anthropic API key for Claude integration

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/david518yang/travel-tailor-agent.git
   cd travel-tailor
   ```

2. Set up Python environment:

   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   Create a `.env` file in the project root with:

   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ```
   *Note - The app will not function without an Anthropic API Key, as this is the LLM that powers the chatbot*

4. Start the backend server:

   ```bash
   cd src/travel/server
   python mcp.py
   ```

   The API will be available at `http://localhost:8000`.

5. Set up and start the frontend:

   ```bash
   cd src/travel/travel-client
   npm install
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser to use the application.

## Usage

1. Enter your travel details in natural language, for example:

   - "I want to fly from San Francisco to Paris from June 1 to June 10"
   - "Planning a trip to Tokyo next month"
   - "Looking for flights to Rome in early July"

2. If any information is missing, Travel Tailor will ask follow-up questions to gather all necessary details.

3. Once all details are provided, Travel Tailor will display:

   - Available flights with pricing, duration, and detailed itineraries
   - Weather forecast for your destination during your travel dates
   - Historical weather patterns to help you prepare appropriately
   - Top attractions at your destination with ratings and descriptions

4. Ask follow-up questions about your destination in the chat interface:
   - "What's the best time to visit the Eiffel Tower?"
   - "Are there any local festivals during my visit?"
   - "What's the best way to get around the city?"
   - "Can you recommend some good restaurants?"

## Key Components

- **Natural Language Processing**: Understands travel requests in plain language
- **Contextual Awareness**: Remembers your travel details throughout the conversation
- **Real-time Data Integration**: Provides up-to-date flight and weather information
- **Interactive UI**: Responsive design with expandable flight cards and weather forecasts
- **AI-Powered Assistance**: Leverages Claude AI to provide helpful, accurate information

## Project Structure

```
src/travel/
  ├── server/
  │   └── mcp.py                # Backend API service
  └── travel-client/            # Next.js frontend
      ├── app/
      │   ├── api/              # API route handlers
      │   │   ├── attractions/  # Attractions info API
      │   │   ├── flight/       # Flight search API
      │   │   ├── general_query/# Q&A about destinations
      │   │   ├── parse/        # Travel request parsing
      │   │   ├── update/       # Travel details updates
      │   │   └── weather/      # Weather forecast API
      │   ├── layout.tsx        # Main application layout
      │   └── page.tsx          # Main application page
      ├── components/           # UI components
      │   └── ui/               # Reusable UI elements
      └── lib/                  # Utility functions
          └── claude.ts         # Claude API integration
```
