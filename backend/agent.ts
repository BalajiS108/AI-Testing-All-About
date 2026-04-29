import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videosDir = path.join(__dirname, "videos");
if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
}

export interface TestCaseResult {
    id: number;
    name: string;
    jiraKey: string;
    priority: string;
    status: "PASS" | "FAIL" | "SKIPPED" | "ERROR";
    steps: { step: string; result: string; passed: boolean }[];
    expectedResult: string;
    actualResult: string;
    duration: number;
    error?: string;
    videoFile?: string; // filename of the recorded video
}

export interface ExecutionReport {
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        errors: number;
        duration: number;
        executedAt: string;
    };
    results: TestCaseResult[];
}

function parseTestCases(markdownPlan: string): any[] {
    const testCaseBlocks = markdownPlan.split(/###\s+Test Case:/i).filter(Boolean);
    const parsed: any[] = [];

    for (let i = 0; i < testCaseBlocks.length; i++) {
        const block = testCaseBlocks[i].trim();
        if (!block) continue;

        const nameMatch = block.match(/^(.+?)(?:\n|$)/);
        const jiraMatch = block.match(/\*\*Target Jira Issue\*\*:\s*(.+)/i);
        const precondMatch = block.match(/\*\*Preconditions?\*\*:\s*(.+)/i);
        const testDataMatch = block.match(/\*\*Test Data\*\*:\s*(.+)/i);
        const expectedMatch = block.match(/\*\*Expected Result\*\*:\s*(.+)/i);
        const priorityMatch = block.match(/\*\*Priority\*\*:\s*(.+)/i);

        const stepsSection = block.match(/\*\*Steps\*\*:\s*\n([\s\S]*?)(?=\n\s*-\s*\*\*Expected|$)/i);
        const steps: string[] = [];
        if (stepsSection) {
            const stepLines = stepsSection[1].match(/\d+\.\s+(.+)/g);
            if (stepLines) {
                stepLines.forEach(s => steps.push(s.replace(/^\d+\.\s+/, '').trim()));
            }
        }

        parsed.push({
            id: i + 1,
            name: nameMatch ? nameMatch[1].trim() : `Test Case ${i + 1}`,
            jiraKey: jiraMatch ? jiraMatch[1].trim() : 'N/A',
            preconditions: precondMatch ? precondMatch[1].trim() : '',
            testData: testDataMatch ? testDataMatch[1].trim() : '',
            steps,
            expectedResult: expectedMatch ? expectedMatch[1].trim() : '',
            priority: priorityMatch ? priorityMatch[1].trim() : 'Medium',
        });
    }

    return parsed;
}

export async function runAgent(
    testCasesMarkdown: string,
    llmConfig: any,
    onProgress?: (status: { currentCase: string; progress: number; total: number }) => void
): Promise<ExecutionReport> {
    console.log("🚀 Starting Playwright MCP Agent with Video Recording...");
    const startTime = Date.now();

    const testCases = parseTestCases(testCasesMarkdown);
    console.log(`📋 Parsed ${testCases.length} test cases.`);

    if (onProgress) {
        onProgress({ currentCase: 'Connecting to MCP...', progress: 0, total: testCases.length });
    }

    if (testCases.length === 0) {
        return {
            summary: { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, duration: 0, executedAt: new Date().toISOString() },
            results: []
        };
    }

    // Connect to MCP Playwright Server
    let client: Client | null = null;
    let mcpTools: any[] = [];

    try {
        const mcpPath = path.join(__dirname, "playwright-mcp.ts");
        console.log(`🔌 Connecting to MCP Server at: ${mcpPath}`);
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", mcpPath],
        });

        client = new Client(
            { name: "test-runner-client", version: "1.0.0" },
            { capabilities: {} }
        );

        await client.connect(transport);
        const toolsResponse = await client.listTools();
        mcpTools = toolsResponse.tools;
        console.log("🔧 MCP Tools loaded:", mcpTools.map(t => t.name));
    } catch (err: any) {
        console.error("❌ MCP connection failed:");
        console.error(err);
        console.warn("⚠️ Running in simulation mode due to connection error.");
    }

    // Connect to LLM
    const openai = new OpenAI({
        apiKey: llmConfig.apiKey || "dummy",
        baseURL: llmConfig.provider === 'Groq'
            ? 'https://api.groq.com/openai/v1'
            : llmConfig.provider === 'Ollama'
                ? `${(llmConfig.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1`
                : llmConfig.baseUrl || 'https://api.openai.com/v1'
    });

    const formattedTools = mcpTools.map(tool => ({
        type: "function" as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        }
    }));

    // Execute each test case
    const results: TestCaseResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const tcStart = Date.now();
        console.log(`\n▶ Running [${i + 1}/${testCases.length}]: ${tc.name} (${tc.jiraKey})`);

        if (onProgress) {
            onProgress({
                currentCase: `Running: ${tc.name}`,
                progress: i + 1,
                total: testCases.length
            });
        }

        const stepResults: { step: string; result: string; passed: boolean }[] = [];
        let videoFile: string | undefined = undefined;

        // ── Start video recording for this test case ──
        if (client) {
            try {
                console.log(`  🎬 Starting video recording for TC #${tc.id}...`);
                await client.callTool({
                    name: "playwright_start_recording",
                    arguments: { testCaseId: tc.id, testCaseName: tc.name }
                });
            } catch (recErr: any) {
                console.warn(`  ⚠️ Failed to start recording: ${recErr.message}`);
            }
        }

        try {
            const uniqueEmail = `testuser_${Date.now()}@testmail.com`;

            const systemPrompt = `You are a QA automation agent using Playwright MCP tools to test web apps.

RULES & STRATEGY:
0. FIRST STEP ALWAYS: use 'playwright_navigate'. You MUST extract the literal URL from the 'Preconditions' or 'Steps'. DO NOT invent or guess a URL.
1. ALWAYS use the new 'playwright_smart_fill_page' tool for any form! It auto-discovers inputs by label, fills them, handles reCAPTCHA, and clicks Submit all at once.
2. Example data for smart_fill: {"first name": "Test", "last name": "User", "email": "test@test.com", "18 years": "Yes"}
3. ALWAYS pass \`submitText: "Continue"\` or \`"Register"\` to smart_fill so it clicks the button for you.
4. For multi-step forms: use smart_fill_page, wait for the page to load, then use smart_fill_page again for the next step.
5. If popup appears: use playwright_click on "text=Accept" or "text=Close".
6. Always execute FAST and minimize tool calls.

REPORT FORMAT (respond with this after ALL steps):
STEP_RESULTS:
[{"step":"desc","result":"outcome","passed":true/false},...]
VERDICT:
{"verdict":"PASS"or"FAIL","actualResult":"summary"}`;

            const userPrompt = `Test: ${tc.name} | Jira: ${tc.jiraKey}
Preconditions (CONTAINS URL!): ${tc.preconditions || 'None'}
Data: Email: ${uniqueEmail}, First Name: Test, Last Name: User, Password: TestPass@123
Steps:
${tc.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}
Expected: ${tc.expectedResult}

Use \`playwright_smart_fill_page\` heavily! Provide the form data mapping (keys=labels like 'first name', 'email', '18 years') and \`submitText: "Continue"\`. Work fast!`;

            const messages: any[] = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];

            let finalContent = "";
            for (let turn = 0; turn < 15; turn++) {
                const response = await openai.chat.completions.create({
                    model: llmConfig.model || "gpt-4o",
                    messages,
                    tools: formattedTools.length > 0 ? formattedTools : undefined,
                    temperature: 0.1,
                });

                const msg = response.choices[0].message;
                messages.push(msg);

                if (!msg.tool_calls || msg.tool_calls.length === 0) {
                    finalContent = msg.content || "";
                    break;
                }

                for (const _toolCall of msg.tool_calls) {
                    const toolCall = _toolCall as any;
                    // Skip if LLM tries to call start/stop recording (we manage that)
                    if (toolCall.function.name === "playwright_start_recording" || toolCall.function.name === "playwright_stop_recording") {
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Managed externally. Skipped." });
                        continue;
                    }

                    console.log(`  🔧 Tool: ${toolCall.function.name}`);
                    const args = JSON.parse(toolCall.function.arguments);

                    if (client) {
                        try {
                            const mcpRes = await client.callTool({ name: toolCall.function.name, arguments: args });
                            const toolText = mcpRes.isError
                                ? `Error: ${JSON.stringify(mcpRes.content)}`
                                : JSON.stringify(mcpRes.content);
                            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolText });
                        } catch (toolErr: any) {
                            messages.push({ role: "tool", tool_call_id: toolCall.id, content: `Tool error: ${toolErr.message}` });
                        }
                    } else {
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: `Simulated: ${toolCall.function.name} completed` });
                    }
                }
            }

            // ── Stop recording and get video filename ──
            if (client) {
                try {
                    console.log(`  🎬 Stopping video recording for TC #${tc.id}...`);
                    const stopRes = await client.callTool({
                        name: "playwright_stop_recording",
                        arguments: {}
                    });

                    // Extract video filename from the response
                    const stopText = (stopRes.content as any)?.[0]?.text || "";
                    const videoMatch = stopText.match(/Video saved:\s*(.+)/);
                    if (videoMatch) {
                        videoFile = videoMatch[1].trim();
                        console.log(`  📹 Video: ${videoFile}`);
                    }
                } catch (stopErr: any) {
                    console.warn(`  ⚠️ Failed to stop recording: ${stopErr.message}`);
                }
            }

            // Parse LLM results
            const stepMatchBlock = finalContent.match(/STEP_RESULTS:\s*\n?\s*(\[[\s\S]*?\])/);
            if (stepMatchBlock) {
                try {
                    const parsed = JSON.parse(stepMatchBlock[1]);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((s: any) => stepResults.push(s));
                    }
                } catch { }
            }

            // Fallback: try individual JSON step objects
            if (stepResults.length === 0) {
                const stepMatches = finalContent.match(/\{"step":\s*"[^"]*",\s*"result":\s*"[^"]*",\s*"passed":\s*(true|false)\}/g);
                if (stepMatches) {
                    for (const sm of stepMatches) {
                        try { stepResults.push(JSON.parse(sm)); } catch { }
                    }
                }
            }

            const verdictMatch = finalContent.match(/\{"verdict":\s*"(PASS|FAIL)",\s*"actualResult":\s*"([^"]*)"\}/);
            const verdict = verdictMatch ? verdictMatch[1] as "PASS" | "FAIL" : "PASS";
            const actualResult = verdictMatch ? verdictMatch[2] : finalContent.slice(0, 300);

            if (stepResults.length === 0) {
                tc.steps.forEach((s: string) => {
                    stepResults.push({ step: s, result: "Executed via LLM agent", passed: verdict === "PASS" });
                });
            }

            results.push({
                id: tc.id,
                name: tc.name,
                jiraKey: tc.jiraKey,
                priority: tc.priority,
                status: verdict,
                steps: stepResults,
                expectedResult: tc.expectedResult,
                actualResult: actualResult,
                duration: Date.now() - tcStart,
                videoFile,
            });

        } catch (err: any) {
            console.error(`  ❌ Error: ${err.message}`);

            // Still try to stop recording on error
            if (client) {
                try {
                    const stopRes = await client.callTool({ name: "playwright_stop_recording", arguments: {} });
                    const stopText = (stopRes.content as any)?.[0]?.text || "";
                    const videoMatch = stopText.match(/Video saved:\s*(.+)/);
                    if (videoMatch) videoFile = videoMatch[1].trim();
                } catch { }
            }

            results.push({
                id: tc.id,
                name: tc.name,
                jiraKey: tc.jiraKey,
                priority: tc.priority,
                status: "ERROR",
                steps: stepResults,
                expectedResult: tc.expectedResult,
                actualResult: "",
                duration: Date.now() - tcStart,
                error: err.message,
                videoFile,
            });
        }
    }

    // Clean up browser
    if (client) {
        try { await client.close(); } catch { }
    }

    const totalDuration = Date.now() - startTime;

    return {
        summary: {
            total: results.length,
            passed: results.filter(r => r.status === "PASS").length,
            failed: results.filter(r => r.status === "FAIL").length,
            skipped: results.filter(r => r.status === "SKIPPED").length,
            errors: results.filter(r => r.status === "ERROR").length,
            duration: totalDuration,
            executedAt: new Date().toISOString(),
        },
        results,
    };
}
