const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
const D = require('../e2e/consulta/datos.js');
// Solo lectura: ¿dónde queda "Observaciones del diagnóstico"? Respuesta cruda de getConsultation + vista "Ver consulta".
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const crudas = [];
  page.on('response', async r => { if (/getConsultation\b/.test(r.url())) crudas.push(await r.text()); });
  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill(process.env.BUSQ || 'Tapia');
    await page.waitForTimeout(3000);
    await page.locator('.rdt_TableRow', { hasText: new RegExp(process.env.NOM || 'Agustin Tapia Nievas', 'i') }).first().locator('span.font-semibold').click();
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByText(new RegExp(process.env.MOTIVO || 'cefalea persistente', 'i')).nth(parseInt(process.env.IDX || '0', 10)).click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Ver consulta' }).click();
    await page.waitForTimeout(6000);
    const texto = await page.locator('body').innerText();
    console.log('URL:', page.url());
    console.log('Texto "Ver consulta" contiene observaciones dx:', texto.includes('paciente estable, se indica seguimiento'));
    const valores = await page.locator('textarea:visible, input:visible').evaluateAll(els => els.map(e => e.value).filter(Boolean));
    console.log('Valores en inputs/textareas:', valores.some(v => v.includes('paciente estable')));
    console.log('getConsultation capturadas:', crudas.length);
    for (const c of crudas) {
      console.log("contiene paciente estable:", c.includes("paciente estable"), "| nota_diagnostico =", JSON.stringify((()=>{try{return JSON.parse(c).data.nota_diagnostico}catch(e){return "?"}})()), "| impresion =", JSON.stringify((()=>{try{return JSON.parse(c).data.impresion_diagnostico}catch(e){return "?"}})()));
      try { const j = JSON.parse(c); console.log('claves data:', Object.keys(j.data || {}).join(', ')); } catch (e) { console.log('no JSON', c.slice(0, 200)); }
    }
    console.log('\n===== TEXTO "Ver consulta" =====\n' + texto);
    await page.screenshot({ path: 'logs/tapia-perfil/ver-consulta-completa.png', fullPage: true });
  } catch (e) { await page.screenshot({ path: 'logs/tapia-perfil/fallo-obs.png' }); console.log('URL al fallar:', page.url()); throw e; } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
