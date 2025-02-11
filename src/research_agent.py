import anthropic
import requests
import asyncio
import re
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import os
from dotenv import load_dotenv
from firecrawl import FirecrawlApp
load_dotenv()

@dataclass
class ChatContext:
    messages: List[Dict]
    created_at: datetime

@dataclass
class ResearchResult:
    learnings: List[str]
    visited_urls: List[str]

class ResearchAssistant:
    def __init__(self, anthropic_api_key: str, firecrawl_api_key: str):
        self.client = anthropic.Client(api_key=anthropic_api_key)
        self.firecrawl_key = firecrawl_api_key
        self.firecrawlapp = FirecrawlApp(firecrawl_api_key)
        self.chat_contexts: Dict[str, ChatContext] = {}
        self.max_concurrent = 2

    def call_claude(self, prompt: str, context_id: Optional[str] = None) -> str:
        """
        Makes a call to Claude API, maintaining conversation context if provided
        """
        try:
            if context_id and context_id in self.chat_contexts:
                # Append to existing conversation
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
                # Start new conversation
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
            print(f"Error calling Claude API: {str(e)}")
            raise

    def fire_crawl(self, query: str) -> str:
        """
        Performs a web crawl using FireCrawl API
        """
        try:
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

            response = requests.post(
                url, 
                json=payload,
                headers=headers
            )
            
            if response.status_code == 200:
                return response.json().get("data", [])
            else:
                print(f"FireCrawl API error: {response.status_code} - {response.text}")
                return []
                
        except requests.exceptions.RequestException as e:
            print(f"Error calling FireCrawl API: {str(e)}")
            return []

    def extract_urls_from_markdown(self, content: str) -> List[str]:
        """
        Extract URLs from markdown content
        """
        # Match markdown links [text](url) and bare URLs
        url_pattern = r'\[([^\]]+)\]\((http[s]?://[^\s\)]+)\)|(?<![\(\[])(http[s]?://[^\s\)\]]+)'
        urls = []
        
        for match in re.finditer(url_pattern, content):
            url = match.group(2) if match.group(2) else match.group(1)
            # Basic URL validation
            try:
                result = urlparse(url)
                if all([result.scheme, result.netloc]):
                    urls.append(url)
            except:
                continue
                
        return urls

    def generate_followup_topics(self, content: str, query: str, num_topics: int = 3) -> List[Dict]:
        """
        Generate follow-up research topics based on content
        """
        prompt = f"""
        Given the following content from research about "{query}", generate {num_topics} follow-up research topics.
        Each topic should be more specific than the original query.
        
        Content:
        {content}
        
        Return exactly {num_topics} topics, each with:
        1. A specific search query
        2. The research goal explaining what we hope to learn
        
        Format as:
        Query: <query>
        Goal: <research goal>
        """
        
        response = self.call_claude(prompt)
        
        # Parse response into structured format
        topics = []
        current_topic = {}
        
        for line in response.split('\n'):
            if line.startswith('Query:'):
                if current_topic:
                    topics.append(current_topic)
                current_topic = {'query': line[6:].strip()}
            elif line.startswith('Goal:'):
                current_topic['research_goal'] = line[5:].strip()
                
        if current_topic:
            topics.append(current_topic)
            
        return topics[:num_topics]

    def extract_learnings(self, content: str) -> List[str]:
        """
        Extract learning points from Claude's analysis
        """
        learnings = []
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('*') or line.startswith('-'):
                learning = line.lstrip('*- ').strip()
                if learning:
                    learnings.append(learning)
        return learnings

    async def research_topic(self, 
                           query: str, 
                           depth: int = 2, 
                           breadth: int = 2,
                           existing_results: ResearchResult = None) -> ResearchResult:
        """
        Recursively research a topic with specified depth and breadth
        """
        if existing_results is None:
            existing_results = ResearchResult(learnings=[], visited_urls=[])
            
        if depth <= 0:
            return existing_results
            
        # Get search results
        results = self.fire_crawl(query)
        
        # Process each result separately
        for result in results:
            try:
                title = result.get("title", "")
                url = result.get("url", "")
                content = result.get("markdown", "")
                
                if not content:
                    continue
                    
                # Add URL to visited list
                existing_results.visited_urls.append(url)
                
                # Analyze single page content
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
                existing_results.learnings.extend(new_learnings)
                
                # Add small delay between API calls
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"Error processing result: {str(e)}")
                continue
        
        if depth > 1:
            # Generate follow-up topics from accumulated learnings
            followup_content = "\n".join(existing_results.learnings)
            followup_topics = self.generate_followup_topics(
                content=followup_content,
                query=query,
                num_topics=breadth
            )
            
            # Create thread pool
            executor = ThreadPoolExecutor(max_workers=self.max_concurrent)
            loop = asyncio.get_event_loop()
            
            # Research each topic concurrently
            tasks = []
            for topic in followup_topics:
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
                
            # Wait for all tasks to complete
            await asyncio.gather(*tasks)
            
            # Clean up executor
            executor.shutdown(wait=True)
        
        # Deduplicate results
        existing_results.learnings = list(set(existing_results.learnings))
        existing_results.visited_urls = list(set(existing_results.visited_urls))
        
        return existing_results

    def generate_final_report(self, query: str, results: ResearchResult) -> str:
        """
        Generate a final report from all research results
        """
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
        
        # Add sources section
        sources_section = "\n\n## Sources\n\n" + \
                         "\n".join(f"- {url}" for url in results.visited_urls)
        
        return report + sources_section

async def main():
    """Example usage of the ResearchAssistant"""
    
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
    firecrawl_api_key = os.environ.get("FIRECRAWL_API_KEY")
    assistant = ResearchAssistant(
        anthropic_api_key=anthropic_api_key,
        firecrawl_api_key=firecrawl_api_key
    )
    
    # Example research query
    query = "quantum computing advantages"
    
    print(f"Starting research on: {query}")
    results = await assistant.research_topic(
        query=query,
        depth=2,
        breadth=2
    )
    
    print(f"\nFound {len(results.learnings)} learnings from {len(results.visited_urls)} sources")
    
    print("\nGenerating final report...")
    report = assistant.generate_final_report(
        query=query,
        results=results
    )
    
    # Create reports directory if it doesn't exist
    os.makedirs('reports', exist_ok=True)
    
    # Generate filename based on query and timestamp
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"reports/research_{query.replace(' ', '_')}_{timestamp}.md"
    
    # Save report to file
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"\nReport saved to: {filename}")
    print("\nReport preview:")
    print("=" * 40)
    # Print first 500 characters of report
    print(report[:500] + "...")

if __name__ == "__main__":
    asyncio.run(main())