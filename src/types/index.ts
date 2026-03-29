export type ALMProvider = 'Jira' | 'ADO' | 'X-Ray';
export type LLMProvider = 'Ollama' | 'Groq' | 'OpenAI';

export interface Connection {
  id: string;
  type: ALMProvider;
  name: string;
  url: string;
  email?: string;
  apiToken: string;
}

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
}

export interface TestPlan {
  meta: {
    productName: string;
    projectKey: string;
    version: string;
    date: string;
  };
  sections: {
    objective: string;
    scope: string[];
    inclusions: {
      create: string;
      read: string;
      update: string;
      delete: string;
      boundary: string;
      concurrency: string;
    };
    environments: { name: string; url: string }[];
    strategy: string[];
    deliverables: string[];
    risks: { risk: string; mitigation: string }[];
  };
}
