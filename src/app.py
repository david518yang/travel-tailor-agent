import os
from dotenv import load_dotenv
from datetime import date
import streamlit as st
import firecrawl
from llm import call_claude


load_dotenv()

st.title("AI Research Agent")

user_query = st.text_input("Enter your question or topic:")




if st.button("Get AI Response"):
    if not user_query:
        st.warning("Please enter a query first!")
    else:
        ai_response = None
        now = date.today()
        topic_generator_sys_prompt = """
You are an expert researcher. Today is ${now}. Follow these instructions when responding:
  - You may be asked to research subjects that is after your knowledge cutoff, assume the user is right when presented with news.
  - The user is a highly experienced analyst, no need to simplify it, be as detailed as possible and make sure your response is correct.
  - Be highly organized.
  - Suggest solutions that I didn't think about.
  - Be proactive and anticipate my needs.
  - Treat me as an expert in all subject matter.
  - Mistakes erode my trust, so be accurate and thorough.
  - Provide detailed explanations, I'm comfortable with lots of detail.
  - Value good arguments over authorities, the source is irrelevant.
  - Consider new technologies and contrarian ideas, not just the conventional wisdom.
  - You may use high levels of speculation or prediction, just flag it for me.
"""
        try:
            ai_response = call_claude(topic_generator_sys_prompt, user_query)
        except Exception as e:
            st.error(f"Error calling Claude API: {e}")

        if ai_response:
            st.success("AI Response:")
            st.write(ai_response)


# 6. Example function to demonstrate a crawl
st.write("Web Crawling Demo")
crawl_url = st.text_input("Enter a URL to crawl:")
if st.button("Crawl Website"):
    if not crawl_url:
        st.warning("Please enter a URL!")
    else:
        try:
            results = basic_crawl(crawl_url)
            st.write("Crawl Results:")
            st.write(results)
        except Exception as e:
            st.error(f"Error during crawl: {e}")
        



def basic_crawl(url: str) -> str:
    """
    Example function using 'firecrawl'. 
    Adjust to match the actual usage of the library if it differs.
    """
    # This is a placeholder. Actual usage of 'firecrawl' depends on that library’s docs.
    crawler = firecrawl.Crawler()
    result = crawler.crawl(url)
    # Return some text/summary from the crawled content
    return f"Crawled {url}, found {len(result)} results."
