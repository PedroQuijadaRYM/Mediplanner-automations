const { test, expect } = require('@playwright/test');
const { setupConsoleMonitor, auditarPantalla } = require('../e2e/utils.js');
const { opcional, reporteOpcionales } = require('../e2e/opcional.js');
const { pick } = require('../e2e/consulta/util.js');
const {
  DATOS_CLINICOS,
  TEXTO_MOTIVO,
  TEXTO_PADECIMIENTO,
  TEXTO_NOTAS_EVOLUCION,
  TEXTO_NOMBRE_REFERIDO,
  TEXTO_APARIENCIA,
  TEXTO_IMPRESION_DIAGNOSTICA,
  TEXTO_OBSERVACIONES_DIAGNOSTICO,
  TEXTO_INDICACIONES_LAB,
  TEXTO_PROCEDIMIENTO,
  TEXTO_NOTAS_MEDICO,
  PACIENTE_NOMBRE,
  PERCENTIL_RUN,
  MEDIDAS,
} = require('../e2e/consulta/datos.js');
const { iniciarConsultaDelPaciente } = require('../e2e/consulta/navegacion.js');
const {
  fillPerimetroCefalico,
  fillGeneralSection,
  fillApenrienciaGeneralSection,
  fillChecklistSection,
  fillDiagnosticoSection,
  fillTratamientoSection,
  fillLaboratoriosSection,
  fillNotasMedicoSection,
  fillServiciosSection,
} = require('../e2e/consulta/secciones.js');
const { guardarCambiosGlobal, waitForFinalizarButton } = require('../e2e/consulta/guardado.js');

// ─────────────────────────────────────────────────────────────────────────
// Backup de la versión anterior (modelo de pestañas): consultation.full-flow.spec.js.backup
// ─────────────────────────────────────────────────────────────────────────

