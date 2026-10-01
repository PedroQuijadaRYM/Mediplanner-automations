const { expect } = require('@playwright/test');
const { handleModals } = require('../utils.js');
const { opcional } = require('../opcional.js');
const { sectionContainer } = require('./navegacion.js');
const { pick } = require('./util.js');
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
} = require('./datos.js');

// ─────────────────────────────────────────────────────────────────────────
// REESCRITO 2026-07-23 tras el rediseño de la pantalla de Consulta: pasó de
// pestañas clickeables (General | Exploración | Diagnóstico | Tratamiento |
// Notas del Médico | Servicios) a UNA SOLA PÁGINA scrolleable ("Modo
// Completo") con las 10 secciones visibles a la vez. Ya no hay pestaña que
// clickear ni "esperar networkidle" por sección (eso rompía el spec viejo:
// el click caía en un heading inerte y el networkidle nunca resolvía por los
// beacons de GA/Zendesk). Ver CONTEXTO.md → "🚨 Rediseño de la pantalla de
// Consulta" para el detalle completo de la investigación.
// ─────────────────────────────────────────────────────────────────────────

async function fillPerimetroCefalico(page, valor) {
  const perimetroInput = page.locator('input[name*="cefalic" i], input[name*="perimetro" i]').first();
  if (await perimetroInput.count() > 0 && await opcional(perimetroInput.isVisible(), 'signos-vitales:perimetro-cefalico-visible')) {
    await perimetroInput.fill(valor);
    console.log(`📏 Perímetro cefálico: ${valor}`);
  } else {
    // 2026-10-01 (Hallazgo F): antes decía "puede no aplicar". Confirmado en vivo
    // que el modal de signos vitales NO tiene campo de perímetro cefálico ni para
    // Percentil (3 años) ni para Tapia (27) — y el perfil de Percentil muestra
    // "PC —". Este valor NO se captura ni se guarda en este flujo.
    console.log('⚠️ [Hallazgo F] El modal de signos vitales no tiene campo de perímetro cefálico — el valor NO se captura (ver docs/hallazgos-abiertos.md).');
  }
}

// ── Secciones (todas operan dentro de su propio sectionContainer) ─────────

async function fillGeneralSection(page) {
  console.log('📋 Llenando sección General...');
  try {
    // OJO: es un <textarea>, no un <input> (a diferencia de otros campos con
    // name similar) — confirmado en vivo el 2026-07-23 tras encontrar que el
    // selector viejo (input[name=...]) nunca matcheaba y el campo se saltaba
    // en silencio (no fallaba, solo no se llenaba nunca).
    const motivoInput = page.locator('textarea[name="visitaPaciente"]');
    if (await opcional(motivoInput.isVisible(), 'general:motivo-visible')) {
      const cur = (await opcional(motivoInput.inputValue(), 'general:motivo-valor-actual')) ?? '';
      if (!cur.trim()) {
        await motivoInput.fill(TEXTO_MOTIVO);
        console.log('✅ Motivo de la consulta llenado');
      }
    } else {
      console.log('⚠️ No se encontró el campo "Motivo de consulta" (textarea[name="visitaPaciente"])');
    }
    const padecimientoTa = page.locator('textarea[placeholder="¿Qué síntomas señala o presenta el paciente?"]').first();
    if (await opcional(padecimientoTa.isVisible(), 'general:padecimiento-visible')) {
      await padecimientoTa.fill(TEXTO_PADECIMIENTO);
      console.log('✅ Padecimiento actual llenado');
    }
    const notasEvolucionTa = page.locator('textarea[placeholder="Notas de evolución"]').first();
    if (await opcional(notasEvolucionTa.isVisible(), 'general:notas-evolucion-visible')) {
      await notasEvolucionTa.fill(TEXTO_NOTAS_EVOLUCION);
      console.log('✅ Notas de evolución llenadas');
    }
    // 4º campo editable de General (antes se saltaba en silencio, dejando la
    // sección incompleta) — confirmado por captura real: input de texto con
    // placeholder "¿Quién refirió al paciente?".
    const nombreReferidoInput = page.locator('input[placeholder="¿Quién refirió al paciente?"], textarea[placeholder="¿Quién refirió al paciente?"]').first();
    if (await opcional(nombreReferidoInput.isVisible(), 'general:nombre-referido-visible')) {
      await nombreReferidoInput.fill(TEXTO_NOMBRE_REFERIDO);
      console.log('✅ Nombre referido llenado');
    } else {
      console.log('⚠️ No se encontró el campo "Nombre referido"');
    }
    console.log('✅ Sección General completada');
  } catch (error) {
    console.log(`⚠️ Error en General: ${error.message}`);
  }
}

