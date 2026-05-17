import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { runAgent, ExecutionReport } from './agent.js';
import { runAgentWithCodeGeneration } from './run-agent-codegen.js';
import { generateExcelReport, generateHtmlReport } from './report.js';
import {
    dispatchNotification,
    loadNotificationConfig,
    saveNotificationConfig,
    NotificationConfig,
    NotificationEvent,
} from './notifications.js';
import { saveRun, listRuns, getRun, deleteRun, computeStats } from './history.js';
import { runVisualAudit, runA11yAudit, BASELINE_DIR, DIFF_DIR } from './qualityAudit.js';
import { runApiTest, runTestSuite, parseOpenApiSpec, ApiTest } from './apiTesting.js';
import { listSuites, getSuite, saveSuite, deleteSuite, ApiSuite } from './apiSuites.js';
import {
    isAuthEnabled, authMiddleware, requireAdmin,
    authenticateUser, registerUser, signToken, listUsers, hasAnyUser,
} from './auth.js';
import {
    loadConfig as loadCicdConfig,
    saveConfig as saveCicdConfig,
    testConnection as testCicdConnection,
    listRecentRuns as listCicdRuns,
    triggerWorkflow as triggerCicdWorkflow,
    listWorkflows as listCicdWorkflows,
    getWorkflow as getCicdWorkflow,
    CICDConfig,
} from './cicd.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility to strip ANSI escape codes for cleaner UI display
const stripAnsi = (str: string) => {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-z]/g, '');
};

const reportsDir = path.join(__dirname, 'reports');
const videosDir = path.join(__dirname, 'videos');
// tests/generated lives at the project root (one level up from backend/)
const projectRoot = path.resolve(__dirname, '..');
const testsGeneratedDir = path.join(projectRoot, 'tests', 'generated');

