const { chromium, expect } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
// Solo lectura: lista pacientes (nombre/correo/última consulta) en dev y lee edad de cada uno vía getPatient/lista.
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  const resp = [];
  page.on('response', async r => { if (/getPatients|searchPatients|listPatients/i.test(r.url())) resp.push({ url: r.url().split('/api/')[1], body: await r.text() }); });
  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    const sel = page.locator('select').first();
    if (await sel.count()) await sel.selectOption({ label: 'Todos' }).catch(() => {});
    await page.waitForTimeout(3000);
    const filas = await page.locator('.rdt_TableRow').allInnerTexts();
    console.log(`Filas: ${filas.length}`);
    filas.forEach((f, i) => console.log(i, f.replace(/\n+/g, ' | ')));
    console.log('Respuestas API de lista:', resp.map(r => `${r.url} (${r.body.length} bytes)`).join(', '));
    const d = JSON.parse(resp[resp.length - 1].body).data; const lista = d.patients || d;
    lista.forEach(p => { const e = p.dFechaNacimiento ? Math.floor((Date.now() - new Date(p.dFechaNacimiento)) / 31557600000) : '?'; console.log('EDAD', e, '|', p.sNombre, p.sPaterno, p.sMaterno, '|', p.dFechaNacimiento, '| dep:', p.bDependiente, '| ult:', p.ultimaConsulta); });
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