async function fillApenrienciaGeneralSection(page) {
  console.log('👤 Llenando Apariencia general...');
  try {
    const ta = page.locator('textarea[placeholder="Describa la apariencia general del paciente"]').first();
    if (await opcional(ta.isVisible(), 'apariencia-general:textarea-visible')) {
      await ta.fill(TEXTO_APARIENCIA);
      console.log('✅ Apariencia general llenada');
    } else {
      console.log('⚠️ No se encontró el textarea de Apariencia general');
    }
  } catch (error) {
    console.log(`⚠️ Error en Apariencia general: ${error.message}`);
  }
}

// Usado tanto para "Exploración segmentaria" como "Aparatos y sistemas":
// marca algunos checkboxes, llena cualquier observación revelada, y guarda
// con el botón "Guardar Respuestas" propio de la sección.
async function fillChecklistSection(page, headingRegex, nombreLog) {
  console.log(`🔍 Llenando ${nombreLog}...`);
  try {
    const scope = await sectionContainer(page, headingRegex);
    // El apartado muestra su propio texto "Cargando..." (ej. "Cargando
    // preguntas") mientras trae el checklist por su cuenta (API aparte),
    // después de que el heading ya es visible. Esperar explícitamente a que
    // ese texto desaparezca — no solo a que el primer checkbox se "attache"
    // — evita leer el total a mitad de carga.
    await opcional(page.waitForFunction(
      (el) => !el || !el.innerText || !el.innerText.toLowerCase().includes('cargando'),
      await scope.elementHandle(),
      { timeout: 15000 }
    ), `${nombreLog}:espera-cargando-checklist`);
    const checkboxes = scope.locator('input[type="checkbox"]:not([disabled])');
    // Precondición, no opcional (Etapa 2): si ningún checkbox llega a
    // "attached", el checklist nunca cargó — debe reventar con mensaje claro
    // en vez de seguir con total=0 reportado como "0/0 marcados" silencioso.
    await expect(checkboxes.first(), `${nombreLog}: el checklist nunca renderizó ningún checkbox`).toBeAttached({ timeout: 8000 });
    const total = await checkboxes.count();
    console.log(`☑️ ${nombreLog}: ${total} checkboxes encontrados`);

    // Marcar TODOS los checkboxes del apartado (no una muestra al azar) para
    // que ningún grupo/apartado quede sin cobertura — antes se marcaban solo
    // 3 al azar de todo el scope, lo que en la práctica dejaba varios
    // apartados (Cabeza/Cuello, Tórax, Abdomen, etc.) sin ningún checkbox
    // marcado la mayoría de las corridas.
    //
    // Cada checkbox, al marcarlo, revela su PROPIO sub-formulario individual
    // (confirmado en vivo 2026-07-28): un par de botones "Normal"/"Anormal"
    // (<label> dentro de div.simpleSelect, radio oculto detrás) + un
    // <textarea> de Observaciones propio. Resolver cada sub-formulario DENTRO
    // del mismo loop que marca los checkboxes resultó frágil bajo la lentitud
    // de dev: usar "los últimos 2 botones / el último textarea renderizados"
    // se desalineó a mitad de lista en varias corridas (quedaban ítems con
    // Observaciones llena pero sin Normal/Anormal seleccionado, o viceversa).
    // Ahora se separa en 2 pasadas: (1) marcar todos los checkboxes y esperar
    // a que TODOS los sub-formularios terminen de renderizar, (2) recorrerlos
    // por índice fijo (par de botones 2i/2i+1, textarea i) — solo confiable
    // una vez que la lista completa ya está montada y estable.
    const etiquetas = await checkboxes.evaluateAll((els) => els.map((el, i) => {
      const lbl = el.parentElement && el.parentElement.querySelector('label');
      const txt = (lbl && lbl.textContent || '').trim();
      return txt || `#${i}`;
    }));
    // Cuando este es el PRIMER apartado en llenarse, el checklist puede seguir
    // "asentándose" justo cuando el heading se vuelve visible — "attached" no
    // garantiza que ya sea interactivo. Se vio en vivo (2026-07-28): un click
    // en tandem con `force:true` sin espera entre ítems dejó los 8 checkboxes
    // de "Exploración segmentaria" sin marcar (todos seguían en su icono "+"),
    // mientras que "Aparatos y sistemas" (2do apartado, ya sin esa carrera) sí
    // funcionó. Se agrega una pequeña espera entre clicks y una verificación +
    // reintento por checkbox para no depender de que el primer click alcance.
    for (let i = 0; i < total; i++) {
      const cb = checkboxes.nth(i);
      await opcional(cb.click({ force: true }), `${nombreLog}:checkbox-click-1er-intento`);
      await page.waitForTimeout(150);
      if (!(await opcional(cb.isChecked(), `${nombreLog}:checkbox-ischecked-tras-1er-click`))) {
        await opcional(cb.click({ force: true }), `${nombreLog}:checkbox-click-reintento`);
        await page.waitForTimeout(200);
      }
    }
    const marcados = await checkboxes.evaluateAll((els) => els.filter(el => el.checked).length);
    console.log(`✅ ${nombreLog}: ${marcados}/${total} checkbox(es) marcados → [${etiquetas.join(', ')}]`);
    if (marcados < total) {
      console.log(`⚠️ ${nombreLog}: ${total - marcados} checkbox(es) NO quedaron marcados tras el reintento`);
    }

    await page.waitForTimeout(1500);
    const botones = scope.locator('div.simpleSelect label');
    const textareas = scope.locator('textarea:visible');
    const botonesCount = (await opcional(botones.count(), `${nombreLog}:botones-normal-anormal-count`)) ?? 0;
    const textareasCount = (await opcional(textareas.count(), `${nombreLog}:textareas-observaciones-count`)) ?? 0;
    console.log(`${nombreLog}: ${botonesCount} botones Normal/Anormal (esperados ${total * 2}) | ${textareasCount} campos de Observaciones (esperados ${total})`);

    const items = [];
    for (let i = 0; i < total; i++) {
      const nombreItem = etiquetas[i];
      const elegirAnormal = i % 2 === 1;
      let botonResuelto = false;
      if (botonesCount >= (i + 1) * 2) {
        await opcional(botones.nth(i * 2 + (elegirAnormal ? 1 : 0)).click({ force: true }), `${nombreLog}:boton-normal-anormal-click`);
        await page.waitForTimeout(250);
        botonResuelto = true;
      } else {
        console.log(`⚠️ ${nombreLog}: "${nombreItem}" (índice ${i}) no tiene botones Normal/Anormal disponibles`);
      }
      // Texto distinto por ítem (incluye su nombre) para poder rastrear en
      // getFilledForm cuál se llenó y no confundir la información al guardar.
      let observacionEsperada = null;
      if (textareasCount > i) {
        observacionEsperada = elegirAnormal
          ? `${nombreItem}: hallazgo anormal detectado en ${nombreItem.toLowerCase()}, se sugiere valoración adicional (ítem #${i} de ${nombreLog}).`
          : `${nombreItem}: sin alteraciones aparentes en ${nombreItem.toLowerCase()} (ítem #${i} de ${nombreLog}).`;
        await opcional(textareas.nth(i).fill(observacionEsperada), `${nombreLog}:textarea-observaciones-fill`);
      } else {
        console.log(`⚠️ ${nombreLog}: "${nombreItem}" (índice ${i}) no tiene campo de Observaciones disponible`);
      }
      items.push({
        nombre: nombreItem,
        valorEsperado: botonResuelto ? (elegirAnormal ? 2 : 1) : null,
        observacionEsperada,
      });
    }
    console.log(`✅ ${nombreLog}: Normal/Anormal y Observaciones resueltos para los ${total} ítems → [${etiquetas.join(', ')}]`);
    await page.waitForTimeout(500);

    const guardarBtn = scope.locator('button:has-text("Guardar Respuestas")').first();
    if (await opcional(guardarBtn.isVisible(), `${nombreLog}:boton-guardar-respuestas-visible`)) {
      await guardarBtn.click();
      await page.waitForTimeout(1500);
      await handleModals(page);
      console.log(`💾 ${nombreLog}: "Guardar Respuestas" clickeado`);
    } else {
      console.log(`⚠️ ${nombreLog}: no se encontró su botón "Guardar Respuestas"`);
    }
    return { total, marcados, items };
  } catch (error) {
    console.log(`⚠️ Error en ${nombreLog}: ${error.message}`);
    return { total: 0, marcados: 0, items: [] };
  }
}

