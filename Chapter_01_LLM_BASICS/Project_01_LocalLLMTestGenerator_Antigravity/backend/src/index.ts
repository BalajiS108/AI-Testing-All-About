import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getAllSettings, setSetting } from './db';
import { generateTestCases } from './llmController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Local LLM TestGen Backend is running.' });
});

// Settings Endpoints
app.get('/api/settings', async (req: Request, res: Response) => {
    try {
        const settings = await getAllSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/settings', async (req: Request, res: Response) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            if (typeof value === 'string') {
                await setSetting(key, value);
            }
        }
        res.json({ message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// Generation Endpoints
app.post('/api/generate', async (req: Request, res: Response) => {
    try {
        const { requirement, provider } = req.body;
        if (!requirement || !provider) {
            res.status(400).json({ error: 'Requirement and provider are required.' });
            return;
        }

        const generatedTests = await generateTestCases(requirement, provider);
        res.json({ result: generatedTests });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});


// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
