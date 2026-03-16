import { getAllSettings } from './db';
import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

const systemPrompt = `You are an expert QA testing assistant. Your job is to generate test cases based on user requirements.
You MUST output the test cases in a strict Jira ticket format containing both Functional and Non-Functional testing aspects.

Please adhere strictly to this format for EACH test case:
**Summary:** [A brief summary of what is being tested]
**Type:** [Functional / Non-Functional (Performance, Security, etc.)]
**Description:** [Detailed description of the test logic]
**Pre-conditions:**
- [Condition 1]
- [Condition 2]
**Steps:**
1. [Step 1]
2. [Step 2]
**Expected Result:** [What should happen]
**Priority:** [High/Medium/Low]

Do not include any conversational filler text. Only output the test cases.`;

export async function generateTestCases(requirement: string, provider: 'ollama' | 'openai' | 'groq' | 'claude'): Promise<string> {
    const settings = await getAllSettings();

    try {
        if (provider === 'openai') {
            const apiKey = settings['openaiKey'];
            if (!apiKey) throw new Error("OpenAI API Key not configured.");
            const openai = new OpenAI({ apiKey });
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: requirement }
                ]
            });
            return response.choices[0]?.message?.content || 'No response from OpenAI.';
        }

        if (provider === 'groq') {
            const apiKey = settings['groqKey'];
            if (!apiKey) throw new Error("Groq API Key not configured.");
            // Groq uses OpenAI SDK compatibility
            const groq = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
            const response = await groq.chat.completions.create({
                model: 'openai/gpt120b',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: requirement }
                ]
            });
            return response.choices[0]?.message?.content || 'No response from Groq.';
        }

        if (provider === 'claude') {
            const apiKey = settings['claudeKey'];
            if (!apiKey) throw new Error("Claude API Key not configured.");
            const anthropic = new Anthropic({ apiKey });
            const response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 2000,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: requirement }
                ]
            });
            // @ts-ignore
            return response.content[0]?.text || 'No response from Claude.';
        }

        if (provider === 'ollama') {
            const ollamaUrl = settings['ollamaUrl'] || 'http://localhost:11434';
            // Simple fetch for ollama chat endpoint
            const res = await fetch(`${ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama3.2', // default local model
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: requirement }
                    ],
                    stream: false
                })
            });
            const data = await res.json();
            return data.message?.content || 'No response from Ollama.';
        }

        return "Unsupported provider.";

    } catch (error: any) {
        console.error("LLM Generation Error:", error);
        throw new Error(`Generation failed: ${error.message}`);
    }
}
