import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 30000
    },
    {
      command: 'npm run dev:client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 30000
    }
  ]
});