if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });
if (!fs.existsSync(testsGeneratedDir)) fs.mkdirSync(testsGeneratedDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logger middleware
app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Auth gate — opt-in via AUTH_ENABLED env var. When off, this is a no-op.
app.use(authMiddleware);

// Serve generated reports for download
app.use('/reports', express.static(reportsDir));

// Serve recorded test execution videos
app.use('/videos', express.static(videosDir));

const htmlReportsDir = path.join(projectRoot, 'html-reports');
if (!fs.existsSync(htmlReportsDir)) fs.mkdirSync(htmlReportsDir, { recursive: true });
app.use('/html-reports', express.static(htmlReportsDir));

// Visual-regression baseline + diff PNGs are served so the frontend can show
// them inline in the audit panel.
app.use('/audit-images/baselines', express.static(BASELINE_DIR));
app.use('/audit-images/diffs', express.static(DIFF_DIR));

// Progress Tracking
interface ExecutionStatus {
    isRunning: boolean;
    currentCase: string;
    progress: number;
    total: number;
    action: string;
    currentCaseId?: string;
    currentCaseName?: string;
}
let executionStatus: ExecutionStatus = {
    isRunning: false,
    currentCase: '',
    progress: 0,
    total: 0,
    action: ''
};

let stopRequested = false;
// Stores results of completed test cases so /api/partial-results can serve them on Stop
let partialResults: any[] = [];
let partialSummaryStart = 0;

// Track active Playwright child process for script-mode stop
let activePlaywrightProcess: import('child_process').ChildProcess | null = null;

export const isStopRequested = () => stopRequested;

export const resetStopFlag = () => {
    stopRequested = false;
};

export const updateExecutionStatus = (status: any) => {
    executionStatus = { ...executionStatus, ...status };
};

export const addPartialResult = (result: any) => {
    partialResults.push(result);
};

app.post('/api/stop', (req, res) => {
    stopRequested = true;
    executionStatus.isRunning = false;

    // Kill active Playwright child process if running (script-mode stop)
    if (activePlaywrightProcess && !activePlaywrightProcess.killed) {
        console.log('🛑 Killing active Playwright child process...');
        try {
            // On Windows, use taskkill to ensure the entire process tree is killed
            if (process.platform === 'win32') {
                const { execSync } = require('child_process');
                execSync(`taskkill /pid ${activePlaywrightProcess.pid} /T /F`, { stdio: 'ignore' });
            } else {
                activePlaywrightProcess.kill('SIGTERM');
            }
        } catch (e) {
            console.warn('⚠️ Failed to kill child process:', e);
        }
        activePlaywrightProcess = null;
    }

    res.json({ success: true, message: 'Execution stopped successfully.' });
});

app.get('/api/partial-results', async (_req, res) => {
    if (partialResults.length === 0) {
        return res.json({ hasResults: false, results: [], summary: null });
    }
    const passed = partialResults.filter((r: any) => r.status === 'PASS').length;
    const failed = partialResults.filter((r: any) => r.status === 'FAIL').length;
    const errors = partialResults.filter((r: any) => r.status === 'ERROR').length;
    const skippedInResults = partialResults.filter((r: any) => r.status === 'SKIPPED').length;
    const totalDuration = partialResults.reduce((sum: number, r: any) => sum + (r.duration || 0), 0);

    // Total = max(planned tests, what we actually have). The agent now pushes
    // SKIPPED placeholder rows for un-run tests on stop, so partialResults.length
    // usually already matches the plan size — but we keep the max() guard in case
    // executionStatus.total drifts.
    const total = Math.max(executionStatus.total || 0, partialResults.length);
    // Real SKIPPED rows + any planned tests still missing from results.
    const skipped = skippedInResults + Math.max(0, total - partialResults.length);

    const report: ExecutionReport = {
        summary: {
            total,
            passed,
            failed,
            skipped,
            errors,
            duration: totalDuration,
            executedAt: new Date().toISOString()
        },
        results: partialResults
    };

    try {
        const reportPath = await generateExcelReport(report);
        const htmlReportPath = await generateHtmlReport(report);
        const reportFilename = path.basename(reportPath);
        const htmlReportFilename = path.basename(htmlReportPath);

        res.json({
            hasResults: true,
            results: partialResults,
            summary: report.summary,
            reportDownloadUrl: `/reports/${reportFilename}`,
            htmlReportUrl: `/reports/${htmlReportFilename}`
        });
    } catch (e: any) {
        console.error("Error generating partial reports", e);
        res.json({
            hasResults: true,
            results: partialResults,
            summary: report.summary
        });
    }
});

app.post('/api/execute', async (req, res) => {
    try {
        const { testCases, llmConfig, autoHeal } = req.body;

        if (!testCases || !llmConfig) {
            return res.status(400).json({ success: false, error: 'Missing testCases or llmConfig in request body.' });
        }

        console.log('\n========================================');
        console.log('🧪 Test Execution Request Received');
        console.log(`🧬 Auto-Heal: ${autoHeal ? 'ENABLED' : 'DISABLED'}`);
        console.log('========================================');

        executionStatus = {
            isRunning: true,
            currentCase: 'Initializing...',
            currentCaseId: '',
            currentCaseName: 'Initializing...',
            progress: 0,
            total: testCases.length,
            action: 'Connecting to MCP...'
        };
        stopRequested = false;
        partialResults = []; // Reset for new run

        // Run the LLM agent with Playwright MCP
        const report: ExecutionReport = await runAgent(testCases, llmConfig, updateExecutionStatus, { autoHeal: !!autoHeal });

        // Generate reports
        const reportPath = await generateExcelReport(report);
        const htmlReportPath = await generateHtmlReport(report);
        const reportFilename = path.basename(reportPath);
        const htmlReportFilename = path.basename(htmlReportPath);

        executionStatus.isRunning = false;
        stopRequested = false;
        res.json({
            success: true,
            report,
            reportDownloadUrl: `/reports/${reportFilename}`,
            htmlReportUrl: `/reports/${htmlReportFilename}`,
            message: `Execution complete. ${report.summary.passed}/${report.summary.total} passed.`
        });

        // Fire notifications after responding — never let a slow webhook delay the UI
        const host = req.headers.host || `localhost:${process.env.PORT || 3001}`;
        const protocol = req.protocol;
        notifyExecutionCompleted(report, {
            mode: 'AI Agent',
            reportUrl: `${protocol}://${host}/reports/${htmlReportFilename}`,
        });

        // Persist this run for the history dashboard
        try {
            saveRun(report, { mode: 'AI Agent', productName: req.body?.productName });
        } catch (e: any) {
            console.warn('Could not persist run history:', e.message);
        }
    } catch (error: any) {
        console.error('❌ Execution error:', error.message);
        executionStatus.isRunning = false;
        res.status(500).json({ success: false, error: error.message });
    } finally {
        stopRequested = false;
        executionStatus.isRunning = false;
    }
});

// Execute test using Code Generation approach
app.post('/api/execute-codegen', async (req, res) => {
    if (executionStatus.isRunning) {
        return res.status(400).json({ success: false, error: 'Execution already in progress' });
    }

    const { testCases, llmConfig } = req.body;

    if (!testCases || !llmConfig) {
        return res.status(400).json({ success: false, error: 'Missing testCases or llmConfig in request body.' });
    }

    executionStatus.isRunning = true;
    executionStatus.currentCase = 'Starting code generation...';
    executionStatus.progress = 0;
    executionStatus.total = 0;

    try {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║  🚀 CODE GEN EXECUTION STARTED         ║');
        console.log('╚════════════════════════════════════════╝');
        console.log('📝 Test Cases Type:', typeof testCases);
        console.log('📝 Test Cases Length:', testCases?.length);
        console.log('📝 First 1000 chars:', testCases?.slice(0, 1000));
        console.log('📝 LLM Config:', JSON.stringify(llmConfig, null, 2));

        // Use code generation approach
        let codeGenReport;
        try {
            codeGenReport = await runAgentWithCodeGeneration(
                testCases,
                llmConfig,
                (status: any) => {
                    executionStatus.currentCase = status.log || 'Processing...';
                    executionStatus.progress = status.progress || 0;
                    executionStatus.total = status.total || 1;
                    console.log(`📊 Progress: ${executionStatus.currentCase}`);
                }
            );
        } catch (codeGenError: any) {
            console.error('❌ Error in runAgentWithCodeGeneration:', codeGenError.message);
            console.error('Stack:', codeGenError.stack);
            throw codeGenError;
        }

        console.log('✅ Code generation completed');
        console.log('📊 codeGenReport keys:', Object.keys(codeGenReport));
        console.log('📊 codeGenReport.results:', codeGenReport?.results);

        if (!codeGenReport || !codeGenReport.results) {
            throw new Error(`Invalid code generation report: ${JSON.stringify(codeGenReport)}`);
        }

        // Convert code generation report to ExecutionReport format
        const report: ExecutionReport = {
            summary: {
                total: codeGenReport.summary.total,
                passed: codeGenReport.summary.passed,
                failed: codeGenReport.summary.failed,
                skipped: 0,
                errors: codeGenReport.summary.errors,
                duration: codeGenReport.summary.duration,
                executedAt: new Date().toISOString()
            },
            results: (codeGenReport.results || []).map((result: any, index: number) => ({
                id: index + 1,
                name: result.testName || `Test ${index + 1}`,
                jiraKey: 'CODEGEN',
                priority: 'MEDIUM',
                status: result.status,
                steps: [{ 
                    step: 'Generated Playwright code executed', 
                    result: result.actualResult, 
                    passed: result.status === 'PASS' 
                }],
                expectedResult: 'Test should execute successfully',
                actualResult: result.actualResult,
                duration: result.duration || 0,
                error: result.error
            }))
        };

        const reportPath = await generateExcelReport(report);
        const reportFilename = path.basename(reportPath);

        executionStatus.isRunning = false;
        res.json({
            success: true,
            report,
            reportDownloadUrl: `/reports/${reportFilename}`,
            message: `Code generation execution complete. ${report.summary.passed}/${report.summary.total} passed.`
        });

        // Fire notifications after responding
        notifyExecutionCompleted(report, { mode: 'Playwright Script' });

        // Persist this run for the history dashboard
        try {
            saveRun(report, { mode: 'Playwright Script', productName: req.body?.productName });
        } catch (e: any) {
            console.warn('Could not persist run history:', e.message);
        }
    } catch (error: any) {
        console.error('❌ Code generation execution error:', error.message);
        console.error('📋 Full error:', error);
        console.error('🔍 Stack trace:', error.stack);
        executionStatus.isRunning = false;
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate Playwright test scripts from test plan
app.post('/api/generate-scripts', async (req, res) => {
    try {
        const { testCases, llmConfig, productName } = req.body;
        if (!testCases || !llmConfig) {
            return res.status(400).json({ success: false, error: 'Missing testCases or llmConfig' });
        }

        const OpenAI = (await import('openai')).default;
        const getBaseURL = (config: any): string => {
            switch (config.provider) {
                case 'Groq': return 'https://api.groq.com/openai/v1';
                case 'Ollama': return `${(config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1`;
                case 'Gemini': return 'https://generativelanguage.googleapis.com/v1beta/openai/';
                default: return 'https://api.openai.com/v1';
            }
        };
        const openai = new OpenAI({ apiKey: llmConfig.apiKey || 'dummy', baseURL: getBaseURL(llmConfig) });

        const prompt = `You are a senior QA automation engineer. Convert the following test plan into complete, runnable Playwright TypeScript test scripts.

Test Plan:
${testCases}

Requirements:
- Use Playwright's test framework with \`import { test, expect } from '@playwright/test';\`
- Each test case in the plan should become a separate \`test()\` block inside a \`test.describe()\` suite
- Use data-driven approach where test data is stored in variables at the top of each test
- Selector Strategy: MANDATORY: Use stable IDs. For SauceDemo, buttons follow the pattern '#add-to-cart-sauce-labs-bolt-t-shirt' (all lowercase, hyphens instead of spaces). 
- Test Naming: Do NOT include 'TC-N' inside the test description string (e.g. use test('Login success', ...) NOT test('TC-1 Login success', ...)) as the UI adds the prefix automatically.
- For products: Convert product names to lowercase and replace spaces with hyphens to match SauceDemo's ID pattern (e.g. "Sauce Labs Backpack" -> "#add-to-cart-sauce-labs-backpack").
- Include proper assertions using expect()
- Use page.goto(), page.fill(), page.click(), page.waitForSelector() as appropriate
- Add page.screenshot({ path: 'screenshots/<test-name>.png' }) at the end of each test for evidence
- Include beforeEach hook for common login if tests share the same auth flow
- Add test.setTimeout(60000) for each test
- Output ONLY the TypeScript code, no markdown fences, no explanation`;

        const response = await openai.chat.completions.create({
            model: llmConfig.model || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
        });

        let scriptContent = response.choices[0]?.message?.content || '';
        
        // --- Aggressive Sanitization ---
        // 1. If code fences exist, extract ONLY the content inside them
        const fenceMatch = scriptContent.match(/```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n```/i);
        if (fenceMatch && fenceMatch[1]) {
            scriptContent = fenceMatch[1];
        } else {
            // 2. If no fences, find the first 'import' and strip everything before it
            const importIndex = scriptContent.indexOf('import ');
            if (importIndex !== -1) {
                scriptContent = scriptContent.substring(importIndex);
            }
            // 3. Remove any trailing backticks or markdown markers that might be left
            scriptContent = scriptContent.replace(/```/g, '');
        }
        
        scriptContent = scriptContent.trim();
        // -------------------------------

        // Sanitize product name for folder/file usage
        const safeName = (productName || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const timeStr = new Date().toTimeString().slice(0, 5).replace(':', ''); // HHMM

        // Create product-specific sub-folder
        const productDir = path.join(testsGeneratedDir, safeName);
        if (!fs.existsSync(productDir)) fs.mkdirSync(productDir, { recursive: true });

        const filename = `${safeName}_${dateStr}_${timeStr}.spec.ts`;
        const fullScriptPath = path.join(productDir, filename);
        const relativeScriptPath = path.relative(projectRoot, fullScriptPath).replace(/\\/g, '/');

        fs.writeFileSync(fullScriptPath, scriptContent, 'utf8');
        console.log(`✅ Test script saved: ${fullScriptPath}`);

        // Also keep the download copy in reports for backward compat
        const reportFilename = `test_scripts_${Date.now()}.spec.ts`;
        const reportScriptPath = path.join(reportsDir, reportFilename);
        fs.writeFileSync(reportScriptPath, scriptContent, 'utf8');

        res.json({
            success: true,
            scriptUrl: `/reports/${reportFilename}`,
            filePath: relativeScriptPath,
            fullPath: fullScriptPath,
            content: scriptContent
        });
    } catch (error: any) {
        console.error('Script generation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all generated scripts (browsable from UI)
app.get('/api/list-scripts', (_req, res) => {
    try {
        const scripts: { name: string; path: string; relativePath: string; size: number; created: string }[] = [];
        if (!fs.existsSync(testsGeneratedDir)) return res.json({ scripts: [] });

        const products = fs.readdirSync(testsGeneratedDir);
        for (const product of products) {
            const productPath = path.join(testsGeneratedDir, product);
            if (!fs.statSync(productPath).isDirectory()) continue;
            const files = fs.readdirSync(productPath).filter(f => f.endsWith('.spec.ts'));
            for (const file of files) {
                const filePath = path.join(productPath, file);
                const stat = fs.statSync(filePath);
                scripts.push({
                    name: file,
                    path: filePath,
                    relativePath: path.relative(projectRoot, filePath).replace(/\\/g, '/'),
                    size: stat.size,
                    created: stat.birthtime.toISOString(),
                });
            }
        }
        // Most recent first
        scripts.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        res.json({ scripts });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run a generated script using Playwright CLI
app.post('/api/run-playwright', async (req, res) => {
    try {
        const { scriptPath } = req.body;
        if (!scriptPath) return res.status(400).json({ success: false, error: 'Missing scriptPath' });

        // Security: ensure path is inside tests/generated
        const resolvedPath = path.resolve(scriptPath);
        if (!resolvedPath.startsWith(testsGeneratedDir)) {
            return res.status(403).json({ success: false, error: 'Access denied: path outside tests/generated' });
        }
        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ success: false, error: 'Script file not found' });
        }

        const { exec } = await import('child_process');
        
        const { spawn } = await import('child_process');
        
        // Use the local playwright binary in the project root's node_modules
        const playwrightBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
        
        if (!fs.existsSync(playwrightBin)) {
            console.error(`❌ Playwright binary not found at: ${playwrightBin}`);
            return res.status(500).json({ success: false, error: 'Playwright test runner not found.' });
        }

        const relativePath = path.relative(projectRoot, resolvedPath).replace(/\\/g, '/');
        const reportPath = path.join(projectRoot, 'temp-report.json');
        const runId = Date.now();
        const htmlReportRelPath = `html-reports/report_${runId}`;
        const htmlReportAbsPath = path.join(projectRoot, htmlReportRelPath);
        
        // Use 'list', 'json', and 'html' reporters.
        const child = spawn(playwrightBin, ['test', relativePath, '--reporter=list,json,html'], {
            cwd: projectRoot,
            shell: true,
            env: { 
                ...process.env, 
                PLAYWRIGHT_JSON_OUTPUT_NAME: 'temp-report.json',
                PLAYWRIGHT_HTML_REPORT: htmlReportRelPath
            }
        });

        // Track for stop button support
        activePlaywrightProcess = child;
        child.on('close', () => { activePlaywrightProcess = null; });

        let stdout = '';
        let stderr = '';

        child.on('error', (err) => {
            console.error('❌ Failed to start Playwright:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: `Failed to start test runner: ${err.message}` });
            }
        });

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            // Extract test titles from 'list' reporter output: e.g. "  ✓  1 [chromium] › test.spec.ts:14:3 › TC-1..."
            const lines = chunk.split('\n');
            lines.forEach((line: string) => {
                if (line.includes('›')) {
                    const parts = line.split('›');
                    const title = parts[parts.length - 1].trim();
                    // We don't have a direct way to push to frontend here without SSE/WS
                    // But we can log it for now, and in the next step I'll add a 'status' endpoint if needed.
                    console.log(`🧪 Running: ${title}`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (res.headersSent) return;
            
            let reportData: any = null;
            try {
                if (fs.existsSync(reportPath)) {
                    reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                }
            } catch (e) {
                console.error('Failed to parse Playwright JSON report:', e);
            }

            if (reportData) {
                const summary = {
                    total: 0,
                    passed: 0,
                    failed: 0,
                    errors: 0,
                    skipped: 0,
                    duration: reportData.stats.duration,
                    executedAt: new Date().toISOString()
                };

                const allResults: any[] = [];
                
                // Recursive function to find all specs in all suites
                const collectSpecs = (suite: any) => {
                    if (suite.specs) {
                        suite.specs.forEach((spec: any) => {
                            const testCase = spec.tests[0];
                            const result = testCase.results[0];
                            // Normalize to uppercase status codes the frontend expects ('PASS'|'FAIL'|'SKIPPED')
                            const status: 'PASS' | 'FAIL' | 'SKIPPED' =
                                result.status === 'passed' ? 'PASS'
                                : result.status === 'skipped' ? 'SKIPPED'
                                : 'FAIL';

                            if (status === 'PASS') summary.passed++;
                            else if (status === 'SKIPPED') summary.skipped++;
                            else summary.failed++;

                            allResults.push({
                                id: allResults.length + 1,
                                jiraKey: spec.title.match(/TC-\d+/) ? spec.title.match(/TC-\d+/)[0] : 'TS-1',
                                name: spec.title,
                                status,
                                duration: result.duration,
                                steps: result.steps?.map((step: any) => ({
                                    step: step.title,
                                    result: step.error ? stripAnsi(step.error?.message || 'Step failed') : 'OK',
                                    passed: !step.error,
                                    duration: step.duration
                                })) || [],
                                expectedResult: 'Test should execute successfully',
                                error: stripAnsi(result.error?.message || ''),
                                actualResult: stripAnsi(status === 'PASS' ? 'Test passed successfully' : 'Test failed: ' + (result.error?.message || '')),
                                priority: 'High'
                            });
                        });
                    }
                    if (suite.suites) {
                        suite.suites.forEach(collectSpecs);
                    }
                };

                reportData.suites.forEach(collectSpecs);
                summary.total = allResults.length;

                const host = req.headers.host || 'localhost:3001';
                const protocol = req.protocol;
                const baseUrl = `${protocol}://${host}`;

                res.json({
                    success: true,
                    report: {
                        summary,
                        results: allResults,
                        hasResults: true,
                        htmlReportUrl: `${baseUrl}/${htmlReportRelPath}/index.html`
                    }
                });
            } else {
                const output = stdout + stderr;
                res.json({
                    success: code === 0,
                    output,
                    passed: (output.match(/✓/g) || []).length,
                    failed: (output.match(/✘/g) || []).length,
                    exitCode: code
                });
            }

            if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
        });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Health check & Progress Status
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node: process.version
    });
});

// ── Auth endpoints ──────────────────────────────────────────────────────────
// Frontend calls /api/auth/status on boot to decide whether to gate the UI.
app.get('/api/auth/status', (_req, res) => {
    res.json({
        enabled: isAuthEnabled(),
        anyUserExists: hasAnyUser(),
    });
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });
        const user = await authenticateUser(username, password);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const token = signToken({ sub: user.username, role: user.role });
        res.json({ token, user: { username: user.username, role: user.role } });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });
        // First-ever account becomes the admin (matches the carve-out in authMiddleware)
        const effectiveRole = hasAnyUser() ? (role === 'admin' ? 'admin' : 'user') : 'admin';
        // If users already exist, only an admin can mint new ones
        if (hasAnyUser() && isAuthEnabled() && req.auth?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin role required to create users' });
        }
        const user = await registerUser(username, password, effectiveRole);
        res.json({ user: { username: user.username, role: user.role } });
    } catch (e: any) {
        const msg = e.message || 'Failed to create user';
        const code = msg.includes('exists') ? 409 : 400;
        res.status(code).json({ error: msg });
    }
});