async function fillDiagnosticoSection(page) {
  console.log('🩺 Llenando sección de Diagnóstico...');
  const res = { cie10: null };
  try {
    const scope = await sectionContainer(page, /^Diagnóstico$/i);
    await page.waitForTimeout(500);

    // Sin evidencia de que este campo cargue por separado del heading (a
    // diferencia de fillChecklistSection, que sí tiene su propio "Cargando
    // preguntas"): confirmado en vivo contra dev (verificación post-Finalizar
    // limpia, 2026-09-24) que aparece ya renderizado en este punto.
    const cie10Input = scope.locator('textarea[role="combobox"]').first();
    if (await opcional(cie10Input.isVisible(), 'diagnostico:cie10-combobox-visible')) {
      await cie10Input.click();
      await page.waitForTimeout(500);
      const codigoCIE10 = pick(DATOS_CLINICOS.cie10);
      await cie10Input.fill(codigoCIE10);
      await page.waitForTimeout(1500);
      const options = page.locator('[role="option"]:visible, div[id*="option"]:visible');
      const optionCount = await options.count();
      if (optionCount > 0) {
        const optionText = (await opcional(options.first().textContent(), 'diagnostico:cie10-opcion-textcontent') || '').trim();
        await options.first().click();
        res.cie10 = optionText;
        console.log(`✅ Diagnóstico CIE-10 seleccionado: "${optionText.substring(0, 40)}..."`);
      } else {
        console.log(`⚠️ Sin opciones de CIE-10 para "${codigoCIE10}"`);
      }
    } else {
      console.log('⚠️ No se encontró el combobox de CIE-10 en Diagnóstico');
    }

    const impresion = scope.locator('textarea[placeholder="Impresión diagnóstica"]').first();
    if (await opcional(impresion.isVisible(), 'diagnostico:impresion-visible')) {
      const cur = (await opcional(impresion.inputValue(), 'diagnostico:impresion-valor-actual')) ?? '';
      if (!cur.trim()) {
        await impresion.fill(TEXTO_IMPRESION_DIAGNOSTICA);
        console.log('✅ Impresión diagnóstica llenada');
      }
    }

    // Observaciones: el campo NO existe hasta activar el interruptor "Agregar
    // observaciones" (checkbox sr-only dentro de un <label>); al activarlo
    // aparece un textarea con placeholder "Notas adicionales" (Hallazgo E,
    // 2026-10-01). Antes este código tomaba "el primer textarea vacío que no sea
    // Impresión diagnóstica" — que era el input del combobox de CIE-10 — y
    // escribía las observaciones ahí, con el log "✅ llenadas" en falso.
    // Precondición, no opcional: si el interruptor o el textarea no aparecen,
    // debe reventar (el try/catch exterior lo loguea como "⚠️ Error en Diagnóstico",
    // y la verificación de nota_diagnostico tras Finalizar lo deja en evidencia).
    const toggleObs = scope.locator('label:has-text("Agregar observaciones")').first();
    await toggleObs.waitFor({ state: 'visible', timeout: 10000 });
    await toggleObs.click();
    const obsTextarea = scope.locator('textarea[placeholder="Notas adicionales"]').first();
    await obsTextarea.waitFor({ state: 'visible', timeout: 10000 });
    await obsTextarea.fill(TEXTO_OBSERVACIONES_DIAGNOSTICO);
    console.log('✅ Observaciones del diagnóstico llenadas (interruptor + "Notas adicionales")');

    console.log('✅ Sección de Diagnóstico completada');
  } catch (error) {
    console.log(`⚠️ Error en Diagnóstico: ${error.message}`);
  }
  return res;
}

