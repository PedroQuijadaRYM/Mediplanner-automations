const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/utils.js');
const { iniciarConsultaDelPaciente } = require('../e2e/consulta/navegacion.js');
const { fillChecklistSection } = require('../e2e/consulta/secciones.js');
// Hallazgo G: ¿cuándo/qué manda registerAnswers? Llena Exploración + Aparatos como el spec, registra el body de
// cada registerAnswers con hora, espera en reposo, pulsa "Guardar cambios" y espera de nuevo. NO finaliza.
const t0 = Date.now(); const t = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const calls = [];
  page.on('request', r => {
    if (!/registerAnswers/.test(r.url())) return;
    let resumen = r.postData() || '';
    try { const j = JSON.parse(resumen); const arr = j.respuestas || j.answers || j.elementos || []; resumen = `keys=${Object.keys(j).join(',')} n_resp=${Array.isArray(arr) ? arr.length : '?'} conValor=${Array.isArray(arr) ? arr.filter(a => a.valor || a.iValor || a.value).length : '?'} conObs=${Array.isArray(arr) ? arr.filter(a => (a.observaciones || a.sObservaciones || a.observacion || '').length).length : '?'} formulario=${j.formulario_id || j.relacion_id || j.form_id || ''}`; } catch (e) { resumen = resumen.substring(0, 200); }
    calls.push({ t: t(), resumen, raw: r.postData() });
    console.log(`${t()} 📤 registerAnswers ${resumen}`);
  });
  try {
    await iniciarConsultaDelPaciente(page);
    await page.getByRole('button', { name: /capturar signos vitales/i }).click();
    await page.waitForTimeout(1000);
    await page.locator('input[name="peso"]').fill('82');
    await page.locator('input[name*="talla" i]').first().fill('183');
    await page.locator('input[placeholder="000/000 mmHg"]').fill('120/080');
    await page.locator('input[name*="temp" i]').first().fill('36.8');
    await page.locator('input[name*="card" i]').first().fill('72');
    await page.locator('input[name="oxigenacion"]').first().fill('97');
    await page.locator('input[name="frecuencia_respiratoria"]').first().fill('16');
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase() === 'guardar'); return b && !b.disabled; }, { timeout: 10000 });
    await page.getByRole('button', { name: /^Guardar$/i }).click();
    await page.waitForTimeout(1500);
    const cerrar = page.getByRole('button', { name: /cerrar/i });
    if (await cerrar.count() > 0 && await cerrar.first().isVisible()) { await cerrar.first().click(); await page.waitForTimeout(1000); }
    await page.waitForURL(/Consulta\/(ConsultaGeneral|ConsultaDetalles)/, { timeout: 20000 });
    await auditarPantalla(page, 'Consulta recién cargada', { maxWaitMs: 30000 });
    console.log(`${t()} ▶ llenando Exploración`);
    await fillChecklistSection(page, /^Exploración segmentar[ií]a\s*$/i, 'Exploración segmentaria');
    console.log(`${t()} ▶ llenando Aparatos y sistemas`);
    await fillChecklistSection(page, /^Aparatos y sistemas$/i, 'Aparatos y sistemas');
    console.log(`${t()} ✔ fin del llenado — ESPERA EN REPOSO 40s (sin tocar nada)`);
    const antes = calls.length;
    await page.waitForTimeout(40000);
    console.log(`${t()} registerAnswers durante el reposo: ${calls.length - antes}`);
    console.log(`${t()} ▶ click "Guardar cambios"`);
    const antes2 = calls.length;
    await page.getByRole('button', { name: /guardar cambios/i }).first().click();
    await page.waitForTimeout(15000);
    console.log(`${t()} registerAnswers tras "Guardar cambios": ${calls.length - antes2}`);
    require('fs').writeFileSync('logs/registeranswers-calls.json', JSON.stringify(calls, null, 1));
    console.log('Resumen de llamadas:\n' + calls.map(c => `  ${c.t} ${c.resumen}`).join('\n'));
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