app.get('/api/auth/me', (req, res) => {
    if (!isAuthEnabled()) return res.json({ enabled: false });
    if (!req.auth) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ enabled: true, user: req.auth });
});

app.get('/api/auth/users', requireAdmin, (_req, res) => {
    res.json({ users: listUsers() });
});


app.get('/api/execution-status', (_req, res) => {
    res.json(executionStatus);
});

// Jira Proxy to bypass CORS
app.post('/api/jira/search', async (req, res) => {
    try {
        const { connection, projectKey, sprintVersion } = req.body;
        if (!connection || !projectKey) {
            return res.status(400).json({ error: 'Missing connection or projectKey' });
        }

        const { url, email, apiToken } = connection;
        const baseUrl = url.split('?')[0].replace(/\/$/, '');
        const endpointArr = [`${baseUrl}/rest/api/3/search/jql`, `${baseUrl}/rest/api/3/search`];
        
        const isIssueKey = /-[0-9]+/.test(projectKey);
        let jql = '';
        if (isIssueKey) {
            const issues = projectKey.split(',').map((s: string) => s.trim()).join('","');
            jql = `issue IN ("${issues}")`;
        } else {
            jql = `project = "${projectKey}"`;
            if (sprintVersion) {
                jql += ` AND (fixVersion = "${sprintVersion}" OR sprint = "${sprintVersion}")`;
            }
            jql += ` AND issuetype IN (Story, Bug, Task)`;
        }

        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

        let lastError = null;
        for (const urlEndpoint of endpointArr) {
            try {
                const response = await axios.get(urlEndpoint, {
                    params: { jql, maxResults: 50, fields: 'summary,description,status' },
                    headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
                });

                const issues = response.data.issues.map((issue: any) => ({
                    id: issue.id,
                    key: issue.key,
                    summary: issue.fields.summary,
                    description: typeof issue.fields.description === 'string' ? issue.fields.description : JSON.stringify(issue.fields.description) || '',
                    status: issue.fields.status.name
                }));
                return res.json({ issues });
            } catch (error: any) {
                lastError = error;
            }
        }
        
        if (lastError) throw lastError;
        res.json({ issues: [] });
    } catch (error: any) {
        console.error('Jira Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.errorMessages?.[0] || error.message });
    }
});

app.post('/api/jira/verify', async (req, res) => {
    try {
        let { url, email, apiToken } = req.body;
        if (!url || !email || !apiToken) {
            return res.status(400).json({ error: 'Missing connection details (URL, Email, or Token)' });
        }

        // Ensure URL has a protocol
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }

        const baseUrl = url.split('?')[0].replace(/\/$/, '');
        const endpoint = `${baseUrl}/rest/api/3/myself`;
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

        console.log(`🔍 Verifying Jira connection to: ${endpoint}`);

        const response = await axios.get(endpoint, {
            headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
            timeout: 10000 // 10s timeout
        });
        
        console.log(`✅ Jira verified: ${response.data.displayName || response.data.emailAddress}`);
        res.json({ status: 'success', data: response.data });
    } catch (error: any) {
        console.error('❌ Jira Verify Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data));
            const msg = error.response.data?.errorMessages?.[0] || error.response.data?.message || error.message;
            res.status(error.response.status).json({ error: msg });
        } else if (error.request) {
            console.error('   No response received from Jira. This usually means a network/proxy issue or invalid URL.');
            res.status(500).json({ error: 'Network error: Jira instance unreachable. Check your URL and network/proxy settings.' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// ─── Jira Bug Creation Endpoint ───
app.post('/api/jira/create-bug', async (req, res) => {
    try {
        const { connection, projectKey, testCase } = req.body;

        if (!connection || !projectKey || !testCase) {
            return res.status(400).json({ success: false, error: 'Missing connection, projectKey, or testCase' });
        }

        const { url, email, apiToken } = connection;
        const baseUrl = url.split('?')[0].replace(/\/$/, '');
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

        // Build ADF (Atlassian Document Format) description
        const descriptionParts: any[] = [];

        // Header
        descriptionParts.push({
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: '🐛 Auto-Generated Bug Report' }]
        });

        // Test Case Info
        descriptionParts.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Test Case: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: `TC-${testCase.id} ${testCase.name}` }
            ]
        });

        descriptionParts.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Priority: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: testCase.priority || 'Medium' }
            ]
        });

        // Error Details
        if (testCase.error) {
            descriptionParts.push({
                type: 'heading',
                attrs: { level: 4 },
                content: [{ type: 'text', text: '❌ Error Details' }]
            });
            descriptionParts.push({
                type: 'codeBlock',
                attrs: { language: 'text' },
                content: [{ type: 'text', text: testCase.error.substring(0, 2000) }]
            });
        }

        // Expected vs Actual
        descriptionParts.push({
            type: 'heading',
            attrs: { level: 4 },
            content: [{ type: 'text', text: '📋 Expected vs Actual' }]
        });
        descriptionParts.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Expected: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: testCase.expectedResult || 'N/A' }
            ]
        });
        descriptionParts.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Actual: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: testCase.actualResult || 'N/A' }
            ]
        });

        // Steps
        if (testCase.steps && testCase.steps.length > 0) {
            descriptionParts.push({
                type: 'heading',
                attrs: { level: 4 },
                content: [{ type: 'text', text: '🔄 Steps to Reproduce' }]
            });

            const stepItems = testCase.steps.map((step: any) => ({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: `${step.step || step}` },
                        ...(step.passed === false ? [{ type: 'text', text: ' ❌ FAILED', marks: [{ type: 'strong' }] }] : [])
                    ]
                }]
            }));

            descriptionParts.push({
                type: 'orderedList',
                attrs: { order: 1 },
                content: stepItems
            });
        }

        // Environment info
        descriptionParts.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: `\n🤖 Filed by: Intelligent Test Planning Agent | Duration: ${((testCase.duration || 0) / 1000).toFixed(1)}s`, marks: [{ type: 'em' }] }
            ]
        });

        // Map priority to Jira priority names
        const priorityMap: Record<string, string> = {
            'High': 'High',
            'high': 'High',
            'MEDIUM': 'Medium',
            'Medium': 'Medium',
            'medium': 'Medium',
            'Low': 'Low',
            'low': 'Low'
        };

        // Fallback: If projectKey is still missing or looks like an ID, try to extract from testCase.jiraKey
        let finalProjectKey = projectKey;
        
        // Sanitize: If the key contains a dash (like KAN-2), it's likely an issue key, not a project key
        if (finalProjectKey && finalProjectKey.includes('-')) {
            finalProjectKey = finalProjectKey.split('-')[0];
        }

        if ((!finalProjectKey || finalProjectKey === 'undefined' || finalProjectKey === '') && testCase.jiraKey) {
            const match = testCase.jiraKey.match(/^([A-Z0-9]+)-/);
            if (match) finalProjectKey = match[1];
        }

        console.log(`🐛 Attempting to create Jira bug:`);
        console.log(`   Project Key: "${finalProjectKey}"`);
        console.log(`   Test Case: ${testCase.name} (${testCase.jiraKey})`);

        if (!finalProjectKey) {
            throw new Error('Could not determine a valid Jira Project Key. Please ensure issues have keys like PROJ-123.');
        }

        const issuePayload = {
            fields: {
                project: { key: finalProjectKey },
                summary: `[Auto-Bug] ${testCase.name}`,
                description: {
                    type: 'doc',
                    version: 1,
                    content: descriptionParts
                },
                issuetype: { name: 'Bug' },
                priority: { name: priorityMap[testCase.priority] || 'Medium' }
            }
        };

        console.log(`🐛 Creating Jira bug for: ${testCase.name}`);
        console.log(`   Project: ${projectKey}`);

        const response = await axios.post(
            `${baseUrl}/rest/api/3/issue`,
            issuePayload,
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        const issueKey = response.data.key;
        const issueUrl = `${baseUrl}/browse/${issueKey}`;

        console.log(`✅ Bug created: ${issueKey} → ${issueUrl}`);

        res.json({
            success: true,
            issueKey,
            issueUrl,
            message: `Bug ${issueKey} created successfully`
        });
    } catch (error: any) {
        const errorData = error.response?.data;
        console.error('❌ Jira Bug API Error Details:', JSON.stringify(errorData || error.message, null, 2));
        
        let detailedError = 'Failed to create bug';
        if (errorData?.errors) {
            detailedError = Object.entries(errorData.errors)
                .map(([field, msg]) => `${field}: ${msg}`)
                .join(', ');
        } else if (errorData?.errorMessages && errorData.errorMessages.length > 0) {
            detailedError = errorData.errorMessages.join(', ');
        } else {
            detailedError = error.message || 'Unknown error';
        }

        res.status(500).json({ 
            success: false, 
            error: detailedError 
        });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Jira Test Sync — push test cases and sync execution results back to Jira
//
//  Strategy: create each test case as a Jira issue. If a parent issue key
//  is provided (e.g. the user's story "KAN-5"), the issue is a Sub-task
//  linked to that parent; otherwise it's a standalone Task. After execution,
//  results are reflected as comments on those issues + a pass/fail label.
//  We deliberately avoid workflow transitions, which vary per-project.
// ════════════════════════════════════════════════════════════════════════════

// Build the ADF (Atlassian Document Format) description for a test-case issue.
function buildTestCaseDescription(tc: any) {
    const blocks: any[] = [
        {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Test Case' }],
        },
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Priority: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: String(tc.priority || 'Medium') },
            ],
        },
    ];
    if (tc.expectedResult) {
        blocks.push(
            { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Expected Result' }] },
            { type: 'paragraph', content: [{ type: 'text', text: String(tc.expectedResult) }] }
        );
    }
    if (Array.isArray(tc.steps) && tc.steps.length > 0) {
        blocks.push({ type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Steps' }] });
        blocks.push({
            type: 'orderedList',
            attrs: { order: 1 },
            content: tc.steps.map((step: any) => ({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: [{ type: 'text', text: typeof step === 'string' ? step : (step.step || step.name || '') }],
                }],
            })),
        });
    }
    if (tc.testData) {
        blocks.push(
            { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Test Data' }] },
            { type: 'paragraph', content: [{ type: 'text', text: String(tc.testData) }] }
        );
    }
    blocks.push({
        type: 'paragraph',
        content: [{
            type: 'text',
            text: '\nGenerated by Intelligent Test Planning Agent',
            marks: [{ type: 'em' }],
        }],
    });
    return { type: 'doc', version: 1, content: blocks };
}

// ─── Push test cases to Jira ────────────────────────────────────────────────
app.post('/api/jira/push-test-cases', async (req, res) => {
    try {
        const { connection, projectKey, parentIssueKey, testCases, provider } = req.body as {
            connection: { url: string; email: string; apiToken: string };
            projectKey: string;
            parentIssueKey?: string;
            testCases: any[];
            provider?: 'jira-native' | 'xray';
        };

        if (!connection || !projectKey || !Array.isArray(testCases) || testCases.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing connection, projectKey, or testCases' });
        }

        const { url, email, apiToken } = connection;
        const baseUrl = url.split('?')[0].replace(/\/$/, '');
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
        const authHeaders = {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
        const useXray = provider === 'xray';

        // Strip suffix if user accidentally passed an issue key (e.g. "KAN-5") as project key
        let cleanProjectKey = projectKey;
        if (cleanProjectKey.includes('-')) cleanProjectKey = cleanProjectKey.split('-')[0];

        const priorityMap: Record<string, string> = {
            high: 'High', High: 'High', HIGH: 'High',
            medium: 'Medium', Medium: 'Medium', MEDIUM: 'Medium',
            low: 'Low', Low: 'Low', LOW: 'Low',
        };

        // ── Discover available issue types for THIS project ───────────────
        // Different Jira projects expose different issue type names: a
        // company-managed project might have "Sub-task", a team-managed one
        // may only have "Task"/"Story", an Xray install adds "Test", etc.
        // We query createmeta once, pick the best available name, and use it
        // for the whole batch. Falls back to defaults if the call fails.
        let availableTypes: { name: string; subtask: boolean }[] = [];
        try {
            const meta = await axios.get(
                `${baseUrl}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(cleanProjectKey)}&expand=projects.issuetypes`,
                { headers: authHeaders, timeout: 12000 }
            );
            const project = meta.data?.projects?.[0];
            if (project?.issuetypes) {
                availableTypes = project.issuetypes.map((it: any) => ({
                    name: it.name,
                    subtask: !!it.subtask,
                }));
            }
        } catch (e: any) {
            console.warn(`⚠️ createmeta query failed (${e.message}) — using default issue type names`);
        }
        const availableNames = availableTypes.map((t) => t.name);
        const subtaskTypeName = availableTypes.find((t) => t.subtask)?.name; // first available subtask type

        // Pick the first preferred name that the project actually exposes.
        // If we couldn't query the project (permissions), keep the preferred
        // list as-is and let Jira's error bubble back to the user.
        const pickIssueType = (preferred: string[]): string => {
            if (availableNames.length === 0) return preferred[0];
            for (const name of preferred) {
                const found = availableNames.find((n) => n.toLowerCase() === name.toLowerCase());
                if (found) return found;
            }
            // Last resort: any non-subtask, non-epic issue type
            const fallback = availableTypes.find(
                (t) => !t.subtask && !/^epic$/i.test(t.name)
            );
            return fallback?.name || availableNames[0];
        };

        const primaryIssueType = useXray
            ? pickIssueType(['Test', 'Task', 'Story'])
            : parentIssueKey
                ? (subtaskTypeName || pickIssueType(['Sub-task', 'Subtask', 'Task']))
                : pickIssueType(['Task', 'Story', 'Bug']);

        const labelBase = useXray ? ['auto-generated-test', 'xray'] : ['auto-generated-test'];

        // If we successfully queried createmeta and Sub-task isn't actually
        // available, drop the parent link — sticking it on a Task fails.
        const willLinkParent = !!parentIssueKey && !useXray && availableTypes.some((t) => t.subtask && t.name === primaryIssueType);

        const mapping: Record<string, string> = {};
        const errors: { tcId: string; error: string }[] = [];
        console.log(`📋 Issue type chosen for ${cleanProjectKey}: "${primaryIssueType}" (available: ${availableNames.join(', ') || '?'})`);

        // Sequential to keep error attribution clean; parallel would race on rate limits anyway.
        for (const tc of testCases) {
            const tcId = String(tc.tcId || tc.id || `TC-${Object.keys(mapping).length + 1}`);
            try {
                const fields: any = {
                    project: { key: cleanProjectKey },
                    summary: `[Test] ${tc.name || tcId}`.slice(0, 250),
                    description: buildTestCaseDescription(tc),
                    issuetype: { name: primaryIssueType },
                    priority: { name: priorityMap[tc.priority] || 'Medium' },
                    labels: willLinkParent ? labelBase : [...labelBase, ...(parentIssueKey ? [`parent-${parentIssueKey}`] : [])],
                };
                if (willLinkParent) {
                    fields.parent = { key: parentIssueKey };
                }

                const response = await axios.post(
                    `${baseUrl}/rest/api/3/issue`,
                    { fields },
                    { headers: authHeaders, timeout: 15000 }
                );
                const issueKey = response.data.key;
                mapping[tcId] = issueKey;
                console.log(`✅ Pushed ${tcId} → ${issueKey} (${primaryIssueType})`);
            } catch (err: any) {
                const errData = err.response?.data;
                let detail =
                    errData?.errors
                        ? Object.entries(errData.errors).map(([f, m]) => `${f}: ${m}`).join(', ')
                        : errData?.errorMessages?.join(', ') || err.message || 'Unknown error';

                // Fallback A: priority field rejected (some projects disable priority)
                // — retry without it
                if (/priority/i.test(detail)) {
                    try {
                        const retryFields: any = {
                            project: { key: cleanProjectKey },
                            summary: `[Test] ${tc.name || tcId}`.slice(0, 250),
                            description: buildTestCaseDescription(tc),
                            issuetype: { name: primaryIssueType },
                            labels: labelBase,
                        };
                        if (willLinkParent) retryFields.parent = { key: parentIssueKey };
                        const retry = await axios.post(`${baseUrl}/rest/api/3/issue`, { fields: retryFields }, { headers: authHeaders, timeout: 15000 });
                        mapping[tcId] = retry.data.key;
                        console.log(`✅ Pushed ${tcId} → ${retry.data.key} (no priority)`);
                        continue;
                    } catch (retryErr: any) {
                        detail = retryErr.response?.data?.errors
                            ? Object.entries(retryErr.response.data.errors).map(([f, m]) => `${f}: ${m}`).join(', ')
                            : retryErr.response?.data?.errorMessages?.join(', ') || retryErr.message || detail;
                    }
                }

                // Fallback B: issuetype rejected — walk available alternatives.
                // Triggers on "Specify a valid issue type", "Specify an issue type",
                // or any error mentioning issuetype/subtask.
                if (/issuetype|sub-?task|specify (an? )?(valid )?issue type/i.test(detail)) {
                    const tried = new Set<string>([primaryIssueType.toLowerCase()]);
                    const candidates = (availableNames.length > 0
                        ? availableNames
                        : ['Task', 'Story', 'Bug']
                    ).filter((n) => !tried.has(n.toLowerCase()) && !/^epic$/i.test(n));

                    let retriedOk = false;
                    for (const candidate of candidates) {
                        try {
                            const retryFields: any = {
                                project: { key: cleanProjectKey },
                                summary: `[Test] ${tc.name || tcId}`.slice(0, 250),
                                description: buildTestCaseDescription(tc),
                                issuetype: { name: candidate },
                                labels: [...labelBase, ...(parentIssueKey ? [`parent-${parentIssueKey}`] : [])],
                            };
                            // Only re-link a parent if the new candidate is also a sub-task type
                            const isCandidateSubtask = availableTypes.find((t) => t.name === candidate)?.subtask;
                            if (parentIssueKey && !useXray && isCandidateSubtask) {
                                retryFields.parent = { key: parentIssueKey };
                            }
                            const retry = await axios.post(`${baseUrl}/rest/api/3/issue`, { fields: retryFields }, { headers: authHeaders, timeout: 15000 });
                            mapping[tcId] = retry.data.key;
                            console.log(`✅ Pushed ${tcId} → ${retry.data.key} (fallback to "${candidate}")`);
                            retriedOk = true;
                            break;
                        } catch (retryErr: any) {
                            const subDetail = retryErr.response?.data?.errors
                                ? Object.entries(retryErr.response.data.errors).map(([f, m]) => `${f}: ${m}`).join(', ')
                                : retryErr.response?.data?.errorMessages?.join(', ') || retryErr.message;
                            console.log(`   fallback "${candidate}" failed: ${subDetail}`);
                            detail = subDetail || detail;
                        }
                    }
                    if (retriedOk) continue;

                    // Augment the final error so the user sees what we tried.
                    detail = `${detail} | tried: ${[primaryIssueType, ...candidates].join(', ')} | available: ${availableNames.join(', ') || 'unknown'}`;
                }
                console.error(`❌ Failed to push ${tcId}: ${detail}`);
                errors.push({ tcId, error: detail });
            }
        }

        res.json({
            success: errors.length === 0,
            mapping,
            errors,
            baseUrl,
            count: Object.keys(mapping).length,
            total: testCases.length,
        });
    } catch (error: any) {
        console.error('❌ push-test-cases error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Unexpected error' });
    }
});

// ─── Sync execution results to Jira (post comments + labels) ────────────────
app.post('/api/jira/update-execution-status', async (req, res) => {
    try {
        const { connection, results, provider, projectKey } = req.body as {
            connection: { url: string; email: string; apiToken: string };
            results: Array<{
                tcId: string;
                jiraKey: string;
                status: 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR';
                duration?: number;
                actualResult?: string;
                error?: string;
            }>;
            provider?: 'jira-native' | 'xray';
            projectKey?: string;
        };

        if (!connection || !Array.isArray(results) || results.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing connection or results' });
        }
        const useXray = provider === 'xray';

        const { url, email, apiToken } = connection;
        const baseUrl = url.split('?')[0].replace(/\/$/, '');
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
        const headers = {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };

        const updated: { jiraKey: string; status: string }[] = [];
        const errors: { jiraKey: string; error: string }[] = [];

        for (const r of results) {
            if (!r.jiraKey) {
                errors.push({ jiraKey: r.tcId, error: 'No Jira key — push this test case first.' });
                continue;
            }
            try {
                const statusEmoji =
                    r.status === 'PASS' ? '✅'
                    : r.status === 'FAIL' ? '❌'
                    : r.status === 'SKIPPED' ? '⏭'
                    : '⚠️';

                const commentBlocks: any[] = [
                    {
                        type: 'heading',
                        attrs: { level: 3 },
                        content: [{ type: 'text', text: `${statusEmoji} Execution: ${r.status}` }],
                    },
                    {
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Time: ', marks: [{ type: 'strong' }] },
                            { type: 'text', text: new Date().toISOString() },
                            { type: 'text', text: '   ·   Duration: ', marks: [{ type: 'strong' }] },
                            { type: 'text', text: `${((r.duration || 0) / 1000).toFixed(2)}s` },
                        ],
                    },
                ];
                if (r.actualResult) {
                    commentBlocks.push({
                        type: 'paragraph',
                        content: [
                            { type: 'text', text: 'Actual: ', marks: [{ type: 'strong' }] },
                            { type: 'text', text: String(r.actualResult).slice(0, 2000) },
                        ],
                    });
                }
                if (r.error) {
                    commentBlocks.push(
                        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Error' }] },
                        {
                            type: 'codeBlock',
                            attrs: { language: 'text' },
                            content: [{ type: 'text', text: String(r.error).slice(0, 2000) }],
                        }
                    );
                }

                await axios.post(
                    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(r.jiraKey)}/comment`,
                    { body: { type: 'doc', version: 1, content: commentBlocks } },
                    { headers, timeout: 15000 }
                );

                // Best-effort label update so users can filter by execution status in Jira.
                const label =
                    r.status === 'PASS' ? 'test-passed'
                    : r.status === 'FAIL' ? 'test-failed'
                    : r.status === 'SKIPPED' ? 'test-skipped'
                    : 'test-error';

                try {
                    await axios.put(
                        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(r.jiraKey)}`,
                        { update: { labels: [{ add: label }, { remove: 'test-passed' }, { remove: 'test-failed' }, { remove: 'test-skipped' }, { remove: 'test-error' }].filter(op => 'add' in op || op.remove !== label) } },
                        { headers, timeout: 10000 }
                    );
                } catch (labelErr: any) {
                    // Don't fail the whole sync on a label edit error — it's cosmetic
                    console.warn(`⚠️ Could not update labels on ${r.jiraKey}: ${labelErr.message}`);
                }

                updated.push({ jiraKey: r.jiraKey, status: r.status });
                console.log(`✅ Synced ${r.tcId} (${r.jiraKey}) → ${r.status}`);
            } catch (err: any) {
                const detail =
                    err.response?.data?.errorMessages?.join(', ')
                    || err.response?.data?.error
                    || err.message
                    || 'Unknown error';
                console.error(`❌ Sync failed for ${r.jiraKey}: ${detail}`);
                errors.push({ jiraKey: r.jiraKey, error: detail });
            }
        }

        // ── Xray: also create a Test Execution issue summarizing this run ──
        // Xray's full execution-import endpoint differs between Server and Cloud
        // and requires a custom-field mapping that varies per install. To stay
        // universally compatible we create a standard "Test Execution" issue
        // whose description links every tested issue + status. Users on full
        // Xray installs can later move the link references into the proper
        // Tests custom field, or wire the dedicated import endpoint themselves.
        let testExecutionKey: string | undefined;
        let testExecutionUrl: string | undefined;
        if (useXray && projectKey && updated.length > 0) {
            try {
                let cleanProjectKey = projectKey;
                if (cleanProjectKey.includes('-')) cleanProjectKey = cleanProjectKey.split('-')[0];
                const passed = updated.filter((u) => u.status === 'PASS').length;
                const failed = updated.filter((u) => u.status === 'FAIL').length;
                const tested = updated
                    .slice(0, 50)
                    .map((u) => `${u.jiraKey}: ${u.status}`)
                    .join('\n');
                const summary = `Test Execution — ${passed}/${updated.length} passed (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
                const description = {
                    type: 'doc',
                    version: 1,
                    content: [
                        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Execution Summary' }] },
                        {
                            type: 'paragraph',
                            content: [
                                { type: 'text', text: 'Passed: ', marks: [{ type: 'strong' }] },
                                { type: 'text', text: `${passed}   ` },
                                { type: 'text', text: 'Failed: ', marks: [{ type: 'strong' }] },
                                { type: 'text', text: `${failed}` },
                            ],
                        },
                        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Tested issues' }] },
                        { type: 'codeBlock', attrs: { language: 'text' }, content: [{ type: 'text', text: tested }] },
                    ],
                };
                const exec = await axios.post(
                    `${baseUrl}/rest/api/3/issue`,
                    {
                        fields: {
                            project: { key: cleanProjectKey },
                            summary,
                            description,
                            issuetype: { name: 'Test Execution' },
                            labels: ['auto-generated-test-execution', 'xray'],
                        },
                    },
                    { headers, timeout: 15000 }
                );
                testExecutionKey = exec.data.key;
                testExecutionUrl = `${baseUrl}/browse/${testExecutionKey}`;
                console.log(`✅ Xray Test Execution created: ${testExecutionKey}`);
            } catch (err: any) {
                const detail = err.response?.data?.errorMessages?.join(', ') || err.message;
                console.warn(`⚠️ Could not create Xray Test Execution: ${detail}`);
                errors.push({ jiraKey: 'TestExecution', error: detail });
            }
        }

        res.json({
            success: errors.length === 0,
            updated,
            errors,
            testExecutionKey,
            testExecutionUrl,
            baseUrl,
            count: updated.length,
            total: results.length,
        });
    } catch (error: any) {
        console.error('❌ update-execution-status error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Unexpected error' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Input Source Adapters — BRD (PDF/DOCX), HTML, Figma
//  Each endpoint returns a normalized list of items the existing pipeline
//  can consume (shaped like JiraIssue: { id, key, summary, description, status })
// ════════════════════════════════════════════════════════════════════════════

const uploadBrd = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Heuristic: split long requirement text into discrete "items" (Story-like chunks)
// so the LLM downstream sees structured input rather than one giant blob.
function splitIntoRequirementItems(rawText: string, sourceLabel: string): any[] {
    const text = rawText.replace(/\r\n/g, '\n').trim();
    if (!text) return [];

    // Prefer splitting on markdown-style headings, then numbered/bulleted sections,
    // and fall back to paragraph blocks for unstructured documents.
    const headingSplit = text.split(/\n(?=#{1,6}\s|\d+\.\s+[A-Z]|[A-Z][A-Z\s]{4,}\n)/g);
    const chunks = headingSplit.length > 1
        ? headingSplit
        : text.split(/\n{2,}/g);

    return chunks
        .map((c) => c.trim())
        .filter((c) => c.length > 40)
        .slice(0, 50) // cap to keep prompt sizes manageable
        .map((chunk, idx) => {
            // First non-empty line becomes the summary (heading or first sentence).
            const firstLine = chunk.split('\n')[0].replace(/^#+\s*/, '').trim();
            const summary = firstLine.length > 140
                ? firstLine.slice(0, 137) + '...'
                : firstLine;
            return {
                id: `${sourceLabel}-${idx + 1}`,
                key: `REQ-${idx + 1}`,
                summary: summary || `Requirement ${idx + 1}`,
                description: chunk,
                status: 'Requirement',
            };
        });
}

// ── BRD: PDF or DOCX upload → extracted text → requirement items ─────────────
app.post('/api/input/brd', uploadBrd.single('file'), async (req, res) => {
    try {
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) {
            return res.status(400).json({ success: false, error: 'No file uploaded (expected field name "file")' });
        }

        const filename = file.originalname || 'document';
        const ext = path.extname(filename).toLowerCase();

        let extractedText = '';
        if (ext === '.pdf') {
            // pdf-parse v2 uses a class-based API (PDFParse) instead of v1's function call.
            // Dynamically imported so installation differences between versions don't crash boot.
            const pdfMod: any = await import('pdf-parse');
            const PDFParseCls = pdfMod.PDFParse || pdfMod.default?.PDFParse || pdfMod.default;
            if (typeof PDFParseCls !== 'function') {
                throw new Error('pdf-parse: could not resolve PDFParse export');
            }
            const parser = new PDFParseCls({ data: file.buffer });
            const parsed = await parser.getText();
            extractedText = parsed?.text || '';
        } else if (ext === '.docx') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            extractedText = result.value || '';
        } else if (ext === '.txt' || ext === '.md') {
            extractedText = file.buffer.toString('utf8');
        } else {
            return res.status(400).json({
                success: false,
                error: `Unsupported file type "${ext}". Use .pdf, .docx, .txt, or .md`,
            });
        }

        if (!extractedText.trim()) {
            return res.status(422).json({ success: false, error: 'Document parsed but no text was extracted.' });
        }

        const items = splitIntoRequirementItems(extractedText, 'BRD');
        res.json({
            success: true,
            source: 'brd',
            label: filename,
            items,
            rawText: extractedText.slice(0, 50000), // cap echoed text
        });
    } catch (err: any) {
        console.error('BRD parse error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to parse document' });
    }
});

// ── HTML: URL or raw HTML → cleaned text → requirement items ────────────────
app.post('/api/input/html', async (req, res) => {
    try {
        const { url, html } = req.body as { url?: string; html?: string };
        if (!url && !html) {
            return res.status(400).json({ success: false, error: 'Provide either "url" or "html" in the body.' });
        }

        let rawHtml = html || '';
        let label = 'pasted-html';
        if (url) {
            try {
                const response = await axios.get(url, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (TestPlanCreator)' },
                });
                rawHtml = String(response.data || '');
                label = url;
            } catch (e: any) {
                return res.status(502).json({ success: false, error: `Failed to fetch URL: ${e.message}` });
            }
        }

        const $ = cheerio.load(rawHtml);
        $('script, style, noscript, iframe, svg').remove();
        // Preserve heading hierarchy for the splitter to use.
        const blocks: string[] = [];
        $('h1, h2, h3, h4, p, li').each((_, el) => {
            const tag = (el as any).tagName?.toLowerCase?.() || '';
            const text = $(el).text().trim();
            if (!text) return;
            if (/^h[1-4]$/.test(tag)) {
                blocks.push(`\n\n## ${text}\n`);
            } else {
                blocks.push(text);
            }
        });
        const extractedText = blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (!extractedText) {
            return res.status(422).json({ success: false, error: 'Could not extract any text from the HTML.' });
        }

        const items = splitIntoRequirementItems(extractedText, 'HTML');
        res.json({
            success: true,
            source: 'html',
            label,
            items,
            rawText: extractedText.slice(0, 50000),
        });
    } catch (err: any) {
        console.error('HTML parse error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to parse HTML' });
    }
});

