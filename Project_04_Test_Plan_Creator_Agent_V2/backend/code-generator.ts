import { OpenAI } from "openai";

interface TestCase {
    name: string;
    jiraKey?: string;
    preconditions: string;
    steps: string[];
    expectedResult: string;
    priority: string;
}

interface PageInspection {
    url: string;
    title: string;
    visibleText: string;
    elements: Array<{
        text: string;
        type: string;
        selector: string;
        xpath?: string;
    }>;
}

/**
 * Generate Playwright test code for all test cases
 * This approach has the LLM write the actual test code instead of calling tools
 */
export async function generatePlaywrightCode(
    testCases: TestCase[],
    pageInspection: PageInspection | null,
    llmConfig: any
): Promise<string> {
    // Get base URL based on provider
    const getBaseURL = (config: any): string => {
        switch (config.provider) {
            case 'Groq':
                return 'https://api.groq.com/openai/v1';
            case 'Ollama':
                return `${(config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1`;
            case 'Gemini':
                return 'https://generativelanguage.googleapis.com/v1beta/openai/';
            case 'OpenAI':
            default:
                return 'https://api.openai.com/v1';
        }
    };

    const openai = new OpenAI({
        apiKey: llmConfig.apiKey || "dummy",
        baseURL: getBaseURL(llmConfig)
    });

    // Extract URL from first test case preconditions
    let targetUrl = "";
    if (testCases.length > 0) {
        const urlMatch = testCases[0].preconditions.match(/(https?:\/\/[^\s]+)/i);
        targetUrl = urlMatch ? urlMatch[1].trim() : "";
    }

    // Build system prompt for code generation
    const systemPrompt = `You are an expert Playwright test code generator. Your job is to write clean, maintainable Playwright code for test automation.

IMPORTANT RULES:
1. Generate ONLY executable Playwright code - no explanations or markdown
2. Start with: import { test, expect, chromium } from '@playwright/test';
3. Use async functions for all test cases
4. Always use proper locators and selectors
5. Add proper wait times for dynamic content
6. Include error handling with try-catch where needed
7. Use clear variable names and comments
8. Each test should be independent and self-contained
9. Return only the code, nothing else

LOCATOR PRIORITIES (use in this order):
1. data-testid attributes: [data-testid="..."]
2. ID attributes: #... (very stable for SauceDemo)
3. Name attributes: [name="..."]
4. Exact text match: text="exact text"
5. Role-based: role=button with name="..."
6. CSS selectors: input[type="email"]
7. XPath as last resort

PLAYWRIGHT BEST PRACTICES:
- STRIKT MODE: Avoid "locator resolved to 2 elements" errors. Use .first() if multiple elements match, or better, use page.locator('.selector', { hasText: '...' }) to be specific.
- ASSERTIONS: Use expect(page.locator('.item')).toContainText('...') but if it matches multiple, use expect(page.locator('.item').filter({ hasText: '...' })).toBeVisible().
- SCREENSHOTS: Use a safe string for filename. Example: const safeTitle = test.info().title.replace(/[^a-z0-9]/gi, '_');
- LOGS: Use console.log for key actions to help debugging.

VALIDATION LOGIC RULES:
- If a test step says "Enter username but leave password empty", and you expect a validation message, ensure the Playwright code actually performs the actions as described.
- If the app returns "Password is required" when username is filled, make sure your assertion matches the ACTUAL app behavior for that state.
- Always use page.waitForSelector() before interacting or asserting on dynamic error messages.
- For SauceDemo specifically, use #user-name, #password, and #login-button selectors as they are highly reliable.
- Error messages in SauceDemo appear in [data-test="error"]. Use this instead of #error if possible.`;

    // Build page context for code generation
    const pageContext = pageInspection
        ? `\nPAGE CONTEXT:
URL: ${pageInspection.url}
Page Title: ${pageInspection.title}

Available Elements:
${pageInspection.elements.map((el) => `- ${el.type}: "${el.text}" (selector: ${el.selector})`).join("\n")}

Visible Text on Page:
${pageInspection.visibleText}`
        : "";

    // Build test cases description
    const testCasesDescription = testCases
        .map(
            (tc, idx) => `
Test ${idx + 1}: ${tc.name}
Priority: ${tc.priority}
Preconditions: ${tc.preconditions}
Steps:
${tc.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
Expected Result: ${tc.expectedResult}`
        )
        .join("\n---\n");

    const userPrompt = `Generate Playwright test code for the following test cases:
${pageContext}

TEST CASES TO AUTOMATE:
${testCasesDescription}

Generate complete, executable Playwright code that:
1. Navigates to the URL in preconditions
2. Implements each step using appropriate Playwright methods
3. Verifies the expected result
4. Includes proper waits and error handling
5. Is well-commented and easy to understand

Start with imports and generate all test code in one file.`;

    console.log(`\n🤖 Generating Playwright test code using ${llmConfig.model || "gpt-4o"}...`);

    try {
        const response = await openai.chat.completions.create({
            model: llmConfig.model || "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ],
            temperature: 0.3,
            max_tokens: 4000
        });

        const generatedCode = response.choices[0].message.content || "";

        // Clean up the response (remove markdown code blocks if present)
        let code = generatedCode;
        if (code.includes("```")) {
            const match = code.match(/```(?:typescript|javascript|playwri ght)?\n?([\s\S]*?)```/);
            if (match) {
                code = match[1].trim();
            }
        }

        console.log(`✅ Generated ${code.split("\n").length} lines of Playwright code`);
        return code;
    } catch (err: any) {
        console.error("❌ Code generation failed:", err.message);
        throw new Error(`Failed to generate Playwright code: ${err.message}`);
    }
}

