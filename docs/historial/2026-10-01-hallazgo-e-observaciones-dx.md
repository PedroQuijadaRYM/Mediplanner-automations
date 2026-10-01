# Hallazgo E (cerrado) — "Observaciones del diagnóstico" no se llenaba

**Fecha:** 2026-10-01 · **Resultado:** bug del TEST, no de la app.

## Síntoma
Tras Finalizar, `getConsultation.nota_diagnostico` volvía `""` (con "Agustin
Tapia Nievas" y con "Percentil Prueba Prueba"), pese a que el test logueaba
"✅ Observaciones del diagnóstico llenadas".

## Causa raíz
En la tarjeta Diagnóstico el campo de observaciones **no existe** hasta activar
el interruptor "Agregar observaciones"; al activarlo aparece un
`textarea[placeholder="Notas adicionales"]` (en la vista editable se rotula
"Observaciones*"). `fillDiagnosticoSection` tomaba el primer `textarea` visible
vacío que no fuera "Impresión diagnóstica": el input del combobox de CIE-10
(`textarea[role=combobox]`, `react-select-N-input`). El texto se tecleaba en
el buscador de CIE-10, y `addDiagnosis` salía con `"observaciones":""`.

## Evidencia
- Corrida instrumentada: 2 textareas visibles; elegido `[1]` =
  `react-select-5-input`; body `addDiagnosis` con `"observaciones":""`.
- Llenado a mano por el campo real: body con `"observaciones":"OBS-DX-MANUAL…"`,
  200, y el texto persiste tras recargar.
- Tras el arreglo: `✅ nota_diagnostico` en la verificación post-Finalizar.
- Scripts: `scripts-diagnostico/_investigar_observaciones_dx_manual_dev.js`,
  `_verificar_observaciones_dx_tapia_dev.js`; capturas en `test-results/hallazgo-e/`.

## Cambios
`e2e/consulta/secciones.js` (activar interruptor + llenar "Notas adicionales",
sin catch mudo) y `tests/consultation.full-flow.spec.js` (verifica
`nota_diagnostico`).

## Lección
El patrón "primer elemento vacío" + log de éxito sin verificar es exactamente
el tipo de cosa de CLAUDE.md §0.4/§0.5. Revisar otros usos en `secciones.js`.
