import os
import asyncio
from dotenv import load_dotenv
from datetime import datetime
from research_agent import ResearchAgent

async def run_cli_research(query, depth=2, breadth=2):
    """
    Run research from command line interface
    
    Args:
        query: The research topic
        depth: How many levels deep to research
        breadth: How many follow-up topics per level
    """
    # Load API keys from environment
    load_dotenv()
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
    firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")
    
    # Create research agent
    assistant = ResearchAgent(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )
    
    print(f"[START] Starting research on: '{query}'")
    
    # Perform recursive research
    results = await assistant.research_topic(query=query, depth=depth, breadth=breadth)
    print(f"[RESULT] Found {len(results.learnings)} learnings from {len(results.visited_urls)} sources")
    
    # Generate and save report
    print("[INFO] Generating final report...")
    report = assistant.generate_final_report(query=query, results=results)
    
    # Save report to file
    os.makedirs('reports', exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"reports/research_{query.replace(' ', '_')}_{timestamp}.md"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"[DONE] Report saved to: {filename}")
    print("\n[REPORT PREVIEW]")
    print("=" * 40)
    print(report[:500] + "...")
    
    return filename

def print_usage():
    """Print command-line usage instructions"""
    print("""
Research Agent - CLI & Web Interface

CLI Usage:
    python main.py [topic] [--depth N] [--breadth N]

Web Interface:
    python -m streamlit run src/app.py
    
Options:
    topic   - Research topic (in quotes if it contains spaces)
    --depth - Research depth (default: 2)
    --breadth - Research breadth (default: 2)
    --web   - Launch web interface
    --help  - Show this help message
    """)

if __name__ == "__main__":
    import sys
    
    # Handle command-line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--help" or sys.argv[1] == "-h":
            print_usage()
        elif sys.argv[1] == "--web" or sys.argv[1] == "-w":
            print("Starting web interface...")
            os.system("python -m streamlit run src/app.py")
        else:
            # Get topic from first argument
            query = sys.argv[1]
            depth = 2
            breadth = 2
            
            # Parse optional flags
            i = 2
            while i < len(sys.argv):
                if sys.argv[i] == "--depth" and i+1 < len(sys.argv):
                    depth = int(sys.argv[i+1])
                    i += 2
                elif sys.argv[i] == "--breadth" and i+1 < len(sys.argv):
                    breadth = int(sys.argv[i+1])
                    i += 2
                else:
                    i += 1
            
            # Run the research
            asyncio.run(run_cli_research(query, depth, breadth))
    else:
        # No arguments, show usage
        print_usage()