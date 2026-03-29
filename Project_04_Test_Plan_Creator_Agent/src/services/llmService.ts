import axios from 'axios';

export const verifyOllama = async (baseUrl: string, model: string) => {
  try {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;
    const response = await axios.get(endpoint);
    const models = response.data.models || [];
    const exists = models.some((m: any) => m.name.includes(model));
    
    if (exists) {
      return { status: 'success', message: `Ollama connected. Model '${model}' found.` };
    } else {
      return { status: 'warning', message: `Ollama connected, but model '${model}' was not found in local library. Please run 'ollama pull ${model}'.` };
    }
  } catch (error: any) {
    throw new Error(`Ollama connection failed: ${error.message}. Ensure Ollama is running at ${baseUrl}.`);
  }
};

export const verifyGroq = async (apiKey: string) => {
  if (!apiKey) throw new Error("Groq API Key is required.");
  try {
    const response = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (response.status === 200) {
      return { status: 'success', message: 'Groq API Handshake successful.' };
    }
  } catch (error: any) {
    throw new Error(`Groq connection failed: ${error.response?.data?.error?.message || error.message}`);
  }
};