async function fillTratamientoSection(page) {
  console.log('💊 Llenando sección de Tratamiento...');
  // Lo que se eligió/llenó, para compararlo tras Finalizar (2026-10-01).
  const res = { indicacionesGenerales: null, medicamento: null, medForm: null, otros: null };
  try {
    const scope = await sectionContainer(page, /^Tratamiento$/i);
    await page.waitForTimeout(500);

    const indicacionesEditor = scope.locator('div.jodit-wysiwyg').first();
    if (await opcional(indicacionesEditor.isVisible(), 'tratamiento:indicaciones-editor-visible')) {
      await indicacionesEditor.click();
      await page.keyboard.press('Control+A');
      res.indicacionesGenerales = pick(DATOS_CLINICOS.indicacionesGenerales);
      await page.keyboard.type(res.indicacionesGenerales);
      console.log('✅ Indicaciones generales de tratamiento llenadas');
    }

    // Sin evidencia de carga separada (confirmado en vivo contra dev,
    // 2026-09-24: verificación post-Finalizar limpia, medicamento guardado).
    const medicamentoInput = scope.locator('#react-select-2-input');
    if (await opcional(medicamentoInput.isVisible(), 'tratamiento:medicamento-input-visible')) {
      const medicamento = pick(DATOS_CLINICOS.medicamentos);
      await medicamentoInput.click();
      await medicamentoInput.fill(medicamento);
      await opcional(page.waitForSelector('[role="option"]:visible, div[id*="option"]:visible', { timeout: 10000 }), 'tratamiento:medicamento-opciones-espera');
      const options = page.locator('[role="option"]:visible, div[id*="option"]:visible');
      const optionCount = await options.count();
      if (optionCount > 0) {
        // El buscador no siempre filtra estricto por lo tipeado — buscar una
        // opción que realmente contenga el término, no asumir que la primera
        // coincide (confirmado en vivo: tomar .first() a ciegas guardó un
        // medicamento distinto al buscado).
        let elegida = null;
        for (let i = 0; i < optionCount; i++) {
          const t = (await opcional(options.nth(i).textContent(), 'tratamiento:medicamento-opcion-textcontent') || '');
          if (t.toLowerCase().includes(medicamento.toLowerCase())) { elegida = options.nth(i); break; }
        }
        const target = elegida || options.first();
        const textoReal = (await opcional(target.textContent(), 'tratamiento:medicamento-elegido-textcontent') || '').trim();
        await target.click();
        if (!elegida) console.log(`⚠️ Ninguna opción contenía "${medicamento}" — se tomó la primera disponible`);
        res.medicamento = textoReal;
        console.log(`✅ Medicamento seleccionado: "${textoReal.substring(0, 60)}" (buscado: "${medicamento}")`);
      }
      await opcional(page.waitForLoadState('load'), 'tratamiento:load-tras-elegir-medicamento');
      await page.waitForTimeout(1500);

      // Etapa 2 de docs/tarea-actual.md (hueco de cobertura, 2026-09-17):
      // ninguno de estos 7 campos tenía log cuando no se encontraba, y
      // ninguno se verifica tras Finalizar (solo se verifica que haya ≥1
      // medicamento vía getTreatments, no que tenga dosis/vía/frecuencia
      // cargadas) — este log es, por ahora, la única red de seguridad si la
      // UI cambia. También corrige el mensaje final, que antes decía
      // "llenado" sin importar cuántos de los 7 campos realmente aparecieron.
      const camposMedicamento = [
        { loc: page.locator('input[name="dosis_cantidad"]'), nombre: 'dosis', accion: (l) => l.fill('1') },
        { loc: page.locator('select[name="iViaAdministracionId-0"]'), nombre: 'vía de administración', accion: (l) => l.selectOption({ index: 1 }) },
        { loc: page.locator('select[name="unidad_dosis_id-0"]'), nombre: 'unidad de dosis', accion: (l) => l.selectOption({ index: 1 }) },
        { loc: page.locator('input[name="frecuencia_cantidad"]'), nombre: 'frecuencia', accion: (l) => l.fill('8') },
        { loc: page.locator('input[name="tiempo_cantidad"]'), nombre: 'duración', accion: (l) => l.fill('10') },
        { loc: page.locator('select[name="unidad_tiempo_id-0"]'), nombre: 'unidad de tiempo', accion: (l) => l.selectOption({ index: 1 }) },
        { loc: page.locator('input[name="indicaciones-0"]'), nombre: 'indicaciones del medicamento', accion: (l) => l.fill('Indicaciones estándar') },
      ];
      let camposMedLlenados = 0;
      for (const campo of camposMedicamento) {
        if (await opcional(campo.loc.isVisible(), `tratamiento:${campo.nombre}-visible`)) {
          await campo.accion(campo.loc);
          camposMedLlenados++;
        } else {
          console.log(`⚠️ Tratamiento: no se encontró el campo "${campo.nombre}" del medicamento`);
        }
      }
      console.log(`✅ Formulario del medicamento llenado (${camposMedLlenados}/${camposMedicamento.length} campos)`);
      // Lo que quedó realmente en los campos (valores de los inputs y texto de la
      // opción elegida en cada select), para compararlo con getTreatments.
      const valorInput = async (sel) => (await page.locator(sel).count()) > 0 ? page.locator(sel).first().inputValue() : null;
      const textoSelect = async (sel) => (await page.locator(sel).count()) > 0 ? page.locator(sel).first().evaluate(e => (e.options[e.selectedIndex] || {}).text || '') : null;
      res.medForm = {
        dosis: await valorInput('input[name="dosis_cantidad"]'),
        frecuencia: await valorInput('input[name="frecuencia_cantidad"]'),
        duracion: await valorInput('input[name="tiempo_cantidad"]'),
        indicaciones: await valorInput('input[name="indicaciones-0"]'),
        via: await textoSelect('select[name="iViaAdministracionId-0"]'),
        unidadDosis: await textoSelect('select[name="unidad_dosis_id-0"]'),
        unidadTiempo: await textoSelect('select[name="unidad_tiempo_id-0"]'),
      };
    } else {
      console.log('⚠️ No se encontró el buscador de medicamentos en Tratamiento');
    }

    // "Otros medicamentos" (junto a "Medicamentos" del catálogo): botón
    // "Agrega tratamiento diferente" que revela una fila libre Medicamento/
    // Indicaciones (2 inputs de texto sin name/placeholder, identificados por
    // su <label> propio) — antes se dejaba sin llenar por completo.
    const agregarDiferenteBtn = scope.locator('button:has-text("Agrega tratamiento diferente"), button:has-text("Agrega tratamiendo diferente")').first();
    if (await opcional(agregarDiferenteBtn.isVisible(), 'tratamiento:boton-agregar-diferente-visible')) {
      await agregarDiferenteBtn.click();
      await page.waitForTimeout(800);
      const tratamientoDiferente = pick(DATOS_CLINICOS.tratamientosDiferentes);
      // Etapa 2 (hueco de cobertura): "Otros medicamentos" no tiene
      // verificación downstream tras Finalizar — el log final honesto (en
      // vez del "llenado" incondicional de antes) es, por ahora, la única
      // señal si alguno de los 2 inputs deja de aparecer.
      // isVisible({timeout}) no espera de verdad (confirmado en vivo, Etapa
      // 5) — esta fila la crea el click de arriba, así que sí puede tardar
      // más que un instante en montar.
      let otrosMedicamentosCompleto = true;
      const medicamentoDifInput = scope.locator('div.flex:has-text("Medicamento:")').last().locator('input[type="text"]').first();
      if (await opcional(medicamentoDifInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true), 'tratamiento:medicamento-diferente-input-visible')) {
        await medicamentoDifInput.fill(tratamientoDiferente);
      } else {
        console.log('⚠️ No se encontró el input de "Medicamento:" en Otros medicamentos');
        otrosMedicamentosCompleto = false;
      }
      const indicacionesDifInput = scope.locator('div.flex:has-text("Indicaciones:")').last().locator('input[type="text"]').first();
      if (await opcional(indicacionesDifInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true), 'tratamiento:indicaciones-diferente-input-visible')) {
        await indicacionesDifInput.fill('Tomar según indicación médica, con alimentos.');
      } else {
        console.log('⚠️ No se encontró el input de "Indicaciones:" en Otros medicamentos');
        otrosMedicamentosCompleto = false;
      }
      res.otros = { nombre: tratamientoDiferente, indicaciones: 'Tomar según indicación médica, con alimentos.', completo: otrosMedicamentosCompleto };
      console.log(otrosMedicamentosCompleto
        ? `✅ "Otros medicamentos" llenado: "${tratamientoDiferente}"`
        : `⚠️ "Otros medicamentos" quedó incompleto (buscado: "${tratamientoDiferente}")`);
    } else {
      console.log('⚠️ No se encontró el botón "Agrega tratamiento diferente"');
    }

    console.log('✅ Sección de Tratamiento completada (se guarda con el botón global "Guardar cambios")');
  } catch (error) {
    console.log(`⚠️ Error en Tratamiento: ${error.message}`);
  }
  return res;
}

