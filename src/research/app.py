import os
import asyncio
import time
from datetime import datetime
import streamlit as st
from dotenv import load_dotenv
from src.research.research_agent import ResearchAgent, ResearchResult
import json
import threading

# streamlit config
st.set_page_config(
    page_title="Research Assistant",
    page_icon="🔍",
    layout="wide"
)

st.markdown("""
<style>
.cost-container {
    font-size: 0.8em;
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: rgba(240, 242, 246, 0.9);
    padding: 8px;
    border-radius: 5px;
    border: 1px solid #ddd;
    width: 200px;
    z-index: 1000;
}
.stChatMessage {
    padding: 10px 0;
}
.thinking-message {
    color: #5a5a5a;
    font-style: italic;
}
.source-message {
    color: #2b5797;
}
.learning-message {
    color: #107c10;
}
.error-message {
    color: #d13438;
}
.step-counter {
    font-weight: bold;
    color: #6c5ce7;
    margin-right: 6px;
}
.subtopic-counter {
    font-weight: bold;
    color: #00b894;
    margin-right: 6px;
}
</style>
""", unsafe_allow_html=True)

load_dotenv()
anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")

if "messages" not in st.session_state:
    st.session_state.messages = []
if "api_costs" not in st.session_state:
    st.session_state.api_costs = {"claude": 0.0, "firecrawl": 0.0}
if "depth" not in st.session_state:
    st.session_state.depth = 2
if "breadth" not in st.session_state:
    st.session_state.breadth = 2
if "research_mode" not in st.session_state:
    st.session_state.research_mode = "Quick"
if "save_report_key" not in st.session_state:
    st.session_state.save_report_key = None
if "current_report" not in st.session_state:
    st.session_state.current_report = None
if "processing" not in st.session_state:
    st.session_state.processing = False
if "new_query" not in st.session_state:
    st.session_state.new_query = None

@st.cache_resource
def get_research_agent():
    return ResearchAgent(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )

st.title("🔍 AI Research Assistant Chat")

with st.container():
    cols = st.columns([1, 1, 2, 1])
    
    with cols[0]:
        st.session_state.depth = st.select_slider(
            "Research Depth", 
            options=[1, 2, 3], 
            value=st.session_state.depth,
            help="How many levels of subtopics to explore",
            disabled=st.session_state.processing
        )
        
    with cols[1]:
        st.session_state.breadth = st.select_slider(
            "Research Breadth", 
            options=[1, 2, 3], 
            value=st.session_state.breadth,
            help="How many subtopics to explore at each level",
            disabled=st.session_state.processing
        )
        
    with cols[2]:
        st.session_state.research_mode = st.radio(
            "Research Mode",
            ["Quick", "Comprehensive"],
            index=0 if st.session_state.research_mode == "Quick" else 1,
            horizontal=True,
            help="Quick for faster results, Comprehensive for in-depth analysis",
            disabled=st.session_state.processing
        )
    
    with cols[3]:
        if st.button("Reset Chat", use_container_width=True, disabled=st.session_state.processing):
            st.session_state.messages = []
            st.session_state.save_report_key = None
            st.session_state.current_report = None
            st.session_state.api_costs = {"claude": 0.0, "firecrawl": 0.0}
            st.session_state.processing = False
            st.session_state.new_query = None
            st.rerun()

claude_cost = st.session_state.api_costs.get("claude", 0.0)
firecrawl_cost = st.session_state.api_costs.get("firecrawl", 0.0)
total_cost = claude_cost + firecrawl_cost

st.markdown(f"""
<div class="cost-container">
    <div><b>API Costs</b></div>
    <div>Claude: ${claude_cost:.4f}</div>
    <div>FireCrawl: ${firecrawl_cost:.4f}</div>
    <div><b>Total: ${total_cost:.4f}</b></div>
</div>
""", unsafe_allow_html=True)

for message in st.session_state.messages:
    if message["role"] == "user":
        with st.chat_message("user"):
            st.markdown(message["content"])
    
    elif message["role"] == "assistant":
        if message["type"] == "thinking":
            with st.chat_message("assistant"):
                st.markdown(f"<div class='thinking-message'>💭 {message['content']}</div>", unsafe_allow_html=True)
        
        elif message["type"] == "source":
            with st.chat_message("assistant"):
                st.markdown(f"<div class='source-message'>📚 {message['content']}</div>", unsafe_allow_html=True)
        
        elif message["type"] == "learning":
            with st.chat_message("assistant"):
                st.markdown(f"<div class='learning-message'>💡 {message['content']}</div>", unsafe_allow_html=True)
        
        elif message["type"] == "rate_limit":
            with st.chat_message("assistant"):
                st.markdown(f"<div class='error-message'>⚠️ {message['content']}</div>", unsafe_allow_html=True)
                
        elif message["type"] == "status":
            with st.chat_message("assistant"):
                st.markdown(f"<div class='thinking-message'>🔍 {message['content']}</div>", unsafe_allow_html=True)
                
        else:
            with st.chat_message("assistant"):
                st.markdown(message["content"])