/**
 * Extract page information for code generation
 */
export async function inspectPageForCodeGen(page: any): Promise<PageInspection> {
    try {
        // Get page title
        const title = await page.title();

        // Get all visible text
        const visibleText = await page.evaluate(() => {
            return document.body.innerText;
        });

        // Get interactive elements
        const elements = await page.evaluate(() => {
            const els: Array<{
                text: string;
                type: string;
                selector: string;
            }> = [];

            // Get buttons
            document.querySelectorAll("button, input[type='submit']").forEach((btn: any) => {
                const text = btn.textContent?.trim() || btn.value || btn.getAttribute("aria-label") || "Button";
                els.push({
                    text: text,
                    type: "button",
                    selector: btn.getAttribute("data-test") || btn.getAttribute("data-testid") || btn.getAttribute("id") || `button:has-text("${text}")`
                });
            });

            // Get inputs
            document.querySelectorAll("input:not([type='submit'])").forEach((inp: any) => {
                const label =
                    inp.getAttribute("placeholder") ||
                    inp.getAttribute("aria-label") ||
                    inp.getAttribute("name") ||
                    inp.getAttribute("id") ||
                    "Input";
                els.push({
                    text: label,
                    type: "input",
                    selector: inp.getAttribute("data-test") || inp.getAttribute("data-testid") || inp.getAttribute("id") || `input[name="${inp.getAttribute("name")}"]`
                });
            });

            // Get specific error containers or text
            document.querySelectorAll("[data-test='error'], .error-message, #error").forEach((err: any) => {
                els.push({
                    text: err.textContent?.trim() || "Error message",
                    type: "error",
                    selector: err.getAttribute("data-test") ? `[data-test="${err.getAttribute("data-test")}"]` : (err.getAttribute("id") ? `#${err.getAttribute("id")}` : ".error")
                });
            });

            // Get product/cart items specifically for SauceDemo or similar apps
            document.querySelectorAll(".inventory_item, .cart_item, [data-test='inventory-item']").forEach((item: any) => {
                const name = item.querySelector(".inventory_item_name, .inventory_item_label")?.textContent?.trim() || "Item";
                els.push({
                    text: name,
                    type: "product_item",
                    selector: item.getAttribute("data-test") ? `[data-test="${item.getAttribute("data-test")}"]` : ".cart_item"
                });
            });

            return els;
        });

        return {
            url: page.url(),
            title,
            visibleText,
            elements
        };
    } catch (err: any) {
        console.error("❌ Page inspection failed:", err.message);
        throw new Error(`Failed to inspect page: ${err.message}`);
    }
}

/**
 * Execute generated Playwright code
 */
export async function executePlaywrightCode(code: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
}> {
    try {
        console.log("\n▶️  Executing Playwright test code...");

        // This would typically be executed in a sandbox or separate process
        // For now, we'll return the code for execution
        return {
            success: true,
            output: code
        };
    } catch (err: any) {
        return {
            success: false,
            output: "",
            error: err.message
        };
    }
}
