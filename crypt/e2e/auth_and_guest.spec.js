import { test, expect } from '@playwright/test';

test.describe('E2E Journey 3: Authentication, Guest Mode, & Error Recovery', () => {

  test('7. Guest Identity Flow: Provisions guest ID and displays guest profile in sidebar', async ({ page }) => {
    await page.goto('/chat');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Hello');

    const sendButton = page.locator('button[aria-label="Send message"]');
    await sendButton.click();

    // Check localStorage in the browser context for the guest ID
    const guestId = await page.evaluate(() => localStorage.getItem('digilab-guest-id'));
    expect(guestId).toBeTruthy();
    expect(guestId).toMatch(/^guest_/);

    // Verify sidebar displays Guest User identity
    const guestText = page.locator('text=Guest User');
    await expect(guestText.first()).toBeVisible({ timeout: 10000 });
  });

  test('8. Authentication UI Flow: Login form renders and displays validation error for unregistered user', async ({ page }) => {
    await page.goto('/login');

    // Verify login form elements
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Enter unregistered test email
    await emailInput.fill('unregistered_e2e_user@digilab.internal');

    // Click "Continue" button inside the form
    const continueBtn = page.locator('button:has-text("Continue")');
    await expect(continueBtn).toBeVisible();
    await continueBtn.click();

    // The backend /auth/check-user rejects unregistered email; UI surfaces the error alert
    const errorAlert = page.locator('.text-red-500');
    await expect(errorAlert.first()).toBeVisible({ timeout: 10000 });
  });

  test('9. Authenticated User Flow: Populated session displays user identity and enables profile navigation', async ({ page }) => {
    // Intercept sessions endpoint so simulated user session stays active without dead-token redirect
    await page.route('**/api/chat/sessions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/api/research/sessions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Seed localStorage with an authenticated user profile before navigation
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 'user_e2e_student',
        name: 'Test Student',
        email: 'student@digilab.internal',
        role: 'student',
        token: 'valid_mock_jwt_for_e2e_ui',
      }));
    });

    await page.goto('/chat');

    // The sidebar should reflect the authenticated user's name and role
    const userName = page.locator('text=Test Student');
    await expect(userName.first()).toBeVisible({ timeout: 10000 });

    const userRole = page.locator('text=student');
    await expect(userRole.first()).toBeVisible({ timeout: 10000 });

    // Clicking profile link navigates to /profile
    const profileLink = page.locator('a[href="/profile"]').first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await expect(page).toHaveURL(/.*profile/);
  });

  test('10. Backend Error Recovery: Server failure displays error bubble, clears loading, allows retry', async ({ page }) => {
    // Intercept chat endpoint to return a controlled 500 error
    await page.route('**/api/voice/chat**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Controlled test upstream service failure' }),
      });
    });

    await page.goto('/chat');

    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Query that causes server error');

    const sendButton = page.locator('button[aria-label="Send message"]');
    await sendButton.click();

    // Verify user bubble rendered
    await expect(page.locator('text=Query that causes server error')).toBeVisible();

    // Verify the error bubble is rendered with user-friendly apology message
    const errorBubble = page.locator('text=Sorry, I encountered an error');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // Verify loading state is cleared: textarea is enabled and user can type again
    await expect(textarea).toBeEnabled();
    await textarea.fill('Retry query');
    await expect(textarea).toHaveValue('Retry query');
  });

});
