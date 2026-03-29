import axios from 'axios';
import { LLMConfig, JiraIssue } from '../types';
import { TEST_PLAN_GENERATOR_PROMPT, TEST_CASE_GENERATOR_PROMPT } from '../constants/prompts';

export const generateTestPlanResult = async (
  config: LLMConfig, 
  productName: string, 
  jiraIssues: JiraIssue[], 
  additionalContext: string,
  outputType: 'plan' | 'cases' = 'plan'
): Promise<string> => {
  const { provider, apiKey, baseUrl, model } = config;
  
  // Prepare Jira context
  const jiraContext = jiraIssues.map(issue => 
    `Issue: ${issue.key}\nSummary: ${issue.summary}\nDescription: ${issue.description}\nStatus: ${issue.status}`
  ).join('\n---\n');

  const basePrompt = outputType === 'cases' ? TEST_CASE_GENERATOR_PROMPT : TEST_PLAN_GENERATOR_PROMPT;

  const fullPrompt = basePrompt
    .replaceAll('{productName}', productName)
    .replaceAll('{jiraContext}', jiraContext)
    .replaceAll('{additionalContext}', additionalContext);



  try {
    if (provider === 'Ollama') {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/generate`;
      const response = await axios.post(endpoint, {
        model,
        prompt: fullPrompt,
        stream: false
      });
      return response.data.response;
    } else if (provider === 'Groq') {
      const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      const groqModel = model === 'llama3' || model === '' ? 'llama3-70b-8192' : model;
      
      const response = await axios.post(endpoint, {
        model: groqModel,
        messages: [{ role: 'user', content: fullPrompt }],
        max_tokens: 3000, // Reduced to avoid hitting 8192 total limit with long prompts
        temperature: 0.2
      }, {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      return response.data.choices[0].message.content;

    } else {
      throw new Error(`Provider ${provider} not supported for generation yet.`);
    }
  } catch (error: any) {
    const errorDetails = error.response?.data?.error?.message || error.response?.data || error.message;
    throw new Error(`LLM Error: ${JSON.stringify(errorDetails)}`);
  }
};
