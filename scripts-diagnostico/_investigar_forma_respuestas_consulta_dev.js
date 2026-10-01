const { chromium } = require('@playwright/test');
require('dotenv').config({ path: '.env' });
// Solo lectura: forma cruda de getConsultation(diagnosticos/servicios), getTreatments y getConsultationProcedures.
const CONSULTA = parseInt(process.env.CONSULTA_ID, 10), PACIENTE = parseInt(process.env.PACIENTE_ID, 10);
(async () => {
  const browser = await chromium.launch({ headless: false, executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--start-maximized'] });
  const base = (process.env.BASE_URL || 'https://admin-dev.mediplanner.mx/').replace(/\/$/, '');
  const page = await (await browser.newContext({ storageState: 'storageState.json', viewport: null, baseURL: base })).newPage();
  let token = null;
  page.on('request', r => { const h = r.headers()['x-rym-token-app']; if (h && !token) token = h; });
  try {
    await page.goto('/Dashboard'); await page.waitForLoadState('load');
    for (let i = 0; i < 20 && !token; i++) await page.waitForTimeout(500);
    if (!token) throw new Error('no se capturó token');
    const call = async (e, extra = {}) => (await (await page.request.post(`/api/${e}`, { headers: { 'Content-Type': 'application/json', 'x-rym-token-app': token }, data: { paciente_id: PACIENTE, consulta_id: CONSULTA, ...extra } })).json());
    const c = await call('consultations/getConsultation');
    console.log('diagnosticos:', JSON.stringify(c.data.diagnosticos));
    console.log('servicios:', JSON.stringify(c.data.servicios));
    console.log('indicaciones_procedimiento:', JSON.stringify(c.data.indicaciones_procedimiento));
    console.log('indicaciones_general:', JSON.stringify(c.data.indicaciones_general));
    console.log('getTreatments:', JSON.stringify((await call('consultations/getTreatments')), null, 1));
    console.log('getConsultationProcedures:', JSON.stringify(await call('procedures/getConsultationProcedures')));
  } finally { await browser.close(); }
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
