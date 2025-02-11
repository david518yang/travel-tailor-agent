import asyncio
import os
from dotenv import load_dotenv
from datetime import datetime
from research_agent import ResearchAgent

async def main():
    """
    Main function that:
      - Loads environment variables.
      - Instantiates the ResearchAssistant.
      - Starts the research process for a given query.
      - Generates a final report and saves it to a file.
    """
    # Load API keys and other environment variables
    load_dotenv()
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
    firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")
    
    assistant = ResearchAgent(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )
    
    # Define your research query here
    query = "quantum computing advantages"
    print(f"[START] Starting research on: '{query}'")
    
    # Perform recursive research with specified depth and breadth
    results = await assistant.research_topic(query=query, depth=2, breadth=2)
    print(f"[RESULT] Found {len(results.learnings)} learnings from {len(results.visited_urls)} sources")
    
    print("[INFO] Generating final report...")
    report = assistant.generate_final_report(query=query, results=results)
    
    # Save the report to the 'reports' directory
    os.makedirs('reports', exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"reports/research_{query.replace(' ', '_')}_{timestamp}.md"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"[DONE] Report saved to: {filename}")
    print("\n[REPORT PREVIEW]")
    print("=" * 40)
    # Print first 500 characters of report for a quick preview
    print(report[:500] + "...")

if __name__ == "__main__":
    asyncio.run(main())
