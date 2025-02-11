import anthropic
import os
import requests
from dotenv import load_dotenv
from typing import List, Dict, Optional
import json
from dataclasses import dataclass
from datetime import datetime
import asyncio

load_dotenv()


@dataclass
class ChatContext:
    messages: List[Dict]
    created_at: datetime

@dataclass
class ResearchResult:
    learnings: List[str]
    visited_urls: List[str]

class ResearchAgent:
    def __init__(self, anthropic_api_key: str, firecrawl_api_key: str):
        self.client = anthropic.Client(api_key=anthropic_api_key)
        self.firecrawl_key = firecrawl_api_key
        self.chat_contexts: Dict[str, ChatContext] = {}
        
    def call_claude(self, prompt: str, context_id: Optional[str] = None) -> str:
        """
        Makes a call to Claude API, maintaining conversation context if provided
        
        Args:
            prompt: The user's prompt
            context_id: Optional ID to maintain conversation context
            
        Returns:
            Claude's response as a string
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
            print(f"Error calling Claude: {str(e)}")
            raise

    def fire_crawl(self, query: str) -> str:
        """
        Performs a web crawl using FireCrawl API
        
        Args:
            query: Search query string
            
        Returns:
            Markdown string of crawled content
        """
        try:
            base_url = "https://api.firecrawl.com/search"
            
            params = {
                "query": query,
                "format": "markdown",
                "limit": 5
            }
            
            headers = {
                "Authorization": f"Bearer {self.firecrawl_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.get(
                base_url,
                params=params,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                results = response.json()
                
                # Combine all markdown content with separators
                combined_md = ""
                for result in results.get("data", []):
                    if md_content := result.get("markdown"):
                        combined_md += f"\n\n---\n\n{md_content}"
                
                return combined_md.strip()
            else:
                print(f"FireCrawl API error: {response.status_code}")
                return ""
                
        except requests.exceptions.Timeout:
            print("FireCrawl API timeout")
            return ""
        except Exception as e:
            print(f"Error calling FireCrawl API: {str(e)}")
            return ""

    def research_topic(self, query: str, depth: int = 3) -> str:
        """
        Combines FireCrawl and Claude to research a topic
        
        Args:
            query: Research query
            depth: Search depth
            
        Returns:
            Summarized research findings
        """
        # First get web content
        crawl_results = self.fire_crawl(query, depth)
        
        if not crawl_results:
            return "Unable to gather research materials"
            
        # Ask Claude to analyze the results
        analysis_prompt = f"""
        Please analyze these research materials and provide a detailed summary:
        
        Query: {query}
        
        Materials:
        {crawl_results}
        
        Please structure your response with:
        1. Key Findings
        2. Important Details
        3. Additional Research Suggestions
        """
        
        return self.call_claude(analysis_prompt)


# def call_claude(prompt: str) -> str:
#     api_key = os.environ.get("ANTHROPIC_API_KEY")
#     client = anthropic.Anthropic(api_key=api_key)
    
#     message = client.messages.create(
#         model = "claude-3-5-haiku-20241022",
#         max_tokens=1024,
#         temperature=0,
#         system=system,
#         messages = [
#             {
#                 "role": "user",
#                 "content": [
#                     {
#                         "type": "text",
#                         "text": prompt
#                     }
#                 ]
#             }
#         ]
#     )
    
#     return message.content[0].text