import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  // Look for test files relative to the project root
  testDir: '.',

  // Tests run sequentially locally (so users can watch the browser);
  // in CI we parallelize to keep the pipeline fast.
  fullyParallel: isCI,
  workers: isCI ? 2 : 1,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: isCI,

  // Retry on CI only
  retries: isCI ? 2 : 1,

  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    // JUnit XML is the format most CI dashboards (GitHub Actions, GitLab, etc.) understand.
    ...(isCI ? [['junit', { outputFile: 'test-results/junit.xml' }] as ['junit', { outputFile: string }]] : []),
  ],

  use: {
    // Headless in CI (no display server), headed locally so users can watch.
    headless: isCI,

    // Collect traces on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video recording
    video: 'retain-on-failure',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Action timeout
    actionTimeout: 15000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  // Output directory for test artifacts
  outputDir: 'test-results/',
});
