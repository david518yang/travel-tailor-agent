import os
import asyncio
from dotenv import load_dotenv
from datetime import datetime
import streamlit as st
from research_agent import ResearchAgent

# Load environment variables
load_dotenv()
anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")

# Initialize the research agent
@st.cache_resource
def get_research_agent():
    return ResearchAgent(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )

# Set up the Streamlit UI
st.title("AI Research Agent")
st.markdown("""
This tool helps you research topics by gathering information from the web and using AI to analyze it.
""")

# Research input section
st.header("Research a Topic")
research_query = st.text_input("Enter a research topic:")
col1, col2 = st.columns(2)
with col1:
    depth = st.slider("Research Depth", min_value=1, max_value=3, value=2, 
                      help="How deep to go with follow-up topics")
with col2:
    breadth = st.slider("Research Breadth", min_value=1, max_value=3, value=2,
                       help="Number of follow-up topics to explore at each level")

research_mode = st.radio("Research Mode", ["Quick", "Comprehensive"], 
                         help="Quick gives a faster response, Comprehensive does a deeper analysis")

if st.button("Start Research"):
    if not research_query:
        st.warning("Please enter a research topic first!")
    else:
        agent = get_research_agent()
        
        with st.spinner(f"Researching '{research_query}'. This may take a few minutes..."):
            try:
                if research_mode == "Quick":
                    # Use the simple research method for quick results
                    result = agent.simple_research(research_query)
                    st.markdown(result)
                else:
                    # Use async for comprehensive research
                    async def run_research():
                        results = await agent.research_topic(
                            query=research_query,
                            depth=depth,
                            breadth=breadth
                        )
                        report = agent.generate_final_report(
                            query=research_query,
                            results=results
                        )
                        return report, results
                    
                    # Run the async research 
                    report, results = asyncio.run(run_research())
                    
                    # Display results
                    st.markdown(report)
                    
                    # Option to save the report
                    if st.button("Save Report"):
                        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                        filename = f"reports/research_{research_query.replace(' ', '_')}_{timestamp}.md"
                        os.makedirs('reports', exist_ok=True)
                        with open(filename, 'w', encoding='utf-8') as f:
                            f.write(report)
                        st.success(f"Report saved to {filename}")
                        
            except Exception as e:
                st.error(f"Error during research: {str(e)}")

# Add information about the tool
st.sidebar.title("About")
st.sidebar.info("""
This research agent uses Claude AI from Anthropic and FireCrawl for web search 
to help you research topics thoroughly. It can explore multiple aspects
of a topic and create detailed reports with sources.
""")