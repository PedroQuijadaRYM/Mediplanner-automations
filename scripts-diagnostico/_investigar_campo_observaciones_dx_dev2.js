const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
// Abre la consulta "En progreso" de Percentil (restos de la corrida del 25/09), inventaría la tarjeta
// Diagnóstico EDITABLE y llena Observaciones a mano. NO finaliza la consulta.
const TEXTO = 'OBS-DX-MANUAL: observaciones del diagnóstico escritas a mano para el Hallazgo E.';
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST' && /addDiagnosis|getConsultation\b/.test(r.url())) posts.push(`${r.url().split('/api/')[1]} ${r.postData()}`); });
  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill('Percentil');
    await page.waitForTimeout(3000);
    await page.locator('.rdt_TableRow', { hasText: /Percentil Prueba/i }).first().locator('span.font-semibold').click();
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Consulta', exact: true }).first().click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);
    console.log('URL tras botón Consulta:', page.url());
    console.log('Botones:', JSON.stringify(await page.locator('button:visible').allInnerTexts()));
    await page.screenshot({ path: 'test-results/hallazgo-e-tras-boton-consulta.png' });
    await page.waitForTimeout(8000);
    const card = page.getByRole('heading', { level: 3, name: /^Diagn/i }).first().locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
    await expect(card).toBeVisible({ timeout: 20000 });
    console.log('HTML tarjeta Diagnóstico (editable):\n' + (await card.innerHTML()).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').substring(0, 6000));
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: 'test-results/hallazgo-e-tarjeta-editable.png' });
  } finally { console.log('POSTs:', JSON.stringify(posts, null, 1)); await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
