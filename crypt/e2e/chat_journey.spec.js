import { test, expect } from '@playwright/test';

test.describe('E2E Journey 1: Chat and Session Flows', () => {

  test('1. Application loads and renders the primary chat interface', async ({ page }) => {
    await page.goto('/chat');
    
    // Check page title
    await expect(page).toHaveTitle(/DigiLab|Media|Learning/i);

    // Verify chat composer controls
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    const attachButton = page.locator('button[aria-label="Attach file"]');
    await expect(attachButton).toBeVisible();

    const sendButton = page.locator('button[aria-label="Send message"]');
    await expect(sendButton).toBeVisible();

    // Verify model selector exists
    const modelSelector = page.locator('text=DigiLab');
    await expect(modelSelector.first()).toBeVisible();
  });

  test('2. Primary Chat Journey: User asks question, receives real response, verifies message state', async ({ page }) => {
    // Live LLM query can take up to 40 seconds
    test.setTimeout(60000);
    await page.goto('/chat');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('What is digital media?');

    const sendButton = page.locator('button[aria-label="Send message"]');
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Verify user bubble rendered
    const userMessage = page.locator('text=What is digital media?');
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // Wait for the assistant bubble with real response content
    // The assistant bubble renders Markdown content inside a text-sm container
    const assistantBubble = page.locator('.text-sm.leading-relaxed').first();
    await expect(assistantBubble).toBeVisible({ timeout: 45000 });

    // Ensure the response has meaningful text content
    const responseText = await assistantBubble.innerText();
    expect(responseText.length).toBeGreaterThan(10);

    // Ensure composer returns to ready state (textarea cleared and ready)
    await expect(textarea).toHaveValue('');
  });

  test('3. Session Lifecycle: Starting a new chat clears active messages and resets state', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/chat');

    // Send a message first
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Hello DigiLab');

    const sendButton = page.locator('button[aria-label="Send message"]');
    await sendButton.click();

    // Verify user message appeared
    await expect(page.locator('text=Hello DigiLab')).toBeVisible({ timeout: 10000 });

    // Click "New Chat" in the sidebar
    // If sidebar is collapsed on smaller screens, it has title "New Chat" or text "New Chat"
    const newChatButton = page.locator('button:has-text("New Chat"), button[title="New Chat"]').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();

    // Verify user message is no longer in the active conversation area
    await expect(page.locator('text=Hello DigiLab')).not.toBeVisible();

    // Verify initial assistant greeting is present
    await expect(page.locator('text=Hello! I am DigiLab')).toBeVisible({ timeout: 10000 });
  });

  test('4. Async and Race Checks: Empty input prevents send and maintains clean state', async ({ page }) => {
    await page.goto('/chat');

    const textarea = page.locator('textarea');
    const sendButton = page.locator('button[aria-label="Send message"]');

    // Empty input: send button disabled
    await expect(sendButton).toBeDisabled();

    // Whitespace input: send button remains disabled
    await textarea.fill('   ');
    await expect(sendButton).toBeDisabled();

    // Valid text: send button enables
    await textarea.fill('Valid query');
    await expect(sendButton).toBeEnabled();

    // Clearing text: send button disables again
    await textarea.fill('');
    await expect(sendButton).toBeDisabled();
  });

});