// ── Figma: file URL/key + access token → frames + components + text ─────────
app.post('/api/input/figma', async (req, res) => {
    try {
        const { figmaUrl, accessToken } = req.body as { figmaUrl?: string; accessToken?: string };
        if (!figmaUrl || !accessToken) {
            return res.status(400).json({ success: false, error: 'Missing "figmaUrl" or "accessToken".' });
        }

        // Accept either a full URL or a bare file key
        const keyMatch = figmaUrl.match(/(?:file|design)\/([A-Za-z0-9]+)/);
        const fileKey = keyMatch ? keyMatch[1] : figmaUrl.trim();
        if (!fileKey || fileKey.length < 6) {
            return res.status(400).json({ success: false, error: 'Could not parse Figma file key from URL.' });
        }

        let fileResp;
        try {
            fileResp = await axios.get(`https://api.figma.com/v1/files/${fileKey}`, {
                headers: { 'X-Figma-Token': accessToken },
                timeout: 20000,
            });
        } catch (e: any) {
            const status = e.response?.status;
            const msg = e.response?.data?.err || e.message;
            return res.status(502).json({ success: false, error: `Figma API error (${status}): ${msg}` });
        }

        const docName = fileResp.data?.name || 'Figma Document';
        const items: any[] = [];

        // Walk the document tree, capturing FRAME / COMPONENT nodes plus their text descendants.
        // Each frame becomes one "requirement-like" item.
        const walk = (node: any, parentPath: string) => {
            if (!node) return;
            const path = parentPath ? `${parentPath} / ${node.name}` : node.name;
            if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
                const texts: string[] = [];
                const collectText = (n: any) => {
                    if (!n) return;
                    if (n.type === 'TEXT' && typeof n.characters === 'string') {
                        texts.push(n.characters.trim());
                    }
                    if (Array.isArray(n.children)) n.children.forEach(collectText);
                };
                collectText(node);
                const description = texts.filter(Boolean).slice(0, 80).join('\n');
                if (description) {
                    items.push({
                        id: `FIGMA-${items.length + 1}`,
                        key: `FIG-${items.length + 1}`,
                        summary: path.length > 140 ? path.slice(0, 137) + '...' : path,
                        description,
                        status: 'Design',
                    });
                }
            }
            if (Array.isArray(node.children)) {
                node.children.forEach((c: any) => walk(c, path));
            }
        };
        walk(fileResp.data?.document, '');

        if (items.length === 0) {
            return res.status(422).json({ success: false, error: 'No frames or components with text content were found.' });
        }

        res.json({
            success: true,
            source: 'figma',
            label: docName,
            items: items.slice(0, 50),
        });
    } catch (err: any) {
        console.error('Figma parse error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch Figma file' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Notifications — config, test send, and the helper that turns an execution
//  report into a multi-channel notification event.
// ════════════════════════════════════════════════════════════════════════════

// Build a NotificationEvent from an ExecutionReport. Trigger kind depends on
// whether any test failed/errored.
function buildExecutionNotification(
    report: ExecutionReport,
    extra: { mode: 'AI Agent' | 'Playwright Script'; productName?: string; reportUrl?: string } = { mode: 'AI Agent' }
): NotificationEvent {
    const { summary } = report;
    const anyFailed = summary.failed > 0 || summary.errors > 0;
    const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

    const fields = [
        { label: 'Total', value: String(summary.total) },
        { label: 'Passed', value: String(summary.passed) },
        { label: 'Failed', value: String(summary.failed) },
        { label: 'Errors', value: String(summary.errors) },
        { label: 'Skipped', value: String(summary.skipped) },
        { label: 'Duration', value: `${(summary.duration / 1000).toFixed(1)}s` },
        { label: 'Pass Rate', value: `${passRate}%` },
        { label: 'Mode', value: extra.mode },
    ];

    const failedList = (report.results || [])
        .filter((r: any) => r.status === 'FAIL' || r.status === 'ERROR')
        .slice(0, 5)
        .map((r: any) => `• TC-${r.id} ${r.name}${r.error ? `: ${String(r.error).slice(0, 200)}` : ''}`)
        .join('\n');

    return {
        kind: anyFailed ? 'execution-failed' : 'execution-complete',
        title: anyFailed
            ? `❌ Test Run Failed${extra.productName ? ` — ${extra.productName}` : ''} (${summary.failed}/${summary.total} failed)`
            : `✅ Test Run Passed${extra.productName ? ` — ${extra.productName}` : ''} (${summary.passed}/${summary.total})`,
        summary: anyFailed
            ? `Pass rate ${passRate}% · ${summary.failed} failed, ${summary.errors} error(s) in ${(summary.duration / 1000).toFixed(1)}s`
            : `All ${summary.total} test cases passed in ${(summary.duration / 1000).toFixed(1)}s`,
        details: failedList || undefined,
        fields,
        link: extra.reportUrl ? { label: 'View HTML Report', url: extra.reportUrl } : undefined,
    };
}

// Public so other endpoints (and any future code path) can call it consistently.
async function notifyExecutionCompleted(
    report: ExecutionReport,
    extra: { mode: 'AI Agent' | 'Playwright Script'; productName?: string; reportUrl?: string } = { mode: 'AI Agent' }
) {
    try {
        const event = buildExecutionNotification(report, extra);
        await dispatchNotification(event);
    } catch (e: any) {
        console.warn('Notification dispatch failed:', e.message);
    }
}

// ─── Config endpoints ───────────────────────────────────────────────────────
app.get('/api/notifications/config', (_req, res) => {
    const cfg = loadNotificationConfig();
    // Redact the SMTP password before returning to the frontend.
    const safe = {
        ...cfg,
        email: { ...cfg.email, smtpPass: cfg.email.smtpPass ? '••••••••' : '' },
    };
    res.json(safe);
});

app.post('/api/notifications/config', (req, res) => {
    try {
        const incoming = req.body as NotificationConfig;
        if (!incoming || typeof incoming !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid config payload' });
        }
        // If the frontend sends placeholder dots, preserve the existing pass.
        if (incoming.email?.smtpPass === '••••••••') {
            incoming.email.smtpPass = '';
        }
        saveNotificationConfig(incoming);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Test send ──────────────────────────────────────────────────────────────
app.post('/api/notifications/test', async (_req, res) => {
    try {
        const results = await dispatchNotification({
            kind: 'test',
            title: '🔔 Test Notification',
            summary: 'If you can read this, your channel is configured correctly.',
            fields: [
                { label: 'Sent At', value: new Date().toISOString() },
                { label: 'Source', value: 'Intelligent Test Planning Agent' },
            ],
        });
        res.json({ success: true, results });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Run History — list/get/stats/delete
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/history/runs', (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 1000);
    try {
        res.json({ runs: listRuns(limit) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history/runs/:id', (req, res) => {
    try {
        const run = getRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'Run not found' });
        res.json(run);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/history/runs/:id', (req, res) => {
    try {
        const ok = deleteRun(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Run not found' });
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/history/stats', (_req, res) => {
    try {
        res.json(computeStats());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Quality Audit — visual regression + accessibility
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/audit/visual', async (req, res) => {
    try {
        const { url, name, fullPage, setBaseline, viewport } = req.body || {};
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing "url"' });
        }
        const result = await runVisualAudit({ url, name, fullPage, setBaseline, viewport });
        // Rewrite the served URLs to be absolute so the frontend can render them
        // regardless of which host:port served the audit endpoint.
        const host = req.headers.host || `localhost:${process.env.PORT || 3001}`;
        const protocol = req.protocol;
        const abs = (rel?: string) => (rel ? `${protocol}://${host}${rel}` : undefined);
        res.json({
            ...result,
            baselineUrl: abs(result.baselineUrl),
            currentUrl: abs(result.currentUrl),
            diffUrl: abs(result.diffUrl),
        });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/audit/a11y', async (req, res) => {
    try {
        const { url, standards } = req.body || {};
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing "url"' });
        }
        const result = await runA11yAudit({ url, standards });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  API Testing — runner + OpenAPI spec parser
// ════════════════════════════════════════════════════════════════════════════

app.post('/api/apitest/parse-spec', (req, res) => {
    try {
        const { spec, baseUrl, maxTests } = req.body || {};
        if (!spec || typeof spec !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing "spec" (string)' });
        }
        const result = parseOpenApiSpec(spec, { baseUrl, maxTests });
        if (!result.success) return res.status(400).json(result);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/apitest/run', async (req, res) => {
    try {
        const { tests, envVars } = req.body as { tests: ApiTest[]; envVars?: Record<string, string> };
        if (!Array.isArray(tests) || tests.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing "tests" (array)' });
        }
        // runTestSuite handles per-test errors and threads extracted variables
        // through the sequence. If a single test is supplied, this still works
        // and the variable map collapses to just env vars.
        const { results, finalVars } = await runTestSuite(tests, envVars || {});
        const summary = {
            total: results.length,
            passed: results.filter((r) => r.status === 'PASS').length,
            failed: results.filter((r) => r.status === 'FAIL').length,
            errors: results.filter((r) => r.status === 'ERROR').length,
            totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
        };
        res.json({ success: true, results, summary, finalVars });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── API Test Suites ──────────────────────────────────────────────────
app.get('/api/apitest/suites', (_req, res) => {
    try {
        res.json({ suites: listSuites() });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/apitest/suites/:name', (req, res) => {
    try {
        const suite = getSuite(req.params.name);
        if (!suite) return res.status(404).json({ error: 'Suite not found' });
        res.json(suite);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/apitest/suites', (req, res) => {
    try {
        const suite = req.body as ApiSuite;
        if (!suite?.name) return res.status(400).json({ error: 'Missing "name"' });
        const saved = saveSuite(suite);
        res.json({ success: true, suite: saved });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.delete('/api/apitest/suites/:name', (req, res) => {
    try {
        const ok = deleteSuite(req.params.name);
        if (!ok) return res.status(404).json({ error: 'Suite not found' });
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  CI/CD — GitHub Actions integration (proxies GitHub API server-side so the
//  user's PAT never reaches the browser).
// ════════════════════════════════════════════════════════════════════════════

app.get('/api/cicd/config', (_req, res) => {
    const cfg = loadCicdConfig();
    res.json({
        owner: cfg.owner,
        repo: cfg.repo,
        workflowFile: cfg.workflowFile,
        defaultBranch: cfg.defaultBranch,
        tokenSet: !!cfg.token,
    });
});

app.post('/api/cicd/config', (req, res) => {
    try {
        const incoming = req.body as Partial<CICDConfig>;
        const saved = saveCicdConfig(incoming);
        res.json({
            success: true,
            owner: saved.owner,
            repo: saved.repo,
            workflowFile: saved.workflowFile,
            defaultBranch: saved.defaultBranch,
            tokenSet: !!saved.token,
        });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/cicd/test', async (_req, res) => {
    const result = await testCicdConnection(loadCicdConfig());
    res.json(result);
});

app.get('/api/cicd/workflow', async (_req, res) => {
    try {
        const wf = await getCicdWorkflow(loadCicdConfig());
        res.json({
            id: wf.id,
            name: wf.name,
            path: wf.path,
            state: wf.state,
            badgeUrl: wf.badge_url,
            htmlUrl: wf.html_url,
        });
    } catch (e: any) {
        res.status(400).json({ error: e.response?.data?.message || e.message });
    }
});

app.get('/api/cicd/workflows', async (_req, res) => {
    try {
        const items = await listCicdWorkflows(loadCicdConfig());
        res.json({ workflows: items });
    } catch (e: any) {
        res.status(400).json({ error: e.response?.data?.message || e.message });
    }
});

app.get('/api/cicd/runs', async (req, res) => {
    try {
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
        const runs = await listCicdRuns(loadCicdConfig(), limit);
        res.json({ runs });
    } catch (e: any) {
        res.status(400).json({ error: e.response?.data?.message || e.message });
    }
});

app.post('/api/cicd/trigger', async (req, res) => {
    try {
        const { ref, reason } = req.body || {};
        const inputs = reason ? { reason: String(reason) } : undefined;
        const result = await triggerCicdWorkflow(loadCicdConfig(), ref, inputs);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(400).json({ error: e.response?.data?.message || e.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n🚀 Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Reports will be saved to ./reports/`);
    console.log(`📹 Videos will be saved to ./videos/\n`);
});

// Re-export so other modules in this file can call them if needed
export { notifyExecutionCompleted };
