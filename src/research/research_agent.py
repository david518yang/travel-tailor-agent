import anthropic
import requests
import asyncio
import re
import json
import time
from typing import List, Dict, Optional, Callable, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from firecrawl import FirecrawlApp

# ------------------------------
# Data Classes
# ------------------------------

@dataclass
class ChatContext:
    """
    Maintains a conversation context for interactions with Claude.
    - messages: A list of message dictionaries.
    - created_at: The timestamp when the conversation started.
    """
    messages: List[Dict]
    created_at: datetime

@dataclass
class ResearchResult:
    """
    Holds research outcomes:
    - learnings: A list of key learnings extracted from content.
    - visited_urls: A list of URLs that were used as sources.
    """
    learnings: List[str]
    visited_urls: List[str]


class ResearchAgent:
    """
    Provides methods to perform research by:
      - Querying the FireCrawl API for search results.
      - Using the Claude API (via Anthropics) for content analysis and follow-up topic generation.
      - Recursively researching follow-up topics.
      - Generating a final markdown report.
    """
    def __init__(self, anthropic_api_key: str, firecrawl_api_key: str):
        self.client = anthropic.Client(api_key=anthropic_api_key)
        self.firecrawl_key = firecrawl_api_key
        self.firecrawlapp = FirecrawlApp(firecrawl_api_key)
        self.chat_contexts: Dict[str, ChatContext] = {}
        self.max_concurrent = 2  # Maximum concurrent research threads
        self.status_callback: Optional[Callable[[str, Any], None]] = None

    def call_claude(self, prompt: str, context_id: Optional[str] = None) -> str:
        """
        Makes a call to the Claude API with provided prompt.
        If a context_id is given and found, it maintains the conversation history.
        Includes rate limit handling with exponential backoff.
        """
        max_retries = 3
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                if self.status_callback:
                    self.status_callback("claude_call", prompt[:50] + "...")
                    
                if context_id and context_id in self.chat_contexts:
                    context = self.chat_contexts[context_id]
                    context.messages.append({
                        "role": "user",
                        "content": prompt
                    })
                    response = self.client.messages.create(
                        model="claude-3-5-haiku-20241022",
                        messages=context.messages,
                        max_tokens=4096
                    )
                    context.messages.append({
                        "role": "assistant",
                        "content": response.content[0].text
                    })
                    return response.content[0].text
                else:
                    new_context = ChatContext(
                        messages=[{"role": "user", "content": prompt}],
                        created_at=datetime.now()
                    )
                    response = self.client.messages.create(
                        model="claude-3-5-haiku-20241022",
                        messages=new_context.messages,
                        max_tokens=4096
                    )
                    new_context.messages.append({
                        "role": "assistant",
                        "content": response.content[0].text
                    })
                    if context_id:
                        self.chat_contexts[context_id] = new_context
                    return response.content[0].text
                    
            except Exception as e:
                error_msg = str(e)
                print(f"Error calling Claude API (attempt {attempt+1}/{max_retries}): {error_msg}")
                
                if "rate_limit_error" in error_msg and attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"Rate limit reached. Waiting {wait_time}s before retrying...")
                    time.sleep(wait_time)
                    continue
                elif attempt < max_retries - 1:
                    continue
                else:
                    raise

    def fire_crawl(self, query: str) -> List[Dict]:
        """Uses the FireCrawl API to perform a web search."""
        try:
            print(f"[INFO] Searching FireCrawl for '{query}'")
            if self.status_callback:
                self.status_callback("firecrawl_call", f"Searching for '{query}'")
                
            response = self.firecrawlapp.search(
                query=query,
                limit=3,
                country="us",
                scrape=True,
                scrape_formats=["markdown"],
                timeout=20 
            )
            
            if not response or not response.data:
                print(f"[WARN] FireCrawl returned no results for '{query}'")
                if self.status_callback:
                    self.status_callback("rate_limit", "No search results found. Using Claude's knowledge instead.")
                
                return [{
                    "title": "Using Claude's knowledge",
                    "url": "https://example.com/claude-knowledge",
                    "markdown": f"Research for '{query}' will use Claude's built-in knowledge instead of live web search due to API limitations."
                }]
                
            results = []
            for item in response.data:
                results.append({
                    "title": item.title or "Untitled Page",
                    "url": item.url,
                    "markdown": item.markdown or f"No content extracted from {item.url}"
                })
                
            print(f"[INFO] Found {len(results)} results from FireCrawl")
            return results
                
        except Exception as e:
            print(f"[ERROR] FireCrawl search failed: {str(e)}")
            if self.status_callback:
                self.status_callback("rate_limit", f"Search error: {str(e)[:100]}")
                
            return [{
                "title": "Using Claude's knowledge (API Error)",
                "url": "https://example.com/claude-knowledge",
                "markdown": f"Research for '{query}' will use Claude's built-in knowledge instead of live web search due to API errors."
            }]

    def generate_followup_topics(self, content: str, query: str, num_topics: int = 3) -> List[Dict]:
        """
        Generates follow-up research topics from the accumulated research learnings.
        The follow-up topics are more specific queries with an associated research goal.
        """
        prompt = f"""
        Given the following content from research about "{query}", generate {num_topics} follow-up research topics.
        Each topic should be more specific than the original query.
        
        Content:
        {content}
        
        Return exactly {num_topics} topics, each with:
        1. A specific search query
        2. The research goal explaining what we hope to learn
        
        Format as a JSON object with keys 'query' and 'research_goal'.
        """
        response = self.call_claude(prompt)
        try:
            topics = json.loads(response)
            if not isinstance(topics, list):
                raise ValueError("Expected a list of topics in JSON format")
            for topic in topics:
                if 'query' not in topic or 'research_goal' not in topic:
                    raise ValueError("Each topic must have 'query' and 'research_goal' keys")
        except json.JSONDecodeError as e:
            print(f"[ERROR] Error decoding JSON from Claude response: {str(e)}")
            return []
        except ValueError as e:
            print(f"[ERROR] Error parsing topics from Claude response: {str(e)}")
            return []
        
        print(f"[INFO] Generated follow-up topics for '{query}': {topics}")
        return topics[:num_topics]

    def extract_learnings(self, content: str) -> List[str]:
        """
        Extracts key learning points from the provided content.
        It looks for bullet points (lines starting with '*' or '-').
        """
        learnings = []
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('*') or line.startswith('-'):
                learning = line.lstrip('*- ').strip()
                if learning:
                    learnings.append(learning)
        return learnings

    async def research_topic(self, query: str, depth: int = 2, breadth: int = 2,
                         existing_results: ResearchResult = None) -> ResearchResult:
        """
        Recursively researches a topic:
          - Searches for content using FireCrawl.
          - Analyzes the content with Claude to extract key learnings.
          - If depth permits, generates follow-up topics and recursively researches them.
        """
        if existing_results is None:
            existing_results = ResearchResult(learnings=[], visited_urls=[])
            
        if depth <= 0:
            return existing_results
            
        print(f"[INFO] Starting research for '{query}' (depth={depth})")
        if self.status_callback:
            self.status_callback("research_start", query)
        
        try:
            results = self.fire_crawl(query)
            if not results:
                print(f"[WARN] No results found for '{query}'")
                if self.status_callback:
                    self.status_callback("rate_limit", f"No results found for '{query}'")
                return existing_results
                
            print(f"[INFO] Processing {len(results)} results")
            
            for result in results:
                try:
                    title = result.get("title", "")
                    url = result.get("url", "")
                    content = result.get("markdown", "")
                    
                    if self.status_callback:
                        self.status_callback("source_processing", (title, url))
                    
                    if not content:
                        print(f"[WARN] Empty content for {url}")
                        continue
                        
                    print(f"[INFO] Analyzing content from {url}")
                    existing_results.visited_urls.append(url)
                    
                    analysis_prompt = f"""
                    Analyze this content about "{query}" from "{title}":
                    
                    {content[:5000]}
                    
                    Provide 2-3 key learnings as bullet points starting with *.
                    """
                    
                    analysis = self.call_claude(analysis_prompt)
                    
                    new_learnings = self.extract_learnings(analysis)
                    if new_learnings:
                        print(f"[INFO] Found {len(new_learnings)} learnings")
                        for learning in new_learnings:
                            if self.status_callback:
                                self.status_callback("new_learning", learning)
                        existing_results.learnings.extend(new_learnings)
                    
                except Exception as e:
                    print(f"[ERROR] Failed to process result: {str(e)}")
                    continue
                    
            if depth > 1 and existing_results.learnings:
                followup_content = "\n".join(existing_results.learnings)
                
                followup_topics = self.generate_followup_topics(
                    content=followup_content,
                    query=query,
                    num_topics=breadth
                )
                
                print(f"[INFO] Generated {len(followup_topics)} follow-up topics")
                
                follow_up_tasks = []
                for topic in followup_topics:
                    topic_query = topic.get('query')
                    if not topic_query:
                        continue
                        
                    print(f"[INFO] Will explore follow-up topic: {topic_query}")
                    if self.status_callback:
                        self.status_callback("followup_topic", topic_query)
                    
                    follow_up_tasks.append(
                        self.research_topic(
                            query=topic_query,
                            depth=depth-1,
                            breadth=max(1, breadth-1),
                            existing_results=existing_results
                        )
                    )
                
                if follow_up_tasks:
                    await asyncio.gather(*follow_up_tasks)
                    
        except Exception as e:
            print(f"[ERROR] Research failed: {str(e)}")
            if self.status_callback:
                self.status_callback("rate_limit", f"Research error: {str(e)[:100]}")
            
        existing_results.learnings = list(set(existing_results.learnings))
        existing_results.visited_urls = list(set(existing_results.visited_urls))
        
        return existing_results

    def generate_final_report(self, query: str, results: ResearchResult) -> str:
        """
        Generates a comprehensive markdown research report based on the collected learnings.
        The report includes:
          - An executive summary.
          - Logical sections detailing the findings.
          - A sources section listing all visited URLs.
        """
        print(f"[INFO] Generating final report using {len(results.learnings)} learnings and {len(results.visited_urls)} sources")
        
        if self.status_callback:
            self.status_callback("generating_report", f"Creating report with {len(results.learnings)} learnings")
            
        prompt = f"""
        Create a comprehensive research report on: {query}

        Use these learnings to create the report:
        {'\n'.join('- ' + learning for learning in results.learnings)}

        The report should:
        1. Start with an executive summary
        2. Be organized into logical sections
        3. Include all key findings and details
        4. End with conclusions and potential areas for further research

        Use markdown formatting.
        """
        report = self.call_claude(prompt)
        sources_section = "\n\n## Sources\n\n" + "\n".join(f"- {url}" for url in results.visited_urls)
        return report + sources_section

    def simple_research(self, query: str) -> str:
        """
        Performs a simpler non-recursive search for quick responses
        """
        if self.status_callback:
            self.status_callback("research_start", query)
            
        results = self.fire_crawl(query)
        content = ""
        urls = []
        
        if not results:
            if self.status_callback:
                self.status_callback("rate_limit", "No search results found. Using Claude's knowledge directly.")
                self.status_callback("source_processing", ("Using Claude's knowledge", "No web search"))
            
            fallback_prompt = f"""
            I need to research "{query}" but don't have access to search results right now.
            Please provide a comprehensive overview based on your knowledge.
            
            Include:
            1. Key facts and information about {query}
            2. Important concepts, dates, people, or events related to this topic
            3. A balanced perspective showing different viewpoints if applicable
            4. A brief conclusion
            
            Format your response in markdown with clear sections.
            """
            
            if self.status_callback:
                self.status_callback("new_learning", "Using Claude's knowledge instead of web search")
                
            response = self.call_claude(fallback_prompt)
            disclaimer = f"\n\n> *Note: This research was generated using Claude's knowledge rather than live web search results due to API limitations.*"
            return response + disclaimer
        
        for result in results:
            title = result.get("title", "")
            url = result.get("url", "")
            md_content = result.get("markdown", "")
            
            if self.status_callback:
                self.status_callback("source_processing", (title, url))
                
            if md_content:
                content += f"\n\n## {title}\n\n{md_content}"
                urls.append(url)
                
        if not content:
            if self.status_callback:
                self.status_callback("rate_limit", "Search results had no content. Using Claude's knowledge directly.")
            
            fallback_prompt = f"""
            Please provide a thorough research summary about "{query}" based on your knowledge.
            Structure your response with:
            1. An overview of the topic
            2. Key details and insights
            3. A conclusion
            
            Use markdown formatting.
            """
            
            response = self.call_claude(fallback_prompt)
            disclaimer = f"\n\n> *Note: This research was generated using Claude's knowledge rather than live web search results.*"
            return response + disclaimer
            
        prompt = f"""
        Based on the following research materials about "{query}", provide a concise summary:
        
        {content}
        
        Your response should be well-structured with:
        1. Key findings and insights
        2. Important details
        3. A brief conclusion
        
        Use markdown formatting.
        """
        
        response = self.call_claude(prompt)
        sources = "\n\n## Sources\n\n" + "\n".join(f"- {url}" for url in urls)
        
        return response + sources