async function fillLaboratoriosSection(page) {
  console.log('🔬 Llenando Laboratorios y Procedimientos...');
  const res = { laboratorio: null };
  try {
    const scope = await sectionContainer(page, /^Laboratorios y Procedimientos$/i);
    await page.waitForTimeout(500);

    const indicacionesEditor = scope.locator('div.jodit-wysiwyg').first();
    if (await opcional(indicacionesEditor.isVisible(), 'laboratorios:indicaciones-editor-visible')) {
      await indicacionesEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(TEXTO_INDICACIONES_LAB);
      console.log('✅ Indicaciones de laboratorio llenadas');
    }

    // Sin evidencia de carga separada (confirmado en vivo contra dev,
    // 2026-09-24: verificación post-Finalizar limpia, laboratorio guardado).
    const labSelect = scope.locator('#react-select-3-input');
    if (await opcional(labSelect.isVisible(), 'laboratorios:lab-select-visible')) {
      const laboratorio = pick(DATOS_CLINICOS.laboratorios);
      await labSelect.click();
      await page.waitForTimeout(300);
      await labSelect.fill(laboratorio);
      await page.waitForTimeout(1500);
      const labOptions = page.locator('[role="option"]:visible, div[id*="option"]:visible');
      const labOptionCount = await labOptions.count();
      if (labOptionCount > 0) {
        // Mismo criterio que Tratamiento: buscar coincidencia real, no
        // asumir que la primera opción corresponde a lo buscado.
        let elegida = null;
        for (let i = 0; i < labOptionCount; i++) {
          const t = (await opcional(labOptions.nth(i).textContent(), 'laboratorios:opcion-textcontent') || '');
          if (t.toLowerCase().includes(laboratorio.toLowerCase())) { elegida = labOptions.nth(i); break; }
        }
        const target = elegida || labOptions.first();
        const text = (await opcional(target.textContent(), 'laboratorios:opcion-elegida-textcontent') || '').trim();
        await target.click();
        if (!elegida) console.log(`⚠️ Ninguna opción de laboratorio contenía "${laboratorio}" — se tomó la primera disponible`);
        res.laboratorio = text;
        console.log(`✅ Laboratorio seleccionado: "${text.substring(0, 60)}" (buscado: "${laboratorio}")`);
      } else {
        console.log('⚠️ Sin opciones de laboratorio');
      }
    } else {
      // Etapa 2 (hueco de cobertura): antes no logueaba nada acá, y no hay
      // verificación downstream de que se haya agregado un laboratorio.
      console.log('⚠️ No se encontró el selector de laboratorio en Laboratorios y Procedimientos');
    }

    const procedimientoInput = scope.locator('textarea[name="procedimiento-0"]');
    if (await opcional(procedimientoInput.isVisible(), 'laboratorios:procedimiento-input-visible')) {
      await procedimientoInput.fill(TEXTO_PROCEDIMIENTO);
      console.log('✅ Procedimiento llenado');
    } else {
      // Etapa 2 (hueco de cobertura): idem arriba — sin log ni verificación
      // downstream de TEXTO_PROCEDIMIENTO antes de este cambio.
      console.log('⚠️ No se encontró el campo de procedimiento en Laboratorios y Procedimientos');
    }

    console.log('✅ Laboratorios y Procedimientos completado (se guarda con el botón global "Guardar cambios")');
  } catch (error) {
    console.log(`⚠️ Error en Laboratorios: ${error.message}`);
  }
  return res;
}

