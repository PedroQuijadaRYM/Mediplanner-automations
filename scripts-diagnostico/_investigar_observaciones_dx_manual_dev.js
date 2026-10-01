const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/utils.js');
const { iniciarConsultaDelPaciente } = require('../e2e/consulta/navegacion.js');
// Hallazgo E: inicia una consulta de hoy (NO la finaliza), inventaría la tarjeta Diagnóstico editable,
// llena "Observaciones" por el campo REAL, guarda, recarga y comprueba si persiste.
const OBS = 'OBS-DX-MANUAL: observaciones del diagnóstico escritas por el campo real.';
const OUT = 'test-results/hallazgo-e';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST' && /addDiagnosis/.test(r.url())) posts.push(r.postData()); });
  try {
    await iniciarConsultaDelPaciente(page);
    await expect(page.getByRole('button', { name: /capturar signos vitales/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /capturar signos vitales/i }).click();
    await page.waitForTimeout(1000);
    await page.locator('input[name="peso"]').fill('82');
    await page.locator('input[name*="talla" i]').first().fill('183');
    await page.locator('input[placeholder="000/000 mmHg"]').fill('120/080');
    await page.locator('input[name*="temp" i]').first().fill('36.8');
    await page.locator('input[name*="card" i]').first().fill('72');
    await page.locator('input[name="oxigenacion"]').first().fill('97');
    await page.locator('input[name="frecuencia_respiratoria"]').first().fill('16');
    if (await page.locator('input[name="glucosa"]').count() > 0) await page.locator('input[name="glucosa"]').first().fill('90');
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase() === 'guardar'); return b && !b.disabled; }, { timeout: 10000 });
    await page.getByRole('button', { name: /^Guardar$/i }).click();
    await page.waitForTimeout(1500);
    const cerrar = page.getByRole('button', { name: /cerrar/i });
    if (await cerrar.count() > 0 && await cerrar.first().isVisible()) { await cerrar.first().click(); await page.waitForTimeout(1000); }
    await page.waitForURL(/Consulta\/(ConsultaGeneral|ConsultaDetalles)/, { timeout: 20000 });
    await auditarPantalla(page, 'Consulta recién cargada', { maxWaitMs: 30000 });
    console.log('URL:', page.url());

    const heading = page.getByRole('heading', { level: 3, name: /^Diagn/i }).first();
    await expect(heading).toBeVisible({ timeout: 15000 });
    const card = heading.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
    await card.scrollIntoViewIfNeeded();
    console.log('HTML tarjeta Diagnóstico (EDITABLE, antes de tocar nada):\n' + (await card.innerHTML()).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').substring(0, 7000));
    await card.screenshot({ path: `${OUT}/1-tarjeta-antes.png` });
    const campos = await card.locator('textarea, input, [contenteditable="true"], [role="combobox"]').evaluateAll(els => els.map(e => ({ tag: e.tagName.toLowerCase(), type: e.type || null, placeholder: e.getAttribute('placeholder'), role: e.getAttribute('role'), name: e.getAttribute('name'), id: e.id, visible: !!(e.offsetWidth || e.offsetHeight), valor: (e.value ?? e.innerText ?? '').substring(0, 30) })));
    console.log('CAMPOS en la tarjeta:', JSON.stringify(campos, null, 1));

    // ── Llenado a mano por el campo REAL ──
    await card.locator('textarea[placeholder="Impresión diagnóstica"]').fill('Impresión diagnóstica manual (Hallazgo E).');
    const cie = card.locator('textarea[role="combobox"]');
    await cie.click(); await cie.fill('K59'); await page.waitForTimeout(2000);
    const opt = page.locator('[role="option"]:visible, div[id*="option"]:visible').first();
    await expect(opt, 'sin opciones CIE-10').toBeVisible({ timeout: 10000 });
    const optTxt = (await opt.textContent()).trim(); await opt.click(); console.log('CIE-10 elegido:', optTxt);
    const toggle = card.locator('label:has-text("Agregar observaciones")');
    await toggle.click();
    await page.waitForTimeout(800);
    const camposDespues = await card.locator('textarea:visible').evaluateAll(els => els.map(e => ({ placeholder: e.getAttribute('placeholder'), role: e.getAttribute('role'), name: e.getAttribute('name'), id: e.id })));
    console.log('Textareas visibles TRAS activar el interruptor:', JSON.stringify(camposDespues));
    const obsReal = card.locator('textarea:visible:not([role="combobox"]):not([placeholder="Impresión diagnóstica"])').first();
    await expect(obsReal, 'no apareció el textarea de Observaciones tras el interruptor').toBeVisible({ timeout: 5000 });
    await obsReal.fill(OBS);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: `${OUT}/2-tarjeta-observaciones-llena.png` });
    console.log('Observaciones escritas, valor leído de vuelta:', JSON.stringify(await obsReal.inputValue()));
    const resp = page.waitForResponse(r => r.url().includes('consultations/addDiagnosis'), { timeout: 20000 });
    await page.getByRole('button', { name: /guardar cambios/i }).first().click();
    const r = await resp;
    console.log('addDiagnosis status:', r.status(), '| body enviado:', r.request().postData());
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForLoadState('load');
    await auditarPantalla(page, 'Consulta tras recargar', { maxWaitMs: 30000 });
    const h2 = page.getByRole('heading', { level: 3, name: /^Diagn/i }).first();
    await expect(h2).toBeVisible({ timeout: 15000 });
    const card2 = h2.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," card ")][1]');
    await card2.scrollIntoViewIfNeeded();
    const valores = await card2.locator('textarea').evaluateAll(els => els.map(e => ({ placeholder: e.getAttribute('placeholder'), role: e.getAttribute('role'), valor: e.value })));
    console.log('TRAS RECARGAR — textareas:', JSON.stringify(valores));
    console.log('TRAS RECARGAR — interruptor marcado:', await card2.locator('input[type="checkbox"]').first().isChecked());
    console.log('¿"OBS-DX-MANUAL" persiste visible en la tarjeta?:', (await card2.innerText()).includes('OBS-DX-MANUAL') || valores.some(v => (v.valor || '').includes('OBS-DX-MANUAL')));
    await card2.screenshot({ path: `${OUT}/3-tarjeta-tras-recargar.png` });
  } finally {
    console.log('addDiagnosis posts:', JSON.stringify(posts));
    console.log('\n(Consulta NO finalizada; navegador abierto 5s)');
    await page.waitForTimeout(5000);
    await browser.close();
  }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
