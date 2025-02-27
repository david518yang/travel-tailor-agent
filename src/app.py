import os
import asyncio
import time
from datetime import datetime
import streamlit as st
from dotenv import load_dotenv
from research_agent import ResearchAgent
import json

# Load environment variables
load_dotenv()
anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")

# Initialize session state for chat history and research status
if "messages" not in st.session_state:
    st.session_state.messages = []
if "research_status" not in st.session_state:
    st.session_state.research_status = ""
if "api_costs" not in st.session_state:
    st.session_state.api_costs = {"claude": 0.0, "firecrawl": 0.0}
if "visited_urls" not in st.session_state:
    st.session_state.visited_urls = []
if "current_learnings" not in st.session_state:
    st.session_state.current_learnings = []

# Initialize the research agent
@st.cache_resource
def get_research_agent():
    return ResearchAgent(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )

# Set up the Streamlit UI
st.title("AI Research Agent Chat")

# Sidebar configuration
with st.sidebar:
    st.header("Research Settings")
    col1, col2 = st.columns(2)
    with col1:
        depth = st.slider("Research Depth", min_value=1, max_value=3, value=2, 
                      help="How deep to explore subtopics")
    with col2:
        breadth = st.slider("Research Breadth", min_value=1, max_value=3, value=2,
                       help="Number of subtopics to explore")
    
    research_mode = st.radio("Research Mode", ["Quick", "Comprehensive"], 
                         help="Quick gives faster results, Comprehensive does deeper analysis")
    
    st.divider()
    st.header("API Usage")
    claude_cost = st.session_state.api_costs.get("claude", 0.0)
    firecrawl_cost = st.session_state.api_costs.get("firecrawl", 0.0)
    total_cost = claude_cost + firecrawl_cost
    
    st.metric("Claude API Cost", f"${claude_cost:.4f}")
    st.metric("FireCrawl API Cost", f"${firecrawl_cost:.4f}")
    st.metric("Total Cost", f"${total_cost:.4f}")
    
    # Cost rate assumptions
    st.caption("Est. rates: Claude ($5/M tokens), FireCrawl ($0.05/request)")
    
    if st.button("Reset Chat"):
        st.session_state.messages = []
        st.session_state.research_status = ""
        st.session_state.api_costs = {"claude": 0.0, "firecrawl": 0.0}
        st.session_state.visited_urls = []
        st.session_state.current_learnings = []
        st.experimental_rerun()

# Research status display
if st.session_state.research_status:
    status_container = st.empty()
    status_container.info(st.session_state.research_status)

