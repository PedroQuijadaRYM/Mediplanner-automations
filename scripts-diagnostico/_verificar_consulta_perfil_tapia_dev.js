const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
require('dotenv').config({ path: '.env' });
const { auditarPantalla } = require('../e2e/auditoria.js');
const D = require('../e2e/consulta/datos.js');

// Solo lectura. Camino 2 (CLAUDE.md §0.3): perfil → Consultas → consulta de la
// corrida → sub-pestañas, contra el manifiesto de datos.js. Sin catch silenciosos.
const NOMBRE = process.env.PACIENTE_NOMBRE || 'Agustin Tapia Nievas';
const BUSQUEDA = process.env.PACIENTE_BUSQUEDA || 'Tapia';
const OUT = 'logs/tapia-perfil';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const context = await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base });
  const page = await context.newPage();
  const errores = [];
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) errores.push(`${r.status()} ${r.url().split('/api/')[1]}`); });
  const resultados = [];
  const check = (etiqueta, ok) => { resultados.push({ etiqueta, ok }); console.log(`${ok ? '✅' : '❌'} ${etiqueta}`); };

  try {
    await page.goto('/Pacientes');
    await expect(page.locator('.rdt_TableRow').first()).toBeVisible({ timeout: 20000 });
    await page.locator('input[placeholder*="Buscar" i]').first().fill(BUSQUEDA);
    await page.waitForTimeout(3000);
    await page.locator('.rdt_TableRow', { hasText: new RegExp(NOMBRE, 'i') }).first().locator('span.font-semibold').click();
    await expect(page.getByRole('button', { name: 'Información' })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).toContainText(new RegExp(NOMBRE, 'i'), { timeout: 20000 });
    await page.waitForTimeout(3000);

    // Cabecera: "Datos de última consulta" debe reflejar los signos vitales de la corrida.
    const cab = await auditarPantalla(page, 'perfil — cabecera', { maxWaitMs: 20000 });
    const t0 = cab.textoCompleto;
    console.log('CABECERA:', t0.split('\n').filter(Boolean).slice(8, 30).join(' | '));
    check(`cabecera peso ${D.MEDIDAS.peso}kg`, new RegExp(`${D.MEDIDAS.peso}\s*kg`, 'i').test(t0.replace(/\n/g, '')));
    check(`cabecera talla ${D.MEDIDAS.talla}cm`, new RegExp(`${D.MEDIDAS.talla}\s*cm`, 'i').test(t0.replace(/\n/g, '')));
    check('cabecera FC 80', /80\s*lpm/i.test(t0.replace(/\n/g, '')));
    check('cabecera FR 18', /18\s*rpm/i.test(t0.replace(/\n/g, '')));
    check('cabecera temperatura 36.8', /36\.8\s*°C/i.test(t0.replace(/\n/g, '')));

    await page.getByRole('button', { name: 'Consultas', exact: true }).click();
    await page.waitForTimeout(2500);
    await auditarPantalla(page, 'perfil — lista de consultas', { maxWaitMs: 20000 });
    const candidatas = page.getByText(/cefalea persistente/i);
    const n = await candidatas.count();
    console.log(`Consultas listadas con el motivo de la corrida en la 1ª página: ${n}`);
    await page.screenshot({ path: `${OUT}/lista.png`, fullPage: true });
    check('la consulta de la corrida aparece en la lista', n > 0);
    expect(n, 'No apareció la consulta en la lista de Consultas').toBeGreaterThan(0);
    await candidatas.first().click();
    await page.waitForTimeout(3000);

    const subs = ['General', 'Exploración', 'Diagnóstico', 'Tratamiento', 'Notas del Médico (Privado)'];
    const esperado = {
      'General': [D.TEXTO_MOTIVO, D.TEXTO_PADECIMIENTO, D.TEXTO_NOTAS_EVOLUCION, D.TEXTO_NOMBRE_REFERIDO, D.TEXTO_APARIENCIA],
      'Exploración': ['Cabeza', 'Cuello', 'Tórax', 'Abdomen', 'Columna vertebral', 'Miembros superiores', 'Genitales', 'Miembros inferiores', 'Articulado', 'Cardiovascular', 'Circulatorio', 'Digestivo', 'Endocrino', 'Respiratorio', 'sin alteraciones aparentes'],
      'Diagnóstico': [D.TEXTO_IMPRESION_DIAGNOSTICA, D.TEXTO_OBSERVACIONES_DIAGNOSTICO, 'K59', 'CONSTIPACI'],
      'Tratamiento': [D.TEXTO_INDICACIONES_LAB.slice(0, 20), 'Reposo relativo', 'Amoxicilina', 'Certificado', 'PERFIL', D.TEXTO_PROCEDIMIENTO],
      'Notas del Médico (Privado)': [D.TEXTO_NOTAS_MEDICO],
    };
    for (const s of subs) {
      // 'General' es la sub-pestaña activa por defecto al seleccionar la consulta; su
      // botón se repite a nivel paciente, así que NO se le hace clic (sacaría de la vista).
      if (s !== 'General') {
        const tab = page.getByText(s, { exact: true }).last();
        await expect(tab, `sub-pestaña "${s}" no visible`).toBeVisible({ timeout: 10000 });
        await tab.click();
        await page.waitForTimeout(2500);
      }
      const rep = await auditarPantalla(page, `consulta (perfil) — ${s}`, { maxWaitMs: 30000 });
      const texto = rep.textoCompleto;
      fs.writeFileSync(`${OUT}/${s.replace(/\W+/g, '-')}.txt`, texto);
      console.log(`\n===== [${s}] TEXTO COMPLETO =====\n${texto}\n`);
      check(`[${s}] sin "Cargando" pendiente`, rep.cargasPendientes.length === 0);
      for (const e of esperado[s]) check(`[${s}] contiene "${e.slice(0, 50)}"`, texto.toLowerCase().includes(e.toLowerCase()));
      await page.screenshot({ path: `${OUT}/${s.replace(/\W+/g, '-')}.png`, fullPage: true });
    }

    // Pestaña Percentil / otras a nivel paciente: volcado para revisar a ojo (no se asume nada).
    for (const p of ['Información']) {
      await page.getByRole('button', { name: p, exact: true }).click();
      await page.waitForTimeout(2000);
    }
  } finally {
    console.log('\n===== RESUMEN =====');
    resultados.filter(r => !r.ok).forEach(r => console.log('❌ ' + r.etiqueta));
    console.log(`${resultados.filter(r => r.ok).length}/${resultados.length} checks OK`);
    console.log('Errores API/consola:', JSON.stringify(errores));
    await browser.close();
  }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
