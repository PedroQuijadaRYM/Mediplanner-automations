const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
const { iniciarConsultaDelPaciente } = require('../e2e/consulta/navegacion.js');
// Inventaría el modal "Capturar signos vitales" del paciente objetivo (NO finaliza la consulta).
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const posts = [];
  page.on('request', r => { if (/registerVitalSigns/.test(r.url())) posts.push(r.postData()); });
  try {
    await iniciarConsultaDelPaciente(page);
    await expect(page.getByRole('button', { name: /capturar signos vitales/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /capturar signos vitales/i }).click();
    await page.waitForTimeout(2500);
    const campos = await page.locator('input:visible, select:visible, textarea:visible').evaluateAll(els => els.map(e => ({ tag: e.tagName.toLowerCase(), type: e.type, name: e.getAttribute('name'), id: e.id, placeholder: e.getAttribute('placeholder'), etiqueta: (e.closest('div')?.parentElement?.querySelector('label')?.innerText || '').trim().substring(0, 40) })));
    console.log('CAMPOS del modal:', JSON.stringify(campos, null, 1));
    console.log('TEXTO modal:', (await page.locator('body').innerText()).split('\n').filter(Boolean).join(' | ').substring(0, 1500));
    await page.screenshot({ path: 'test-results/perimetro-modal-signos-vitales.png' });
  } finally { console.log('registerVitalSigns posts:', JSON.stringify(posts)); await page.waitForTimeout(3000); await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
