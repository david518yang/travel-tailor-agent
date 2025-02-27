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

# ------------------------------
# ResearchAssistant Class
# ------------------------------

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
        Makes a call to the Claude API with the provided prompt.
        If a context_id is given and found, it maintains the conversation history.
        Includes rate limit handling with exponential backoff.
        """
        max_retries = 5
        retry_delay = 2  # starting delay in seconds
        
        for attempt in range(max_retries):
            try:
                # Report status via callback if available
                if self.status_callback:
                    self.status_callback("claude_call", prompt[:50] + "...")
                    
                # Uncomment the following line to see the prompts sent to Claude
                # print(f"[DEBUG] Sending prompt to Claude: {prompt[:200]}...")
                if context_id and context_id in self.chat_contexts:
                    # Continue an existing conversation
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
                    # Start a new conversation
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
                
                # Handle rate limit errors with backoff
                if "rate_limit_error" in error_msg and attempt < max_retries - 1:
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    
                    # Report status via callback if available
                    if self.status_callback:
                        self.status_callback("rate_limit", f"Rate limit reached. Waiting {wait_time}s before retry...")
                    
                    print(f"Rate limit reached. Waiting {wait_time} seconds before retrying...")
                    time.sleep(wait_time)
                    continue
                elif attempt < max_retries - 1:
                    # For other errors, retry with backoff as well
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                else:
                    # Last attempt failed, raise the exception
                    raise

    def fire_crawl(self, query: str) -> List[Dict]:
        """
        Uses the FireCrawl API to perform a web search based on the query.
        Returns a list of search results (with title, URL, and markdown content).
        Includes rate limit handling with exponential backoff.
        """
        max_retries = 5
        retry_delay = 2  # starting delay in seconds
        
        for attempt in range(max_retries):
            try:
                # Report status via callback if available
                if self.status_callback:
                    self.status_callback("firecrawl_call", f"Searching for '{query}'...")
                    
                url = "https://api.firecrawl.dev/v1/search"
                payload = {
                    "query": query,
                    "limit": 3,
                    "lang": "en",
                    "country": "us",
                    "timeout": 60000,
                    "scrapeOptions": {
                        "formats": ["markdown"]
                    }
                }
                headers = {
                    "Authorization": f"Bearer {self.firecrawl_key}",
                    "Content-Type": "application/json"
                }
                response = requests.post(url, json=payload, headers=headers)
                
                if response.status_code == 200:
                    results = response.json().get("data", [])
                    print(f"[INFO] FireCrawl returned {len(results)} results for query: '{query}'")
                    return results
                elif response.status_code == 429 and attempt < max_retries - 1:
                    # Handle rate limit
                    wait_time = retry_delay * (2 ** attempt)  # Exponential backoff
                    
                    # Report status via callback if available
                    if self.status_callback:
                        self.status_callback("rate_limit", f"FireCrawl rate limit reached. Waiting {wait_time}s before retry...")
                    
                    print(f"[WARN] FireCrawl rate limit reached. Waiting {wait_time} seconds before retrying...")
                    time.sleep(wait_time)
                    continue
                elif attempt < max_retries - 1:
                    # For other errors, retry with backoff
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"[WARN] FireCrawl API error: {response.status_code} - {response.text}. Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                else:
                    # Last attempt failed
                    print(f"[ERROR] FireCrawl API error: {response.status_code} - {response.text}")
                    return []
                    
            except requests.exceptions.RequestException as e:
                error_msg = str(e)
                print(f"[ERROR] Error calling FireCrawl API (attempt {attempt+1}/{max_retries}): {error_msg}")
                
                if attempt < max_retries - 1:
                    # Retry with backoff
                    wait_time = retry_delay * (2 ** attempt)
                    print(f"[INFO] Retrying in {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                else:
                    # Last attempt failed
                    return []

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
          
        Parameters:
          - query: The current search query.
          - depth: How many layers deep the recursion should go.
          - breadth: How many follow-up topics to generate at each recursion level.
          - existing_results: Aggregates learnings and visited URLs across recursive calls.
        """
        if existing_results is None:
            existing_results = ResearchResult(learnings=[], visited_urls=[])
            
        if depth <= 0:
            return existing_results

        print(f"[INFO] Researching topic: '{query}' at depth: {depth} and breadth: {breadth}")
        # Report status via callback if available
        if self.status_callback:
            self.status_callback("research_start", query)
            
        # Get search results for the current query
        results = self.fire_crawl(query)
        for result in results:
            try:
                title = result.get("title", "")
                url = result.get("url", "")
                content = result.get("markdown", "")
                if not content:
                    print(f"[WARNING] No content found for source: {url}")
                    continue

                print(f"[INFO] Processing source: '{title}' - {url}")
                # Report source processing status
                if self.status_callback:
                    self.status_callback("source_processing", (title, url))
                    
                # Record the source URL
                existing_results.visited_urls.append(url)
                
                # Prepare a prompt to analyze the page content
                analysis_prompt = f"""
                Analyze this content about "{query}" from "{title}" and provide key learnings:
                
                Content:
                {content}
                
                Provide 2-3 key learnings, each should be specific and information-dense.
                Include any relevant numbers, dates, names, or technical details.
                Format each learning as a bullet point starting with *.
                """
                analysis = self.call_claude(analysis_prompt)
                new_learnings = self.extract_learnings(analysis)
                print(f"[INFO] Extracted learnings from {url}: {new_learnings}")
                
                # Report new learnings via callback
                if self.status_callback:
                    for learning in new_learnings:
                        self.status_callback("new_learning", learning)
                
                existing_results.learnings.extend(new_learnings)
                
                # Delay to avoid rate limits or overwhelming the API
                await asyncio.sleep(1)
            except Exception as e:
                print(f"[ERROR] Error processing result from {result.get('url', 'unknown URL')}: {str(e)}")
                continue

        # If further depth is allowed, generate follow-up topics and research them concurrently
        if depth > 1:
            followup_content = "\n".join(existing_results.learnings)
            followup_topics = self.generate_followup_topics(
                content=followup_content,
                query=query,
                num_topics=breadth
            )
            executor = ThreadPoolExecutor(max_workers=self.max_concurrent)
            loop = asyncio.get_event_loop()
            tasks = []
            for topic in followup_topics:
                # For each follow-up topic, recursively call research_topic in a separate thread
                print(f"[INFO] Recursively researching follow-up topic: '{topic['query']}' with goal: '{topic.get('research_goal', '')}'")
                
                # Report followup topic via callback
                if self.status_callback:
                    self.status_callback("followup_topic", topic['query'])
                    
                task = loop.run_in_executor(
                    executor,
                    lambda q=topic['query']: asyncio.run(self.research_topic(
                        query=q,
                        depth=depth - 1,
                        breadth=max(1, breadth - 1),
                        existing_results=existing_results
                    ))
                )
                tasks.append(task)
            await asyncio.gather(*tasks)
            executor.shutdown(wait=True)
        
        # Deduplicate the learnings and visited URLs
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
        
        # Notify about report generation
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
        # Report status
        if self.status_callback:
            self.status_callback("research_start", query)
            
        # Get search results for the query
        results = self.fire_crawl(query)
        content = ""
        urls = []
        
        for result in results:
            title = result.get("title", "")
            url = result.get("url", "")
            md_content = result.get("markdown", "")
            
            # Report source processing
            if self.status_callback:
                self.status_callback("source_processing", (title, url))
                
            if md_content:
                content += f"\n\n## {title}\n\n{md_content}"
                urls.append(url)
                
        if not content:
            return "Couldn't find relevant information on this topic."
            
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