# Findings

## Research
- **Design Review:** The wireframe (`LocalLLMTestGen.jpg`) outlines a two-part UI:
  1. **Main UI:** A chat-like interface with a history sidebar, a chat display area for generated test cases, and an input box for Jira requirements.
  2. **Settings UI:** A configuration panel for entering API keys/settings for various LLMs, including a Save button and a Test Connection button.
- **LLM Integrations:** Needs handlers for standard REST APIs (OpenAI, Claude, Gemini, Grok) and local inferencing APIs (Ollama, LM Studio). LM Studio provides an OpenAI-compatible endpoint, which simplifies integration.

## Discoveries
- Using a unified full-stack approach (like Next.js) or a Vite React + Express Node.js backend will work perfectly. Let's aim for Vite + Express to distinctively separate the "Node.js app" from the "React Frontend".

## Constraints
- **Strict Adherence:** Cannot write scripts or code until `implementation_plan.md` has an approved blueprint.
- **Output Format:** Test cases MUST be presented in a functional/non-functional Jira format.