# Display chat messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# User input
if user_query := st.chat_input("What would you like me to research?"):
    # Add user message to chat
    st.session_state.messages.append({"role": "user", "content": user_query})
    with st.chat_message("user"):
        st.markdown(user_query)
    
    # Initialize research agent
    agent = get_research_agent()
    
    # Start assistant response
    with st.chat_message("assistant"):
        response_placeholder = st.empty()
        response_placeholder.markdown("Thinking...")
        
        status_container = st.empty()
        
        # Create containers for showing research progress
        sources_container = st.container()
        learnings_container = st.container()
        
        # Set initial cost estimates
        starting_claude_cost = st.session_state.api_costs.get("claude", 0.0)
        starting_firecrawl_cost = st.session_state.api_costs.get("firecrawl", 0.0)
        
        try:
            if research_mode == "Quick":
                # Show starting research message
                st.session_state.research_status = "Starting quick research on topic: " + user_query
                status_container.info(st.session_state.research_status)
                
                # Add FireCrawl cost estimate (1 request)
                st.session_state.api_costs["firecrawl"] = starting_firecrawl_cost + 0.05
                
                # Update progress as it happens
                with sources_container:
                    st.subheader("Sources")
                    sources_list = st.empty()
                
                with learnings_container:
                    st.subheader("Key Learnings")
                    learnings_list = st.empty()
                
                # Perform the simple research
                result = agent.simple_research(user_query)
                
                # Extract sources from result
                sources = []
                for line in result.split("\n"):
                    if line.startswith("- http"):
                        sources.append(line[2:])
                
                # Update sources display
                sources_list.markdown("\n".join([f"- {s}" for s in sources]))
                
                # Estimate Claude usage (approx 1000 tokens)
                st.session_state.api_costs["claude"] = starting_claude_cost + 0.005
                
                # Update final response
                response_placeholder.markdown(result)
                
                # Add to chat history
                st.session_state.messages.append({"role": "assistant", "content": result})
                
            else:
                # Comprehensive research with status updates
                async def run_research_with_updates():
                    # Initialize tracking
                    sources = []
                    learnings = []
                    st.session_state.visited_urls = []
                    st.session_state.current_learnings = []
                    
                    # Create status displays
                    with sources_container:
                        st.subheader("Sources Examined")
                        sources_list = st.empty()
                    
                    with learnings_container:
                        st.subheader("Discoveries")
                        learnings_list = st.empty()
                    
                    # Function to update UI during research
                    def update_status_callback(status_type, data):
                        if status_type == "research_start":
                            st.session_state.research_status = f"Researching topic: {data}"
                            status_container.info(st.session_state.research_status)
                        
                        elif status_type == "source_processing":
                            title, url = data
                            st.session_state.research_status = f"Processing source: {title}"
                            status_container.info(st.session_state.research_status)
                            if url not in st.session_state.visited_urls:
                                st.session_state.visited_urls.append(url)
                                sources_list.markdown("\n".join([f"- [{u.split('/')[-1][:30]}...]({u})" for u in st.session_state.visited_urls]))
                            
                            # Update FireCrawl cost estimate
                            st.session_state.api_costs["firecrawl"] = starting_firecrawl_cost + (len(st.session_state.visited_urls) * 0.05)
                        
                        elif status_type == "new_learning":
                            if data not in st.session_state.current_learnings:
                                st.session_state.current_learnings.append(data)
                                learnings_list.markdown("\n".join([f"- {l}" for l in st.session_state.current_learnings]))
                        
                        elif status_type == "followup_topic":
                            st.session_state.research_status = f"Exploring subtopic: {data}"
                            status_container.info(st.session_state.research_status)
                        
                        elif status_type == "claude_call":
                            # Update Claude cost (rough estimate)
                            # Assuming average 500 tokens per call
                            current = st.session_state.api_costs.get("claude", 0.0)
                            st.session_state.api_costs["claude"] = current + 0.0025
                            
                        elif status_type == "firecrawl_call":
                            # Just update status, cost is updated when results come in
                            st.session_state.research_status = f"Searching web: {data}"
                            status_container.info(st.session_state.research_status)
                            
                        elif status_type == "rate_limit":
                            # Show rate limit warning
                            st.session_state.research_status = f"⚠️ {data}"
                            status_container.warning(st.session_state.research_status)
                            
                        elif status_type == "generating_report":
                            # Show report generation status
                            st.session_state.research_status = f"Generating report: {data}"
                            status_container.info(st.session_state.research_status)
                    
                    # Set up the agent's callback
                    agent.status_callback = update_status_callback
                    
                    # Perform research
                    st.session_state.research_status = f"Starting comprehensive research on: {user_query}"
                    status_container.info(st.session_state.research_status)
                    
                    # Run the research with depth and breadth parameters
                    results = await agent.research_topic(
                        query=user_query,
                        depth=depth,
                        breadth=breadth
                    )
                    
                    # Generate final report
                    st.session_state.research_status = "Generating final research report..."
                    status_container.info(st.session_state.research_status)
                    
                    report = agent.generate_final_report(
                        query=user_query,
                        results=results
                    )
                    
                    # Estimate final Claude usage (based on tokens processed)
                    # This is a rough estimate
                    token_estimate = len(results.learnings) * 100 + len("".join(results.learnings)) / 4
                    claude_cost = (token_estimate / 1000000) * 5.0
                    st.session_state.api_costs["claude"] = starting_claude_cost + claude_cost
                    
                    return report, results
                
                # Run the research process
                report, results = asyncio.run(run_research_with_updates())
                
                # Final report display
                response_placeholder.markdown(report)
                
                # Add to chat history
                st.session_state.messages.append({"role": "assistant", "content": report})
                
                # Update final status
                st.session_state.research_status = "Research complete!"
                status_container.success(st.session_state.research_status)
                
                # Option to save the report
                if st.button("Save Report to File"):
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    filename = f"reports/research_{user_query.replace(' ', '_')[:30]}_{timestamp}.md"
                    os.makedirs('reports', exist_ok=True)
                    with open(filename, 'w', encoding='utf-8') as f:
                        # Add cost information to the report
                        cost_info = f"\n\n## API Usage Costs\n\n"
                        cost_info += f"- Claude API: ${st.session_state.api_costs['claude']:.4f}\n"
                        cost_info += f"- FireCrawl API: ${st.session_state.api_costs['firecrawl']:.4f}\n"
                        cost_info += f"- Total Cost: ${st.session_state.api_costs['claude'] + st.session_state.api_costs['firecrawl']:.4f}\n"
                        
                        f.write(report + cost_info)
                    st.success(f"Report saved to {filename}")
                
        except Exception as e:
            error_msg = f"Error during research: {str(e)}"
            response_placeholder.error(error_msg)
            st.session_state.messages.append({"role": "assistant", "content": error_msg})