if st.session_state.save_report_key:
    if st.button("Save Report to File", key=st.session_state.save_report_key):
        if st.session_state.current_report:
            report = st.session_state.current_report
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"reports/research_{report['query'].replace(' ', '_')[:30]}_{timestamp}.md"
            os.makedirs('reports', exist_ok=True)
            
            with open(filename, 'w', encoding='utf-8') as f:
                cost_info = f"\n\n## API Usage Costs\n\n"
                cost_info += f"- Claude API: ${st.session_state.api_costs['claude']:.4f}\n"
                cost_info += f"- FireCrawl API: ${st.session_state.api_costs['firecrawl']:.4f}\n"
                cost_info += f"- Total Cost: ${st.session_state.api_costs['claude'] + st.session_state.api_costs['firecrawl']:.4f}\n"
                
                f.write(report['content'] + cost_info)
            
            st.success(f"Report saved to {filename}")
            st.session_state.save_report_key = None

user_query = st.chat_input("What would you like me to research?", disabled=st.session_state.processing)

if user_query:
    st.session_state.messages.append({"role": "user", "content": user_query})
    
    st.session_state.processing = True
    st.session_state.new_query = user_query
    
    st.session_state.messages.append({
        "role": "assistant", 
        "type": "thinking",
        "content": "I'm thinking about how to research this topic..."
    })
    
    st.rerun()

if st.session_state.processing and st.session_state.new_query:
    query = st.session_state.new_query
    st.session_state.new_query = None
    
    starting_claude_cost = st.session_state.api_costs.get("claude", 0.0)
    starting_firecrawl_cost = st.session_state.api_costs.get("firecrawl", 0.0)
    
    agent = get_research_agent()
    
    step_counter = {
        "total": 0,
        "subtopic": 0
    }
    
    def update_status_callback(status_type, data):
        if status_type == "research_start":
            if data == query: 
                step_counter["total"] = 1
                step_counter["subtopic"] = 0
                prefix = f"<span class='step-counter'>Step {step_counter['total']}:</span>"
            else:  # This is a subtopic
                step_counter["subtopic"] += 1
                prefix = f"<span class='subtopic-counter'>Subtopic {step_counter['subtopic']}:</span>"
                
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "status",
                "content": f"{prefix} Starting research on: {data}"
            })
            st.rerun()
        
        elif status_type == "source_processing":
            step_counter["total"] += 1
            title, url = data
            
            if len(title) > 60:
                title = title[:57] + "..."
                
            if len(url) > 60:
                parsed_url = urlparse(url)
                url = f"{parsed_url.netloc}/.../{parsed_url.path.split('/')[-1]}"
                
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "source",
                "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Reading source: {title} (<a href='{url}' target='_blank'>{url}</a>)"
            })
            
            st.session_state.api_costs["firecrawl"] = starting_firecrawl_cost + 0.05
            st.rerun()
        
        elif status_type == "new_learning":
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "learning",
                "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Discovered: {data}"
            })
            st.rerun()
        
        elif status_type == "followup_topic":
            step_counter["total"] += 1
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "status",
                "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Exploring subtopic: {data}"
            })
            st.rerun()
        
        elif status_type == "claude_call":
            current = st.session_state.api_costs.get("claude", 0.0)
            st.session_state.api_costs["claude"] = current + 0.0025
            
            if step_counter["total"] % 2 == 0: 
                st.session_state.messages.append({
                    "role": "assistant", 
                    "type": "thinking",
                    "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Analyzing content: {data}"
                })
                st.rerun()
            
        elif status_type == "firecrawl_call":
            step_counter["total"] += 1
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "status",
                "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Searching web: {data}"
            })
            st.rerun()
            
        elif status_type == "rate_limit":
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "rate_limit",
                "content": f"⚠️ {data}"
            })
            st.rerun()
            
        elif status_type == "generating_report":
            step_counter["total"] += 1
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "status",
                "content": f"<span class='step-counter'>Step {step_counter['total']}:</span> Generating final report..."
            })
            st.rerun()
    
    agent.status_callback = update_status_callback
    
    try:
        if st.session_state.research_mode == "Quick":
            result = agent.simple_research(query)
            
            st.session_state.api_costs["claude"] = starting_claude_cost + 0.005
            
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "response",
                "content": result
            })
            
        else:
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                results = loop.run_until_complete(agent.research_topic(
                    query=query,
                    depth=st.session_state.depth,
                    breadth=st.session_state.breadth
                ))
                loop.close()
            except Exception as e:
                print(f"[ERROR] Async research error: {str(e)}")
                results = ResearchResult(learnings=[], visited_urls=[])
            
            report = agent.generate_final_report(
                query=query,
                results=results
            )
            
            token_estimate = len(results.learnings) * 100 + len("".join(results.learnings)) / 4
            claude_cost = (token_estimate / 1000000) * 5.0
            st.session_state.api_costs["claude"] = starting_claude_cost + claude_cost
            
            st.session_state.messages.append({
                "role": "assistant", 
                "type": "response",
                "content": report
            })
            
            st.session_state.save_report_key = f"save_report_{int(time.time())}"
            st.session_state.current_report = {
                "query": query,
                "content": report
            }
            
    except Exception as e:
        error_msg = f"Error during research: {str(e)}"
        st.session_state.messages.append({
            "role": "assistant", 
            "type": "error",
            "content": error_msg
        })
    
    st.session_state.processing = False
    
    st.rerun()