// Test principal
test('Start a scheduled consultation from Inicio', async ({ page }) => {
  test.setTimeout(480000); // 8 minutos — margen para los reintentos reales (no rushed) de getFilledForm post-Finalizar (hasta ~130s c/u, 2 secciones)

  const monitor = setupConsoleMonitor(page);
  console.log('🔍 [MONITOR] DevTools monitor activo — capturando consola y red...\n');

  console.log(`🎯 Paciente objetivo: "${PACIENTE_NOMBRE}" — set #${PERCENTIL_RUN} (peso=${MEDIDAS.peso} talla=${MEDIDAS.talla} perímetro=${MEDIDAS.perimetro})`);

  // Token + doctor_id: necesarios para leer datos guardados vía API en la
  // verificación post-Finalizar (getFilledForm responde 200 con el
  // formulario VACÍO en blanco, sin avisar, si falta doctor_id — ver
  // CONTEXTO.md "riesgo de falso negativo al verificar").
  //
  // Se registran ANTES de iniciarConsultaDelPaciente() (no después, como
  // estaba) — hallazgo real de la corrida de verificación de la Etapa 2
  // (2026-09-17): `/api/profile/getProfile` solo se dispara durante la carga
  // del Dashboard (dentro de iniciarConsultaDelPaciente), nunca durante la
  // carga de la página de Consulta. Con el listener registrado después de
  // ambas, doctorId quedaba SIEMPRE null — precondición endurecida más abajo
  // que antes fallaba el 100% de las corridas reales, no solo en teoría.
  let capturedToken = null;
  let doctorId = null;
  page.on('request', (req) => {
    if (req.url().includes('/api/') && !capturedToken) {
      const h = req.headers();
      if (h['x-rym-token-app']) capturedToken = h['x-rym-token-app'];
    }
  });
  page.on('response', async (r) => {
    if (r.url().includes('/api/profile/getProfile')) {
      // Precondición, no opcional (Etapa 2): un listener de evento no puede
      // "reventar el test" directamente, pero silenciar el fallo acá es
      // exactamente el riesgo que el comentario de arriba documenta
      // (getFilledForm 200 en blanco sin avisar si falta doctor_id) — como
      // mínimo debe quedar loguido fuerte, y el guard de más abajo (antes de
      // usar doctorId) es la aserción real.
      try {
        const body = await r.json();
        if (body?.data?.id) doctorId = body.data.id;
      } catch (e) {
        console.log(`⚠️ getProfile: no se pudo parsear la respuesta para capturar doctor_id: ${e.message}`);
      }
    }
  });

  await test.step('Iniciar consulta y signos vitales', async () => {
    await iniciarConsultaDelPaciente(page);

    const signosButton = page.getByRole('button', { name: /capturar signos vitales/i });
    await expect(signosButton).toBeVisible({ timeout: 10000 });
    await signosButton.click();

    console.log('💉 Llenando signos vitales...');
    await page.waitForTimeout(1000);

    const sv = DATOS_CLINICOS.signosVitales;
    const svPeso = MEDIDAS.peso;
    const svTalla = MEDIDAS.talla;
    const svPresion = pick(sv.presiones);
    const svTemp = pick(sv.temperaturas);
    const svFC = pick(sv.frecuenciasCardiacas);
    const svSat = pick(sv.saturaciones);
    const svFR = pick(sv.frecuenciasRespiratorias);
    const svGlucosa = pick(sv.glucosas);
    console.log(`💉 Signos vitales [set #${PERCENTIL_RUN}]: peso=${svPeso} talla=${svTalla} perímetro=${MEDIDAS.perimetro} PA=${svPresion} temp=${svTemp} FC=${svFC} sat=${svSat} FR=${svFR} glucosa=${svGlucosa}`);

    await page.locator('input[name="peso"]').fill(svPeso);
    const tallaInput = page.locator('input[name*="talla" i]');
    if (await tallaInput.count() > 0) await tallaInput.first().fill(svTalla);
    await fillPerimetroCefalico(page, MEDIDAS.perimetro);
    const presionInput = page.locator('input[placeholder="000/000 mmHg"]');
    // Etapa 2 (hueco de cobertura, prioridad baja): sin log antes; signos
    // vitales se verifica solo por el status 2xx de registerVitalSigns, no
    // campo por campo.
    if (await opcional(presionInput.isVisible(), 'signos-vitales:presion-input-visible')) {
      await presionInput.fill(svPresion);
    } else {
      console.log('⚠️ No se encontró el campo de presión arterial en signos vitales');
    }
    const tempInput = page.locator('input[name*="temp" i]');
    if (await tempInput.count() > 0) await tempInput.first().fill(svTemp);
    const fcInput = page.locator('input[name*="card" i]');
    if (await fcInput.count() > 0) await fcInput.first().fill(svFC);
    const satInput = page.locator('input[name="oxigenacion"]');
    if (await satInput.count() > 0) await satInput.first().fill(svSat);
    // OJO: el name real es snake_case ("frecuencia_respiratoria"), no camelCase
    // — confirmado en vivo 2026-09-10 (el selector viejo dejaba este campo
    // vacío en silencio, y como es obligatorio, "Guardar" nunca se habilitaba).
    const frInput = page.locator('input[name="frecuencia_respiratoria"]');
    if (await frInput.count() > 0) await frInput.first().fill(svFR);
    const glucosaInput = page.locator('input[name="glucosa"]');
    if (await glucosaInput.count() > 0) await glucosaInput.first().fill(svGlucosa);

    await page.waitForTimeout(1500);
    await page.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim().toLowerCase() === 'guardar');
      return btn && !btn.disabled;
    }, { timeout: 10000 });

    const respPromise = opcional(page.waitForResponse(r => r.url().includes('/api/consultations/registerVitalSigns'), { timeout: 15000 }), 'signos-vitales:espera-response-registervitalsigns');
    await page.getByRole('button', { name: /^Guardar$/i }).click();
    const resp = await respPromise;
    expect(resp?.status(), 'registerVitalSigns debe responder 2xx').toBeLessThan(300);
    console.log('✅ Signos vitales guardados');

    await page.waitForTimeout(1000);
    const cerrarButton = page.getByRole('button', { name: /cerrar/i });
    if (await opcional(cerrarButton.isVisible(), 'signos-vitales:boton-cerrar-visible')) {
      await cerrarButton.click();
      await page.waitForTimeout(1000);
    }
  });

  await test.step('Cargar página de consulta (Modo Completo)', async () => {
    console.log('🔄 Esperando redirección...');
    try {
      await page.waitForURL(/Consulta\/(ConsultaGeneral|ConsultaDetalles)/, { timeout: 15000 });
      console.log('✅ Redirigido a página de consulta');
    } catch (e) {
      console.log('⚠️ Timeout, navegando manualmente...');
      await page.goto('/Consulta/ConsultaGeneral');
      // Precondición, no opcional (Etapa 2): es la ruta de recuperación tras
      // el primer intento fallido — si esta segunda carga tampoco resuelve,
      // no hay ninguna otra confirmación de que se llegó a la consulta antes
      // de empezar a llenar secciones.
      await page.waitForLoadState('load');
    }

    console.log('⏳ Esperando carga completa de la consulta...');
    // 2026-09-10: este chequeo (solo "Cargando información de consulta" +
    // catch mudo) dejaba pasar un SEGUNDO overlay independiente
    // ("Recuperando datos del paciente...") — confirmado con una repro real
    // que llenaba "General" mientras ese overlay seguía activo: al terminar
    // el fetch de fondo, los campos quedaban vacíos, sin que este wait lo
    // hubiera detectado (ver CONTEXTO.md, hallazgo de "General" vaciado).
    // auditarPantalla() espera de forma realista a que CUALQUIER texto de
    // carga conocido desaparezca (ya generalizado en e2e/utils.js) en vez de
    // perseguir un único string exacto con un catch que traga el timeout.
    await auditarPantalla(page, 'Consulta recién cargada, antes de llenar General', { maxWaitMs: 30000 });
    await page.waitForTimeout(1000);
  });

  let serviciosSinOpciones = false;
  // Lo que cada fill*Section eligió/llenó, para comparar con lo guardado tras Finalizar.
  let elegidoDiagnostico = {}, elegidoTratamiento = {}, elegidoLaboratorios = {}, servicioElegido = null;
  let resultadoExploracion = null;
  let resultadoAparatos = null;

  await test.step('Llenar todas las secciones (ya visibles, sin pestañas)', async () => {
    await fillGeneralSection(page);
    await fillApenrienciaGeneralSection(page);
    // OJO (2026-09-10): el <h3> real dice "Exploración segmentaría" (con
    // acento en la "í" — typo real de la app, confirmado con un recon que
    // volcó page.getByRole('heading', {level:3}).allTextContents()), no
    // "segmentaria" como asumía este regex. Por eso NUNCA matcheaba (ni con
    // el fix previo del espacio final, que no era la causa real) y
    // sectionContainer caía siempre al fallback de página completa —
    // haciendo que fillChecklistSection escribiera sus "Observaciones" en
    // los primeros <textarea> de TODA la página (los de "General"/
    // "Apariencia general"), pisándolos con texto de checklist. Se usa un
    // regex que matchea el prefijo estable en vez de depender de una vocal
    // acentuada que la propia app podría corregir o volver a cambiar.
    resultadoExploracion = await fillChecklistSection(page, /^Exploración segmentar[ií]a\s*$/i, 'Exploración segmentaria');
    resultadoAparatos = await fillChecklistSection(page, /^Aparatos y sistemas$/i, 'Aparatos y sistemas');
    // Hallazgo G: en cuanto terminan los checklists se pulsa "Guardar cambios" (sin llenar
    // nada más antes) y se espera a que termine; recién después sigue el resto de la consulta.
    console.log('💾 Checklists terminados — guardando de inmediato antes de seguir con la consulta...');
    await guardarCambiosGlobal(page);
    elegidoDiagnostico = await fillDiagnosticoSection(page);
    elegidoTratamiento = await fillTratamientoSection(page);
    elegidoLaboratorios = await fillLaboratoriosSection(page);
    await fillNotasMedicoSection(page);
    const { sinOpcionesDisponibles, servicio } = await fillServiciosSection(page);
    serviciosSinOpciones = sinOpcionesDisponibles;
    servicioElegido = servicio;
  });

  await test.step('Guardar cambios (global)', async () => {
    await guardarCambiosGlobal(page);
  });

  let consultaId = null;
  let pacienteId = null;

  await test.step('Finalizar consulta', async () => {
    console.log('\n🏁 === INICIANDO FINALIZACIÓN DE CONSULTA ===');
    const finalizarBtn = await waitForFinalizarButton(page);
    const reqPromise = opcional(page.waitForRequest(r => r.url().includes('/api/consultations/finishConsultation'), { timeout: 15000 }), 'finalizar:espera-request-finishconsultation');
    // Precondición, no opcional (Etapa 2): a diferencia del request (arriba,
    // solo se usa para loguear el payload), esta respuesta es la única
    // confirmación real de que Finalizar completó. Antes, si nunca se
    // detectaba, el test solo logueaba "revisar manualmente" y seguía en
    // verde — exactamente el patrón que CLAUDE.md §0.4 prohíbe.
    const respPromise = page.waitForResponse(r => r.url().includes('/api/consultations/finishConsultation'), { timeout: 15000 });
    await finalizarBtn.click();
    const [req, resp] = await Promise.all([reqPromise, respPromise]);
    if (req) {
      const body = JSON.parse(req.postData() || '{}');
      consultaId = body.consulta_id ?? body.id ?? null;
      pacienteId = body.paciente_id ?? null;
      console.log(`ℹ️ finishConsultation body → consulta_id=${consultaId} paciente_id=${pacienteId}`);
    }
    expect(resp.status(), 'finishConsultation debe responder 2xx').toBeLessThan(300);
    console.log('✅ Consulta finalizada');
    await page.waitForTimeout(1000);
    const confirmBtn = page.locator('.swal2-confirm:visible, button:has-text("Aceptar"):visible, button:has-text("OK"):visible').first();
    // isVisible({timeout}) no espera de verdad (confirmado en vivo, Etapa 5)
    // — el swal de confirmación aparece como resultado de Finalizar y puede
    // tardar más que un instante en renderizar.
    if (await opcional(confirmBtn.waitFor({ state: 'visible', timeout: 3000 }).then(() => true), 'finalizar:boton-confirmacion-visible')) {
      await confirmBtn.click();
      console.log('✅ Confirmación clickeada');
    }
  });

  const inconsistencias = [];
  const advertenciasNoBloqueantes = [];

  await test.step('Verificar datos guardados (recon post-Finalizar, misma consulta, antes de salir)', async () => {
    console.log('\n🔎 === VERIFICANDO QUE LO LLENADO SIGUE GUARDADO Y ES CORRECTO ===');
    if (!consultaId || !pacienteId || !capturedToken || !doctorId) {
      // doctorId sumado al guard (Etapa 2, precondición): sin él,
      // getFilledForm responde 200 con el formulario vacío SIN avisar (ver
      // comentario más arriba) — mejor fallar acá con la causa real que
      // dejar que se lea como "todo quedó en blanco" más abajo.
      inconsistencias.push(`No se pudo verificar: faltan datos para llamar a la API (consultaId=${consultaId}, pacienteId=${pacienteId}, token=${capturedToken ? 'OK' : 'FALTA'}, doctorId=${doctorId ?? 'FALTA'})`);
      console.log(`⚠️ ${inconsistencias[0]}`);
      return;
    }

    // Justo tras "Finalizar"+"Confirmación" la página dispara su propia
    // ráfaga de refetch (Expediente, historial, etc.) — confirmado en vivo
    // (2026-07-28): llamar a la API en ese mismo instante puede recibir un
    // 404 transitorio en getFilledForm ("No se encontró el formulario
    // asignado al paciente") aunque el dato SÍ esté guardado (una llamada
    // idéntica un instante después responde 200 con el valor correcto). Se
    // espera a que esa ráfaga se asiente y se reintenta una vez ante error.
    await page.waitForTimeout(6000);

    // OJO: usar page.request (HTTP directo, fuera del JS de la página) en vez
    // de page.evaluate(fetch(...)) — confirmado en vivo (2026-07-28): pedir
    // getFilledForm vía fetch() DESDE la misma pestaña que acaba de finalizar
    // devolvía el ítem en 0 (plantilla en blanco) de forma persistente (ni 4
    // reintentos con espera, ni `cache:'no-store'`, lo arreglaban), mientras
    // que la MISMA llamada desde una pestaña nueva sí traía el valor real.
    // Apunta a algo a nivel de la app en esa pestaña (interceptor de fetch,
    // estado en memoria) — no a caché HTTP del navegador. page.request evita
    // ese código de la página por completo.
    const fetchApi = async (endpoint, body, { retries = 2 } = {}) => {
      for (let intento = 0; intento <= retries; intento++) {
        const resp = await page.request.post(`/api/${endpoint}`, {
          headers: { 'Content-Type': 'application/json', 'x-rym-token-app': capturedToken },
          data: body,
        });
        const result = await opcional(resp.json(), `fetchApi:${endpoint}-response-json`);
        if (result?.status === 'OK') return result;
        if (intento < retries) {
          console.log(`⚠️ ${endpoint} respondió "${result?.status}" (${result?.message || ''}) — reintentando...`);
          await page.waitForTimeout(2500);
        } else {
          return result;
        }
      }
    };

    // Comparación de nombres de ítem tolerante a acentos — la API devuelve
    // "Torax" sin tilde mientras la UI muestra "Tórax" con tilde.
    const DIACRITICOS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
    const sinAcentos = (s) => (s || '').normalize('NFD').replace(DIACRITICOS_RE, '').toLowerCase().trim();

    const detalle = await fetchApi('consultations/getConsultation', { paciente_id: pacienteId, consulta_id: consultaId });
    const d = detalle?.data || {};
    console.log(`Estatus de la consulta reabierta: "${d.estatus}"`);

    const chequear = (campo, esperado, real) => {
      const ok = (real || '').trim() === esperado;
      if (!ok) inconsistencias.push(`${campo}: esperado "${esperado}" — real "${real}"`);
      console.log(`  ${ok ? '✅' : '❌'} ${campo}: "${(real || '').substring(0, 60)}"`);
    };
    chequear('motivo', TEXTO_MOTIVO, d.motivo);
    chequear('padecimiento', TEXTO_PADECIMIENTO, d.padecimiento);
    chequear('notas_evolucion', TEXTO_NOTAS_EVOLUCION, d.notas_evolucion);
    chequear('nombre_referido', TEXTO_NOMBRE_REFERIDO, d.nombre_referido);
    chequear('apariencia', TEXTO_APARIENCIA, d.apariencia);
    chequear('impresion_diagnostico', TEXTO_IMPRESION_DIAGNOSTICA, d.impresion_diagnostico);
    // 2026-10-01: "Observaciones del diagnóstico" se llenaba sin verificación
    // alguna, y resultó que el test escribía en el combobox de CIE-10 (había
    // que activar el interruptor "Agregar observaciones"). Ver
    // docs/historial/2026-10-01-hallazgo-e-observaciones-dx.md.
    chequear('nota_diagnostico (Observaciones del diagnóstico)', TEXTO_OBSERVACIONES_DIAGNOSTICO, d.nota_diagnostico);

    // indicaciones_general/indicaciones_procedimiento usan un texto elegido al
    // azar de una lista (no un literal fijo) — se verifica que no quedaron
    // vacías, no el texto exacto.
    if (!(d.indicaciones_general || '').trim()) inconsistencias.push('indicaciones_general (Tratamiento): quedó vacío tras finalizar');
    console.log(`  ${(d.indicaciones_general || '').trim() ? '✅' : '❌'} indicaciones_general: "${(d.indicaciones_general || '').substring(0, 60)}"`);
    if (!(d.indicaciones_procedimiento || '').trim()) inconsistencias.push('indicaciones_procedimiento (Laboratorios): quedó vacío tras finalizar');
    console.log(`  ${(d.indicaciones_procedimiento || '').trim() ? '✅' : '❌'} indicaciones_procedimiento: "${(d.indicaciones_procedimiento || '').substring(0, 60)}"`);

    if (!Array.isArray(d.diagnosticos) || d.diagnosticos.length === 0) inconsistencias.push('diagnosticos: quedó vacío tras finalizar');
    console.log(`  ${Array.isArray(d.diagnosticos) && d.diagnosticos.length > 0 ? '✅' : '❌'} diagnosticos: ${d.diagnosticos?.length ?? 0} elemento(s)`);
    if (!Array.isArray(d.servicios) || d.servicios.length === 0) inconsistencias.push('servicios: quedó vacío tras finalizar');
    console.log(`  ${Array.isArray(d.servicios) && d.servicios.length > 0 ? '✅' : '❌'} servicios: ${d.servicios?.length ?? 0} elemento(s)`);

    // 2026-10-01: comparar lo ELEGIDO contra lo guardado (antes solo se contaba).
    // Los nombres de la UI traen extras (código CIE, precio, principio activo,
    // laboratorio), por eso se compara por "el texto de la UI contiene el
    // nombre guardado", tolerante a acentos/espacios/mayúsculas.
    const norm = (t) => sinAcentos(t).replace(/\s+/g, ' ');
    const contiene = (textoUI, nombreApi) => !!nombreApi && norm(textoUI).includes(norm(nombreApi));
    const verificar = (etiqueta, ok, detalle) => {
      if (!ok) inconsistencias.push(`${etiqueta}: ${detalle}`);
      console.log(`  ${ok ? '✅' : '❌'} ${etiqueta}${ok ? '' : ' — ' + detalle}`);
    };
    if (elegidoDiagnostico.cie10) {
      const guardados = (d.diagnosticos || []).map(x => x.nombre);
      verificar('diagnóstico CIE-10 (código elegido)', guardados.some(n => contiene(elegidoDiagnostico.cie10, n)), `se eligió "${elegidoDiagnostico.cie10}", guardado: ${JSON.stringify(guardados)}`);
    } else {
      verificar('diagnóstico CIE-10 (código elegido)', false, 'el llenado no registró ninguna opción elegida');
    }
    if (servicioElegido) {
      const guardados = (d.servicios || []).map(x => x.nombre);
      verificar('servicio (el elegido)', guardados.some(n => contiene(servicioElegido, n)), `se eligió "${servicioElegido}", guardado: ${JSON.stringify(guardados)}`);
    }
    // Indicaciones: texto exacto (el editor Jodit lo envuelve en <p>).
    const sinTags = (h) => (h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (elegidoTratamiento.indicacionesGenerales) {
      verificar('indicaciones_general (texto exacto)', sinTags(d.indicaciones_general) === elegidoTratamiento.indicacionesGenerales, `esperado "${elegidoTratamiento.indicacionesGenerales}" — real "${sinTags(d.indicaciones_general)}"`);
    }
    verificar('indicaciones_procedimiento (texto exacto)', sinTags(d.indicaciones_procedimiento) === TEXTO_INDICACIONES_LAB, `esperado "${TEXTO_INDICACIONES_LAB}" — real "${sinTags(d.indicaciones_procedimiento)}"`);
    if (d.estatus_id !== 4 && !/terminada/i.test(d.estatus || '')) inconsistencias.push(`estatus: esperaba "Terminada" tras Finalizar, quedó "${d.estatus}"`);

    const treatments = await fetchApi('consultations/getTreatments', { paciente_id: pacienteId, consulta_id: consultaId });
    const numMedicamentos = (treatments?.data || []).length;
    if (numMedicamentos === 0) inconsistencias.push('getTreatments: 0 medicamentos guardados');
    console.log(`  ${numMedicamentos > 0 ? '✅' : '❌'} medicamentos guardados: ${numMedicamentos}`);

    // Medicamento del catálogo: nombre + los 7 campos del formulario, y "Otros
    // medicamentos" (medicamento_id 0). Antes solo se contaba (hueco de cobertura).
    const listaTrat = treatments?.data || [];
    const delCatalogo = listaTrat.find(t => t.medicamento_id && t.medicamento_id !== 0);
    const libre = listaTrat.find(t => !t.medicamento_id);
    const mf = elegidoTratamiento.medForm;
    if (elegidoTratamiento.medicamento && mf) {
      verificar('medicamento (el elegido)', !!delCatalogo && contiene(elegidoTratamiento.medicamento, delCatalogo.medicamento_nombre), `se eligió "${elegidoTratamiento.medicamento}", guardado: ${JSON.stringify(delCatalogo?.medicamento_nombre)}`);
      if (delCatalogo) {
        const numEq = (campo, esperado, real) => verificar(`medicamento · ${campo}`, mf[campo] !== null && Number(esperado) === Number(real), `esperado "${esperado}" — guardado "${real}"`);
        numEq('dosis', mf.dosis, delCatalogo.dosis_cantidad);
        numEq('frecuencia', mf.frecuencia, delCatalogo.frecuencia_cantidad);
        numEq('duracion', mf.duracion, delCatalogo.tiempo_cantidad);
        verificar('medicamento · indicaciones', mf.indicaciones === delCatalogo.indicaciones, `esperado "${mf.indicaciones}" — guardado "${delCatalogo.indicaciones}"`);
        verificar('medicamento · vía de administración', contiene(mf.via, delCatalogo.administracion_nombre), `UI "${mf.via}" — guardado "${delCatalogo.administracion_nombre}"`);
        verificar('medicamento · unidad de dosis', contiene(mf.unidadDosis, delCatalogo.unidad_dosis_nombre), `UI "${mf.unidadDosis}" — guardado "${delCatalogo.unidad_dosis_nombre}"`);
        verificar('medicamento · unidad de tiempo', contiene(mf.unidadTiempo, delCatalogo.unidad_tiempo_nombre), `UI "${mf.unidadTiempo}" — guardado "${delCatalogo.unidad_tiempo_nombre}"`);
      }
    } else {
      verificar('medicamento (el elegido)', false, 'el llenado no registró medicamento elegido ni valores del formulario');
    }
    if (elegidoTratamiento.otros?.completo) {
      verificar('"Otros medicamentos" (nombre e indicaciones)', !!libre && libre.medicamento_nombre === elegidoTratamiento.otros.nombre && libre.indicaciones === elegidoTratamiento.otros.indicaciones, `esperado ${JSON.stringify(elegidoTratamiento.otros)} — guardado ${JSON.stringify(libre && { nombre: libre.medicamento_nombre, indicaciones: libre.indicaciones })}`);
    } else {
      verificar('"Otros medicamentos"', false, 'el llenado quedó incompleto o no se registró');
    }

    // Etapa 2 (cierra 2 de los 6 huecos de cobertura, 2026-09-17): Laboratorios
    // (selección + campo "procedimiento") y Notas del Médico no tenían NINGUNA
    // verificación tras Finalizar. Endpoints confirmados en vivo (misma forma
    // que usa la propia app tras Finalizar, ver consultation.full-flow):
    // getConsultationProcedures trae {nombre, indicaciones} por procedimiento
    // agregado; getNotes trae {texto} con la nota (envuelta en <p> por el
    // editor jodit, por eso se verifica no-vacío y no texto exacto, igual que
    // indicaciones_general/indicaciones_procedimiento arriba).
    const procedimientos = await fetchApi('procedures/getConsultationProcedures', { paciente_id: pacienteId, consulta_id: consultaId });
    const listaProcedimientos = procedimientos?.data || [];
    if (listaProcedimientos.length === 0) inconsistencias.push('getConsultationProcedures: 0 procedimientos/laboratorios guardados (Laboratorios y Procedimientos)');
    console.log(`  ${listaProcedimientos.length > 0 ? '✅' : '❌'} laboratorios/procedimientos guardados: ${listaProcedimientos.length}`);
    if (elegidoLaboratorios.laboratorio) {
      verificar('laboratorio (el elegido)', listaProcedimientos.some(p => contiene(elegidoLaboratorios.laboratorio, p.nombre)), `se eligió "${elegidoLaboratorios.laboratorio}", guardado: ${JSON.stringify(listaProcedimientos.map(p => p.nombre))}`);
    } else {
      verificar('laboratorio (el elegido)', false, 'el llenado no registró laboratorio elegido');
    }
    if (listaProcedimientos.length > 0 && !listaProcedimientos.some(p => (p.indicaciones || '').includes(TEXTO_PROCEDIMIENTO))) {
      inconsistencias.push(`getConsultationProcedures: ningún procedimiento tiene el texto esperado ("${TEXTO_PROCEDIMIENTO}")`);
    }

    // A diferencia de getConsultationProcedures, getNotes exige doctor_id
    // (confirmado en vivo 2026-09-17: "El campo doctor_id es requerido" sin
    // él) — mismo dato ya capturado para getFilledForm más abajo.
    const notas = await fetchApi('consultations/getNotes', { paciente_id: pacienteId, consulta_id: consultaId, doctor_id: doctorId });
    const notaGuardada = (notas?.data || []).some(n => (n.texto || '').includes(TEXTO_NOTAS_MEDICO));
    if (!notaGuardada) inconsistencias.push('getNotes: no se encontró la nota del médico esperada tras finalizar');
    console.log(`  ${notaGuardada ? '✅' : '❌'} notas_medico: ${notaGuardada ? 'encontrada' : 'NO encontrada'}`);

    // Checklists (Exploración segmentaria / Aparatos y sistemas): comparar
    // Normal/Anormal + Observaciones EXACTOS contra lo que el llenado dejó
    // como esperado por ítem — esto es lo que puntualmente falló antes de
    // agregar esta verificación (quedaban ítems sin Normal/Anormal pese a
    // que la UI mostraba el checkbox marcado).
    const forms = await fetchApi('consultations/getForms', { paciente_id: pacienteId, consulta_id: consultaId });
    for (const [nombreLog, resultado, formNameMatch] of [
      ['Exploración segmentaria', resultadoExploracion, (n) => n.toLowerCase().includes('exploracion')],
      ['Aparatos y sistemas', resultadoAparatos, (n) => n.toLowerCase().includes('aparatos')],
    ]) {
      const formInfo = (forms?.data || []).find(f => formNameMatch(f.nombre.toLowerCase()));
      if (!formInfo || !resultado || resultado.items.length === 0) {
        inconsistencias.push(`${nombreLog}: no se pudo verificar (form no encontrado o sin ítems llenados) — forms.data tenía ${forms?.data?.length ?? 'null'} formularios`);
        continue;
      }
      // getFilledForm justo después de Finalizar puede devolver el formulario
      // con TODOS los valores en 0/vacío (plantilla en blanco) durante un
      // rato — una sesión anterior (2026-07-28) asumió que era "retraso de
      // propagación del backend, no pérdida de datos" SIN esperar lo
      // suficiente para comprobarlo dentro del propio test, y silenció el
      // caso como advertencia no bloqueante. Eso es exactamente la
      // racionalización que CLAUDE.md §0.4 prohíbe: ninguna anomalía se
      // descarta sin evidencia de ESA corrida.
      //
      // Investigado a fondo el 2026-07-30 (`_investigar_getfilledform_blanco_dev.js`,
      // monitoreo real de 5 minutos sobre una consulta real): con 65s de
      // reintentos TODAVÍA estaba en blanco, pero ya había resuelto para
      // cuando se volvió a chequear ~20-40s más tarde (es decir, en algún
      // punto entre 65s y ~100s tras Finalizar) y se mantuvo resuelto de
      // forma estable el resto de los 5 minutos monitoreados. Confirma que
      // SÍ es un retraso de propagación transitorio (no pérdida de datos),
      // pero más largo de lo que se había probado antes — la hipótesis
      // vieja era correcta en el fondo, solo que nunca se había verificado
      // con evidencia real. Se sube el margen de reintentos a ~130s con
      // confianza (holgura sobre el ~100s observado), en vez de asumir un
      // número arbitrario otra vez.
      let filled = await fetchApi('patients/getFilledForm', { paciente_id: pacienteId, relacion_id: formInfo.relacion_id, consulta_id: consultaId, doctor_id: doctorId });
      let elementos = filled?.data?.grupos?.[0]?.elementos || [];
      let siguesEnBlanco = resultado.items[0]?.valorEsperado !== null && elementos[1]?.valor === 0;
      const esperasReintentoMs = [10000, 15000, 20000, 25000, 30000, 30000]; // ~130s total — holgura real sobre el ~100s observado en vivo
      let intentoBlanco = 0;
      while (siguesEnBlanco && intentoBlanco < esperasReintentoMs.length) {
        const espera = esperasReintentoMs[intentoBlanco];
        console.log(`  ⏳ ${nombreLog}: getFilledForm en blanco, esperando ${espera}ms antes de reintentar (intento ${intentoBlanco + 1}/${esperasReintentoMs.length})...`);
        await page.waitForTimeout(espera);
        filled = await fetchApi('patients/getFilledForm', { paciente_id: pacienteId, relacion_id: formInfo.relacion_id, consulta_id: consultaId, doctor_id: doctorId });
        elementos = filled?.data?.grupos?.[0]?.elementos || [];
        siguesEnBlanco = resultado.items[0]?.valorEsperado !== null && elementos[1]?.valor === 0;
        intentoBlanco++;
      }
      if (siguesEnBlanco) {
        inconsistencias.push(`${nombreLog}: getFilledForm siguió devolviendo el formulario en blanco tras ${esperasReintentoMs.reduce((a, b) => a + b, 0)}ms de reintentos — no se pudo confirmar que el retraso sea transitorio en esta corrida.`);
        console.log(`❌ ${inconsistencias[inconsistencias.length - 1]}`);
        continue;
      }
      if (intentoBlanco > 0) {
        advertenciasNoBloqueantes.push(`${nombreLog}: getFilledForm tardó ${intentoBlanco} reintento(s) en dejar de estar en blanco tras Finalizar (confirmado con evidencia real de esta corrida, no asumido).`);
        console.log(`⚠️ ${advertenciasNoBloqueantes[advertenciasNoBloqueantes.length - 1]}`);
      }
      console.log(`  [diag] ${nombreLog}: relacion_id=${formInfo.relacion_id} filled.status=${filled?.status} elementos.length=${elementos.length}`);
      for (const [idx, item] of resultado.items.entries()) {
        // Comparación tolerante a acentos: la API devuelve "Torax" sin tilde
        // mientras la UI muestra "Tórax" con tilde — un match exacto fallaba.
        const elValor = elementos.find(e => sinAcentos(e.sTexto) === sinAcentos(item.nombre) && sinAcentos(e.sDescripcion) === sinAcentos(item.nombre));
        const elObs = elementos[elementos.findIndex(e => e === elValor) + 1];
        const valorReal = elValor?.valor;
        const obsReal = elObs?.sTexto === 'Observaciones' ? elObs.valor : undefined;
        if (idx === 0) {
          console.log(`  [diag] item0 comparación: valorReal=${JSON.stringify(valorReal)} (${typeof valorReal}) vs esperado=${JSON.stringify(item.valorEsperado)} (${typeof item.valorEsperado}) | obsReal=${JSON.stringify(obsReal)} vs esperado=${JSON.stringify(item.observacionEsperada)} | elValorEncontrado=${!!elValor}`);
        }
        if (item.valorEsperado !== null && Number(valorReal) !== Number(item.valorEsperado)) {
          inconsistencias.push(`${nombreLog} → "${item.nombre}": Normal/Anormal esperado=${item.valorEsperado} real=${valorReal}`);
        }
        if (item.observacionEsperada && String(obsReal).trim() !== String(item.observacionEsperada).trim()) {
          inconsistencias.push(`${nombreLog} → "${item.nombre}": Observaciones esperado="${item.observacionEsperada}" real="${obsReal}"`);
        }
      }
      const okItems = resultado.items.length - inconsistencias.filter(i => i.startsWith(nombreLog)).length;
      console.log(`  ${nombreLog}: ${okItems}/${resultado.items.length} ítems verificados correctos`);
    }

    if (inconsistencias.length > 0) {
      console.log(`\n🐛 ${inconsistencias.length} inconsistencia(s) encontradas tras Finalizar:`);
      inconsistencias.forEach(i => console.log(`   - ${i}`));
    } else {
      console.log('\n✅ Todo lo llenado sigue guardado y coincide exactamente tras Finalizar.');
    }
    if (advertenciasNoBloqueantes.length > 0) {
      console.log(`\n⚠️ ${advertenciasNoBloqueantes.length} advertencia(s) no bloqueante(s) (no cuentan como fallo del test):`);
      advertenciasNoBloqueantes.forEach(a => console.log(`   - ${a}`));
    }
  });

  console.log('\n🎉 === CONSULTA COMPLETADA EXITOSAMENTE ===');

  // Etapa 1 de docs/tarea-actual.md: volcar qué catch()es opcionales se
  // dispararon en esta corrida (y cuántas veces), para clasificarlos con
  // datos reales en la Etapa 2 — no a mano ni por intuición.
  const disparosOpcionales = reporteOpcionales();
  console.log(`\n📋 [OPCIONAL] ${disparosOpcionales.length} etiqueta(s) distinta(s) se dispararon en esta corrida:`);
  disparosOpcionales.forEach(([etiqueta, n]) => console.log(`   ${n}x — ${etiqueta}`));

  const result = monitor.printSummary();
  if (!result.passed) console.log(`⚠️ El test terminó con ${result.errors.length} error(es) y ${result.failedApiCalls.length} API call(s) fallida(s).`);

  expect(serviciosSinOpciones, '🐛 BUG: dropdown "Agregar servicios" sin opciones ("No se encontraron elementos")').toBe(false);
  expect(result.failedApiCalls.length, `No debe haber responses con error de API: ${JSON.stringify(result.failedApiCalls)}`).toBe(0);
  expect(inconsistencias, `Datos inconsistentes tras Finalizar:\n${inconsistencias.join('\n')}`).toEqual([]);
});
