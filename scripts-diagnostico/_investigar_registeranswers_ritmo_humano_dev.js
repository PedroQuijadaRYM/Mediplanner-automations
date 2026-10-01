const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/utils.js');
const { iniciarConsultaDelPaciente, sectionContainer } = require('../e2e/consulta/navegacion.js');
const { fillDiagnosticoSection } = require('../e2e/consulta/secciones.js');
const { guardarCambiosGlobal, waitForFinalizarButton } = require('../e2e/consulta/guardado.js');

// Hallazgo G con RITMO HUMANO (CLAUDE.md §0 / memoria feedback-timing-realista): checklist ítem por ítem, con
// pausas de 1-3 s, clic en Normal/Anormal, y las Observaciones TECLEADAS con retardo por carácter. Mide el estado
// guardado con getFilledForm en 4 momentos (antes de "Guardar cambios", tras él, y tras Finalizar).
const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
const humanPause = (page, a = 1000, b = 2500) => page.waitForTimeout(rnd(a, b));
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const PACIENTE = process.env.PACIENTE_NOMBRE;
const OUT = `logs/g-humano-${(process.env.PACIENTE_BUSQUEDA || 'x').replace(/\W/g, '')}`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Paciente: ${PACIENTE} (búsqueda "${process.env.PACIENTE_BUSQUEDA}")`);
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  let token = null, doctorId = null, consultaId = null, pacienteId = null;
  const calls = [];
  page.on('request', r => {
    const h = r.headers()['x-rym-token-app'];
    if (h && !token) token = h;
    if (/registerAnswers/.test(r.url())) {
      let n = '?';
      try { n = JSON.parse(r.postData()).campos.length; } catch (e) { console.log('registerAnswers body no parseable'); }
      calls.push({ t: t(), campos: n, raw: r.postData() });
      console.log(`${t()} registerAnswers (campos=${n})`);
    }
    if (/registerVitalSigns/.test(r.url())) {
      try { pacienteId = JSON.parse(r.postData()).paciente_id; } catch (e) { console.log('registerVitalSigns body no parseable'); }
    }
  });
  page.on('response', async r => {
    if (r.url().includes('/api/profile/getProfile')) {
      try { const b = await r.json(); if (b?.data?.id) doctorId = b.data.id; } catch (e) { console.log('getProfile no parseable'); }
    }
    if (/registerVitalSigns/.test(r.url())) {
      try { const b = await r.json(); if (b?.data?.consulta_id) consultaId = b.data.consulta_id; } catch (e) { console.log('registerVitalSigns no parseable'); }
    }
  });

  const fetchApi = async (endpoint, body) => (await (await page.request.post(`/api/${endpoint}`, { headers: { 'Content-Type': 'application/json', 'x-rym-token-app': token }, data: body })).json());

  // Llenado ítem por ítem a ritmo humano. Devuelve los esperados por ítem.
  async function llenarChecklistHumano(headingRegex, nombreLog) {
    const scope = await sectionContainer(page, headingRegex);
    const checkboxes = scope.locator('input[type="checkbox"]:not([disabled])');
    await expect(checkboxes.first(), `${nombreLog}: sin checkboxes`).toBeAttached({ timeout: 15000 });
    const total = await checkboxes.count();
    const etiquetas = await checkboxes.evaluateAll(els => els.map((el, i) => {
      const l = el.parentElement && el.parentElement.querySelector('label');
      return ((l && l.textContent) || '').trim() || `#${i}`;
    }));
    console.log(`${t()} >> ${nombreLog}: ${total} ítems, ritmo humano`);
    const items = [];
    for (let i = 0; i < total; i++) {
      const nombre = etiquetas[i];
      const anormal = i % 2 === 1;
      await humanPause(page);
      await checkboxes.nth(i).click({ force: true });
      await expect(scope.locator('div.simpleSelect label').nth(i * 2 + 1), `${nombreLog}: no aparecieron los botones Normal/Anormal del ítem ${i}`).toBeVisible({ timeout: 8000 });
      await expect(scope.locator('textarea:visible').nth(i), `${nombreLog}: no apareció el textarea del ítem ${i}`).toBeVisible({ timeout: 8000 });
      await humanPause(page, 800, 1800);
      await scope.locator('div.simpleSelect label').nth(i * 2 + (anormal ? 1 : 0)).click({ force: true });
      await humanPause(page, 600, 1500);
      const ta = scope.locator('textarea:visible').nth(i);
      await ta.click();
      const obs = anormal
        ? `${nombre}: hallazgo anormal detectado en ${nombre.toLowerCase()}, se sugiere valoración adicional (ítem #${i} de ${nombreLog}).`
        : `${nombre}: sin alteraciones aparentes en ${nombre.toLowerCase()} (ítem #${i} de ${nombreLog}).`;
      await ta.pressSequentially(obs, { delay: rnd(25, 55) });
      items.push({ nombre, valorEsperado: anormal ? 2 : 1, observacionEsperada: obs });
      console.log(`${t()}   ítem ${i + 1}/${total} ${nombre} (${anormal ? 'Anormal' : 'Normal'}) listo`);
    }
    return { nombreLog, items };
  }

  async function leerEstado(etiqueta, resultados) {
    const forms = await fetchApi('consultations/getForms', { paciente_id: pacienteId, consulta_id: consultaId });
    const reporte = {};
    for (const r of resultados) {
      const esExplor = r.nombreLog.toLowerCase().includes('explor');
      const info = (forms.data || []).find(f => sinAcentos(f.nombre).includes(esExplor ? 'exploracion' : 'aparatos'));
      if (!info) { reporte[r.nombreLog] = { error: 'form no encontrado' }; continue; }
      const f = await fetchApi('patients/getFilledForm', { paciente_id: pacienteId, relacion_id: info.relacion_id, consulta_id: consultaId, doctor_id: doctorId });
      if (f.status !== 'OK') { reporte[r.nombreLog] = { error: `${f.status}: ${f.message}` }; continue; }
      const el = f.data?.grupos?.[0]?.elementos || [];
      const malos = [];
      for (const it of r.items) {
        const v = el.find(e => sinAcentos(e.sTexto) === sinAcentos(it.nombre) && sinAcentos(e.sDescripcion) === sinAcentos(it.nombre));
        const o = el[el.findIndex(e => e === v) + 1];
        const valor = v?.valor;
        const obs = o?.sTexto === 'Observaciones' ? o.valor : undefined;
        if (Number(valor) !== it.valorEsperado) malos.push(`${it.nombre}: Normal/Anormal esperado=${it.valorEsperado} real=${valor}`);
        if (String(obs).trim() !== it.observacionEsperada) malos.push(`${it.nombre}: Observaciones ${obs ? 'distintas' : 'vacías'}`);
      }
      reporte[r.nombreLog] = { ok: r.items.length - new Set(malos.map(m => m.split(':')[0])).size, de: r.items.length, malos };
    }
    console.log(`\n${t()} ESTADO GUARDADO — ${etiqueta}`);
    for (const [k, v] of Object.entries(reporte)) {
      console.log(v.error ? `   ${k}: ERROR ${v.error}` : `   ${k}: ${v.ok}/${v.de} ítems correctos${v.malos.length ? '\n      - ' + v.malos.join('\n      - ') : ''}`);
    }
    return reporte;
  }

  try {
    await iniciarConsultaDelPaciente(page);
    await page.getByRole('button', { name: /capturar signos vitales/i }).click();
    await page.waitForTimeout(1000);
    await page.locator('input[name="peso"]').fill('78');
    await page.locator('input[name*="talla" i]').first().fill('175');
    await page.locator('input[placeholder="000/000 mmHg"]').fill('120/080');
    await page.locator('input[name*="temp" i]').first().fill('36.7');
    await page.locator('input[name*="card" i]').first().fill('72');
    await page.locator('input[name="oxigenacion"]').first().fill('97');
    await page.locator('input[name="frecuencia_respiratoria"]').first().fill('16');
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase() === 'guardar');
      return b && !b.disabled;
    }, { timeout: 10000 });
    await page.getByRole('button', { name: /^Guardar$/i }).click();
    await page.waitForTimeout(1500);
    const cerrar = page.getByRole('button', { name: /cerrar/i });
    if (await cerrar.count() > 0 && await cerrar.first().isVisible()) { await cerrar.first().click(); await page.waitForTimeout(1000); }
    await page.waitForURL(/Consulta\/(ConsultaGeneral|ConsultaDetalles)/, { timeout: 20000 });
    await auditarPantalla(page, 'Consulta recién cargada', { maxWaitMs: 30000 });
    expect(!!(consultaId && pacienteId && token && doctorId), `faltan ids: consulta=${consultaId} paciente=${pacienteId} token=${!!token} doctor=${doctorId}`).toBe(true);
    console.log(`${t()} consulta_id=${consultaId} paciente_id=${pacienteId}`);

    // General a ritmo humano (motivo tecleado)
    await humanPause(page, 2000, 4000);
    const motivo = page.locator('textarea[name="visitaPaciente"]');
    await motivo.click();
    await motivo.pressSequentially('Paciente acude por cefalea de 3 días de evolución.', { delay: rnd(30, 60) });

    const resultados = [];
    resultados.push(await llenarChecklistHumano(/^Exploración segmentar[ií]a\s*$/i, 'Exploración segmentaria'));
    await humanPause(page, 3000, 6000);
    resultados.push(await llenarChecklistHumano(/^Aparatos y sistemas$/i, 'Aparatos y sistemas'));
    console.log(`${t()} checklists llenados — el médico sigue con Diagnóstico`);
    await humanPause(page, 3000, 6000);
    await fillDiagnosticoSection(page);
    console.log(`${t()} registerAnswers hasta ahora: ${calls.length}`);

    const A = await leerEstado('A) ANTES de "Guardar cambios" (solo autoguardado)', resultados);
    await humanPause(page, 8000, 15000); // el médico revisa antes de guardar
    await guardarCambiosGlobal(page);
    await page.waitForTimeout(6000);
    console.log(`${t()} registerAnswers tras "Guardar cambios": total ${calls.length}`);
    const B = await leerEstado('B) DESPUÉS de "Guardar cambios", antes de Finalizar', resultados);

    const finalizarBtn = await waitForFinalizarButton(page);
    const respFin = page.waitForResponse(r => r.url().includes('/api/consultations/finishConsultation'), { timeout: 15000 });
    await finalizarBtn.click();
    expect((await respFin).status()).toBeLessThan(300);
    console.log(`${t()} Consulta finalizada`);
    await page.waitForTimeout(1000);
    const confirmBtn = page.locator('.swal2-confirm:visible, button:has-text("Aceptar"):visible, button:has-text("OK"):visible').first();
    if (await confirmBtn.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) await confirmBtn.click();
    await page.waitForTimeout(8000);
    const C = await leerEstado('C) 8 s DESPUÉS de Finalizar', resultados);
    await page.waitForTimeout(25000);
    const D = await leerEstado('D) ~35 s DESPUÉS de Finalizar', resultados);

    fs.writeFileSync(`${OUT}/resumen.json`, JSON.stringify({ paciente: PACIENTE, consultaId, registerAnswers: calls.map(c => ({ t: c.t, campos: c.campos })), A, B, C, D }, null, 1));
    console.log(`\n=== RESUMEN ${PACIENTE} === registerAnswers totales: ${calls.length} (${calls.map(c => c.t.trim() + ' campos=' + c.campos).join(' | ')})`);
    for (const [e, R] of [['A', A], ['B', B], ['C', C], ['D', D]]) {
      console.log(`  ${e}: ` + Object.entries(R).map(([k, v]) => v.error ? `${k}=ERROR` : `${k}=${v.ok}/${v.de}`).join('  '));
    }
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
