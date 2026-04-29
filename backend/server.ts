import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { runAgent, ExecutionReport } from './agent.js';
import { generateExcelReport } from './report.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = path.join(__dirname, 'reports');
const videosDir = path.join(__dirname, 'videos');

if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Logger middleware
app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Serve generated reports for download
app.use('/reports', express.static(reportsDir));

// Serve recorded test execution videos
app.use('/videos', express.static(videosDir));

// Progress Tracking
let executionStatus = {
    isRunning: false,
    currentCase: '',
    progress: 0,
    total: 0
};

export const updateExecutionStatus = (status: any) => {
    executionStatus = { ...executionStatus, ...status };
};

app.post('/api/execute', async (req, res) => {
    try {
        const { testCases, llmConfig } = req.body;

        if (!testCases || !llmConfig) {
            return res.status(400).json({ success: false, error: 'Missing testCases or llmConfig in request body.' });
        }

        console.log('\n========================================');
        console.log('🧪 Test Execution Request Received');
        console.log('========================================');

        executionStatus = {
            isRunning: true,
            currentCase: 'Initializing...',
            progress: 0,
            total: 0
        };

        // Run the LLM agent with Playwright MCP
        const report: ExecutionReport = await runAgent(testCases, llmConfig, updateExecutionStatus);

        // Generate the Excel report
        const reportPath = await generateExcelReport(report);
        const reportFilename = path.basename(reportPath);

        executionStatus.isRunning = false;
        res.json({
            success: true,
            report,
            reportDownloadUrl: `/reports/${reportFilename}`,
            message: `Execution complete. ${report.summary.passed}/${report.summary.total} passed.`
        });
    } catch (error: any) {
        console.error('❌ Execution error:', error.message);
        executionStatus.isRunning = false;
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check & Progress Status
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/execution-status', (_req, res) => {
    res.json(executionStatus);
});

const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n🚀 Backend server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Reports will be saved to ./reports/`);
    console.log(`📹 Videos will be saved to ./videos/\n`);
});
