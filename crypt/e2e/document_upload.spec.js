import { test, expect } from '@playwright/test';

test.describe('E2E Journey 2: Document Upload & Lifecycle', () => {

  test('5. Real Upload Boundary: Unauthenticated upload attempt triggers expected error handling and clean removal', async ({ page }) => {
    await page.goto('/chat');

    // Create a temporary small file buffer for upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Sample study notes content'),
    });

    // The attachment pill should render the file name
    const attachmentPill = page.locator('text=notes.txt');
    await expect(attachmentPill).toBeVisible({ timeout: 10000 });

    // Since the guest is unauthenticated, backend rejects with 401 and UI reflects "Couldn't process"
    const failureIndicator = page.locator("text=Couldn't process");
    await expect(failureIndicator).toBeVisible({ timeout: 10000 });

    // The user can remove the failed attachment
    const removeButton = page.locator('button[aria-label="Remove attachment"]');
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    // Verify attachment pill is removed and UI returns to clean state
    await expect(attachmentPill).not.toBeVisible();
  });

  test('6. Document Upload Lifecycle: Handles 202 Accepted, status polling, and transition to READY', async ({ page }) => {
    // Intercept backend upload to simulate successful job dispatch
    const testJobId = 'job_e2e_lifecycle_' + Date.now();
    let pollCount = 0;

    await page.route('**/api/chat/upload', async (route) => {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Document uploaded and processing started',
          jobId: testJobId,
          documentId: 'doc_e2e_123',
          url: '/uploads/curriculum.pdf',
        }),
      });
    });

    await page.route(`**/api/chat/upload-status/${testJobId}`, async (route) => {
      pollCount++;
      // First poll returns PROCESSING, second poll returns READY
      if (pollCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'PROCESSING', stage: 'EXTRACTING', progress: 50 }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'READY', stage: 'COMPLETE', progress: 100 }),
        });
      }
    });

    await page.goto('/chat');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'curriculum.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 minimal test pdf'),
    });

    // Verify attachment pill appears with file name
    const attachmentPill = page.locator('text=curriculum.pdf');
    await expect(attachmentPill).toBeVisible();

    // Verify processing spinner appears initially
    const spinner = page.locator('[aria-label="Processing document"]');
    await expect(spinner).toBeVisible({ timeout: 5000 });

    // Wait for polling to transition job to READY (spinner disappears)
    await expect(spinner).not.toBeVisible({ timeout: 10000 });

    // When attachment is READY, send button is enabled even without text
    const sendButton = page.locator('button[aria-label="Send message"]');
    await expect(sendButton).toBeEnabled();
  });

});