async function fillNotasMedicoSection(page) {
  console.log('📋 Llenando Notas del Médico...');
  try {
    const scope = await sectionContainer(page, /^Notas del Médico/i);
    // Sin evidencia de carga separada (confirmado en vivo contra dev,
    // 2026-09-24: verificación post-Finalizar limpia, nota guardada).
    const editor = scope.locator('div.jodit-wysiwyg').first();
    if (await opcional(editor.isVisible(), 'notas-medico:editor-visible')) {
      await editor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(TEXTO_NOTAS_MEDICO);
      console.log('✅ Notas del médico llenadas');
    } else {
      console.log('⚠️ No se encontró el editor de Notas del Médico');
    }
  } catch (error) {
    console.log(`⚠️ Error en Notas del Médico: ${error.message}`);
  }
}

async function fillServiciosSection(page) {
  console.log('🏥 Llenando sección de Servicios...');
  let sinOpcionesDisponibles = false;
  let servicio = null;
  try {
    const scope = await sectionContainer(page, /^Servicios$/i);
    await page.waitForTimeout(500);

    const dropdownInput = scope.locator('input[role="combobox"]:visible, input[id*="react-select"]:visible').first();
    if (await dropdownInput.count() > 0) {
      await dropdownInput.click();
      await page.waitForTimeout(1500);
      const dropdownMenu = page.locator('[class*="menu"]:not([class*="sidebar"]):not([class*="nav"])').last();
      const options = dropdownMenu.locator('[class*="option"], [role="option"]');
      let optionCount = await options.count();
      if (optionCount === 0) {
        await page.waitForTimeout(1500);
        optionCount = await options.count();
      }
      console.log(`📋 ${optionCount} opciones de servicio disponibles`);

      if (optionCount === 0) {
        const sinElementos = page.locator('text=/No se encontraron elementos/i');
        if (await opcional(sinElementos.isVisible(), 'servicios:sin-elementos-visible')) {
          sinOpcionesDisponibles = true;
          const shot = 'test-results/servicios-sin-opciones.png';
          await opcional(page.screenshot({ path: shot, fullPage: true }), 'servicios:screenshot-sin-opciones');
          console.log(`🐛 BUG: dropdown "Agregar servicios" sin opciones ("No se encontraron elementos") → ${shot}`);
        }
      } else {
        let elegido = false;
        for (let j = 0; j < optionCount; j++) {
          const option = options.nth(j);
          const optionText = (await opcional(option.textContent(), 'servicios:opcion-textcontent') || '').trim();
          if (optionText.toLowerCase().includes('certificado')) {
            await option.click();
            servicio = optionText;
            console.log(`✅ Servicio seleccionado: "${optionText.substring(0, 60)}"`);
            elegido = true;
            break;
          }
        }
        if (!elegido) {
          const first = options.first();
          const text = (await opcional(first.textContent(), 'servicios:opcion-primera-textcontent') || '').trim();
          await first.click();
          servicio = text;
          console.log(`✅ Servicio seleccionado (primera opción): "${text.substring(0, 60)}"`);
        }
      }
    } else {
      console.log('⚠️ No se encontró el dropdown de servicios');
    }

    console.log('✅ Sección de Servicios completada (se guarda con el botón global "Guardar cambios")');
  } catch (error) {
    console.log(`⚠️ Error en Servicios: ${error.message}`);
  }
  return { sinOpcionesDisponibles, servicio };
}

module.exports = {
  fillPerimetroCefalico,
  fillGeneralSection,
  fillApenrienciaGeneralSection,
  fillChecklistSection,
  fillDiagnosticoSection,
  fillTratamientoSection,
  fillLaboratoriosSection,
  fillNotasMedicoSection,
  fillServiciosSection,
};
