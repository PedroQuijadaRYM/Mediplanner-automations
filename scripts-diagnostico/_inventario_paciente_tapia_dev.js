const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/auditoria.js');

// Solo lectura: abre la ficha del paciente y vuelca inventario + texto completo.
// Sin catch silenciosos: toda precondición falla fuerte (CLAUDE.md §0.5/§0.7).
const BUSQUEDA = process.env.PACIENTE_BUSQUEDA || 'Tapia';
const NOMBRE = process.env.PACIENTE_NOMBRE || 'Agustin Tapia Nievas';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: ['--start-maximized'],
  });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const context = await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base });
  const page = await context.newPage();
  const errores = [];
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errores.push(`${r.status()} ${r.request().method()} ${r.url().split('/api/')[1]}`); });
  page.on('console', m => { if (m.type() === 'error') errores.push(`console.error: ${m.text().substring(0, 200)}`); });

  try {
    await page.goto('/Pacientes');
    await page.waitForLoadState('load');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill(BUSQUEDA);
    await page.waitForTimeout(3000);
    const filas = page.locator('.rdt_TableRow');
    const n = await filas.count();
    console.log(`Filas tras buscar "${BUSQUEDA}": ${n}`);
    for (let i = 0; i < n; i++) console.log(`  fila ${i}: ${(await filas.nth(i).innerText()).replace(/\n/g, ' | ')}`);
    const fila = page.locator('.rdt_TableRow', { hasText: new RegExp(NOMBRE, 'i') });
    expect(await fila.count(), `Debe haber exactamente 1 fila "${NOMBRE}"`).toBe(1);
    const enlace = fila.first().locator('span.font-semibold', { hasText: new RegExp(NOMBRE, 'i') });
    expect(await enlace.count(), 'Debe haber un nombre clickeable en la fila').toBeGreaterThan(0);
    await enlace.first().click();
    await page.waitForURL(u => !/\/Pacientes\/?$/i.test(u.pathname), { timeout: 20000 });
    await page.waitForLoadState('load');
    console.log(`📍 ${page.url()}`);
    // Precondición: la ficha terminó de renderizar (pestañas visibles + nombre en pantalla).
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).toContainText(new RegExp(NOMBRE, 'i'), { timeout: 20000 });
    await page.waitForTimeout(3000);
    fs.mkdirSync('logs', { recursive: true });
    for (const pestana of ['Información', 'Consultas', 'Percentil']) {
      await page.getByRole('button', { name: pestana, exact: true }).click();
      await page.waitForTimeout(2500);
      const rep = await auditarPantalla(page, `ficha Tapia — pestaña ${pestana}`, { maxWaitMs: 30000 });
      console.log(`
===== [${pestana}] TEXTO COMPLETO =====
` + rep.textoCompleto);
      console.log(`
===== [${pestana}] INVENTARIO =====`);
      rep.inventario.forEach(e => console.log(JSON.stringify(e)));
      const fechas = await page.locator('input[type="date"]:visible').evaluateAll(els => els.map(e => ({ name: e.name, id: e.id, value: e.value })));
      console.log(`[${pestana}] Inputs date:`, JSON.stringify(fechas));
      await page.screenshot({ path: `logs/inventario-tapia-${pestana}.png`, fullPage: true });
    }
  } finally {
    console.log('\nErrores API/consola:', JSON.stringify(errores, null, 1));
    await browser.close();
  }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
