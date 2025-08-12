import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

def initialize_gemini():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in environment variables")
    
    # Use updated model names
    llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",  # Much faster than gemini-1.5-pro
    google_api_key=api_key,
    temperature=0.7
    )
    return llm

def chat_with_gemini():
    llm = initialize_gemini()
    
    print("🤖 Gemini Chat Started! Type 'quit' to exit.")
    print("-" * 50)
    
    while True:
        user_input = input("You: ").strip()
        
        if user_input.lower() in ['quit', 'exit', 'bye']:
            print("👋 Goodbye!")
            break
        
        if not user_input:
            continue
        
        try:
            response = llm.invoke(user_input)
            print(f"🤖 Gemini: {response.content}")
            print("-" * 50)
            
        except Exception as e:
            print(f"❌ Error: {e}")
            print("-" * 50)

if __name__ == "__main__":
    chat_with_gemini()