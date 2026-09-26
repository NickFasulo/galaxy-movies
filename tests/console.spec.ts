import { test, expect } from '@playwright/test';

test('Check for browser console errors and warnings', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      logs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  await page.goto('http://localhost:3000');
  
  expect(logs, `Browser Console Issues Found:\n${logs.join('\n')}`).toEqual([]);
});