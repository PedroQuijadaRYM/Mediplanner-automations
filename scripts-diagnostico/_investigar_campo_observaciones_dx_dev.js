const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
// Solo lectura: abre "Ver consulta" de la consulta de hoy de Tapia e inventaría la tarjeta Diagnóstico.
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill('Tapia');
    await page.waitForTimeout(3000);
    await page.locator('.rdt_TableRow', { hasText: /Agustin Tapia Nievas/i }).first().locator('span.font-semibold').click();
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByText(/cefalea persistente/i).first().click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Ver consulta' }).click();
    await expect(page.getByRole('heading', { level: 3, name: /Diagn/i }).first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(5000);
    const card = page.getByRole('heading', { level: 3, name: /^Diagn/i }).first().locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
    console.log('HTML tarjeta Diagnóstico:\n' + (await card.innerHTML()).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').substring(0, 6000));
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await card.screenshot({ path: 'test-results/hallazgo-e-tarjeta-diagnostico.png' });
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
