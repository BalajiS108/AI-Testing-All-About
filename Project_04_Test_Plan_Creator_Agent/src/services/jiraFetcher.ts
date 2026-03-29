import axios from 'axios';
import { Connection, JiraIssue } from '../types';

export const fetchJiraIssues = async (connection: Connection, projectKey: string, sprintVersion?: string): Promise<JiraIssue[]> => {
  const { url, email, apiToken } = connection;
  
  // Clean URL: Remove query parameters/trailing slashes
  const baseUrl = url.split('?')[0].replace(/\/$/, '');
  
  // Choose proxied endpoint if matching
  const isProxied = baseUrl.includes('balajiswt.atlassian.net');
  const endpointArr = isProxied ? ['/rest/api/3/search/jql', '/rest/api/3/search'] : [`${baseUrl}/rest/api/3/search/jql`, `${baseUrl}/rest/api/3/search`];
  
  // Build JQL
  // Check if they are providing an issue key (e.g., KAN-4) rather than a project key (e.g., KAN)
  const isIssueKey = /-[0-9]+/.test(projectKey);
  let jql = '';
  
  if (isIssueKey) {
    // Handle single issue or comma-separated list of issues (e.g., KAN-4, KAN-5)
    const issues = projectKey.split(',').map(s => s.trim()).join('","');
    jql = `issue IN ("${issues}")`;
  } else {
    // It's a project key
    jql = `project = "${projectKey}"`;
    if (sprintVersion) {
      jql += ` AND (fixVersion = "${sprintVersion}" OR sprint = "${sprintVersion}")`;
    }
    jql += ` AND issuetype IN (Story, Bug, Task)`;
  }
  
  const auth = btoa(`${email}:${apiToken}`);
  
  // Try newer endpoint first, fallback if needed
  for (const urlEndpoint of endpointArr) {
    try {
      const response = await axios.get(urlEndpoint, {
        params: {
          jql,
          maxResults: 50,
          fields: 'summary,description,status'
        },
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      return response.data.issues.map((issue: any) => ({
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        description: typeof issue.fields.description === 'string' ? issue.fields.description : JSON.stringify(issue.fields.description) || '',
        status: issue.fields.status.name
      }));
    } catch (error: any) {
      if (urlEndpoint === endpointArr[endpointArr.length - 1]) {
        throw new Error(error.response?.data?.errorMessages?.[0] || error.message);
      }
      // Continue to next endpoint if this one fails
    }
  }
  return [];
};
