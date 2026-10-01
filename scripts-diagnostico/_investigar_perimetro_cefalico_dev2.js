const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/auditoria.js');
// Solo lectura: ¿dónde se captura/ve el perímetro cefálico de Percentil?
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill('Percentil');
    await page.waitForTimeout(3000);
    await page.locator('.rdt_TableRow', { hasText: /Percentil Prueba/i }).first().locator('span.font-semibold').click();
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('CABECERA:', (await page.locator('body').innerText()).split('\n').filter(Boolean).slice(11, 32).join(' | '));
    await page.getByRole('button', { name: 'Percentil', exact: true }).click();
    await page.waitForTimeout(3000);
    const rep = await auditarPantalla(page, 'Percentil — pestaña Percentil', { maxWaitMs: 30000 });
    console.log('TEXTO pestaña Percentil:\n' + rep.textoCompleto.split('\n').filter(Boolean).slice(30, 120).join(' | '));
    console.log('INVENTARIO:', JSON.stringify(rep.inventario.filter(e => e.tag !== 'button')));
    await page.screenshot({ path: 'test-results/perimetro-pestana-percentil.png', fullPage: true });
    await page.getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByText(/cefalea persi/i).nth(1).click();
    await page.waitForTimeout(3000);
    await page.getByText('Exploración', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    const t = await page.locator('body').innerText();
    const i = t.indexOf('Signos vitales');
    console.log('SIGNOS VITALES de la consulta terminada de Percentil:', t.substring(i, i + 400).replace(/\n/g, ' | '));
    console.log('¿menciona cefálico/perímetro en esa vista?', /cef[aá]lic|per[ií]metro/i.test(t));
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
