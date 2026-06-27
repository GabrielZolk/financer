import { defineConfig, devices } from "@playwright/test";

/**
 * E2E com Playwright — camada extra além dos testes unitários (vitest).
 * Sobe o dev server numa porta fixa e roda os fluxos críticos no navegador.
 * Rodar: `npm run test:e2e`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5199",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
