import axios from 'axios';

export interface JiraConfig {
  url: string;
  email: string;
  apiToken: string;
}

export const verifyJiraConnection = async (config: JiraConfig) => {
  const { url, email, apiToken } = config;
  
  // Clean URL: Remove query parameters and trailing slashes
  const baseUrl = url.split('?')[0].replace(/\/$/, '');
  
  // If it's the proxied Atlassian domain, use relative path to avoid CORS
  const isProxied = baseUrl.includes('balajiswt.atlassian.net');
  const endpoint = isProxied 
    ? '/rest/api/3/myself' 
    : `${baseUrl}/rest/api/3/myself`;
  
  // Basic Auth in browser/node environment
  const auth = btoa(`${email}:${apiToken}`);
  
  try {
    const response = await axios.get(endpoint, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });
    return { status: 'success', data: response.data };
  } catch (error: any) {
    return { 
      status: 'error', 
      message: error.response?.data?.errorMessages?.[0] || error.message 
    };
  }
};
