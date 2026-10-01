# CONTEXTO — MediplannerWebNuevo

> **Qué es este archivo:** el estado vivo del proyecto, en corto. Es lo primero
> que lee una sesión nueva de Claude Code. Se mantiene breve a propósito —
> el detalle histórico vive en `docs/historial/`, los hallazgos con su
> evidencia en `docs/hallazgos-abiertos.md`.
>
> **Última actualización:** 2026-10-01 (reporter JSON + fix `auditarPantalla`)
>
> **Regla de mantenimiento:** cuando algo se resuelve o se cierra, sale de este
> archivo y se archiva. Si una entrada crece más de un párrafo, su detalle va a
> `docs/hallazgos-abiertos.md` y aquí queda solo la línea.

---

## Dónde está cada cosa

| Archivo | Qué contiene | Cuándo leerlo |
| --- | --- | --- |
| `CLAUDE.md` | Normas permanentes de metodología de pruebas | Siempre (carga automática) |
| `CONTEXTO.md` | Este archivo: estado vivo y qué sigue | Al empezar cualquier sesión |
| `docs/tarea-actual.md` | El encargo en curso, con criterio de aceptación | Al empezar a trabajar |
| `docs/hallazgos-abiertos.md` | Hallazgos vivos: repro, evidencia, estado | Al tocar el área de un hallazgo |
| `docs/historial/` | Sesiones cerradas y hallazgos resueltos | Solo si hace falta el antecedente |

## Entornos

| Entorno | Ubicación en el repo | URL |
| --- | --- | --- |
| dev | raíz, `tests/` | `admin-dev.mediplanner.mx` |
| staging | `Mediplanner Staging/` | `admin-staging.mediplanner.mx` |
| producción | `Mediplanner produccion/` | — |

Tres ramas espejo (`Trabajando` por defecto, `main`, `Normalization`) que Pedro
mantiene sincronizadas al mismo commit. `.env` y `storageState.json` son
locales y no están versionados.

Pedro es Test Automation Tester, no developer; los tests son su
responsabilidad. Se trabaja en español.

## Estado actual

La suite corre contra dev. Los specs de confianza Alta/Media se reauditaron el
2026-09-10 (detalle en `docs/historial/2026-09-10-reauditoria.md`). Hay una
iniciativa en curso de reorganización de la suite, descrita en
`docs/tarea-actual.md` — la reorganización de la raíz (scripts a
`scripts-diagnostico/`, logs a `logs/`) ya está commiteada
(`74f22cd`).

**Las 5 etapas de `docs/tarea-actual.md` completas y commiteadas — encargo
completo.** Detalle por etapa en `docs/historial/`:
- Etapa 1-2 (`5c604d9`): los 160 `opcional()` clasificados; 58 sitios de
  código muerto borrados (`e2e/utils.js`: 1338 → 879 líneas); 15
  precondiciones endurecidas y verificadas contra dev; 5/6 huecos de
  cobertura cerrados. De paso se encontró y corrigió un bug real: el listener
  de `doctor_id` (desde `getProfile`) estaba mal ubicado desde 2026-07-30 y
  `doctorId` quedaba siempre `null` — pone en duda la medición de "~100s" del
  hallazgo de `getFilledForm` de abajo. Detalle:
  `docs/historial/2026-09-17-etapa2-clasificacion-catches.md`.
- Etapa 3 (`287ddcb`, 2026-09-23): los 15 helpers de consulta movidos a
  `e2e/consulta/`. Spec: 1165 → 466 líneas. Mismo resultado contra dev.
  Detalle: `docs/historial/2026-09-23-etapa3-extraccion-helpers.md`.
- Etapa 4 (`227a469`, 2026-09-24): `e2e/utils.js` partido en
  `e2e/modales.js`, `e2e/consola.js`, `e2e/auditoria.js`,
  `e2e/citas/crear.js`, `e2e/citas/agenda.js` — quedó como fachada de 35
  líneas. Mismo resultado contra dev (verificación limpia, falla solo por el
  404 de `getFilledForm`). Detalle:
  `docs/historial/2026-09-24-etapa4-split-utils.md`.
- Etapa 5 (`cb12c9b`, 2026-09-24): `docs/tarea-actual.md` hablaba de
  un `appointments.verify.spec.ts` que **no existe** — los dos problemas
  vivían en los dos tests de `appointments.create.spec.ts`. Corregidos:
  ahora usa un paciente fijo (`PACIENTE_BUSQUEDA`), no crea una cita
  duplicada si el paciente ya tiene una en los próximos 5 días, y el test de
  "confirmar" busca la fila por nombre de paciente en vez de un texto
  ("agendada"/"programada") que nunca aparece en esa vista — antes nunca
  encontraba nada y pasaba en verde igual por falta de `expect`. Detalle:
  `docs/historial/2026-09-24-etapa5-specs-citas.md`.
- **Hallazgo real de la Etapa 5:** `locator.isVisible({ timeout })` no espera
  en esta versión de Playwright (el `timeout` es un no-op, confirmado en vivo
  con capturas) — auditado en toda la suite en la Etapa 6 (abajo).
- Etapa 6 (`8ee24df`, 2026-09-24): los 138 usos de `isVisible({ timeout })`
  en `e2e/` y `tests/` clasificados y corregidos (~68 esperaban contenido
  asíncrono real → `waitFor` real; ~65 eran chequeos instantáneos legítimos →
  se quitó el timeout que no hacía nada). De paso se encontraron y
  corrigieron 2 bugs reales más que el propio fix dejó ver (antes
  enmascarados porque el timeout roto volvía todo instantáneo): el selector
  `td[data-day]` de `asegurarCalendarioDashboard` agarraba una celda oculta
  del mes anterior en vez del calendario real, y la tabla "Agenda de hoy"
  perdía el margen de tiempo que antes le daban por accidente los reintentos
  del bug del selector. También se corrigió `appointments.create.spec.ts`
  (test "Confirm scheduled appointment") para manejar citas ya confirmadas de
  corridas anteriores en vez de asumir que la primera fila que matchea es
  siempre la pendiente. Detalle completo:
  `docs/historial/2026-09-24-etapa6-auditoria-isvisible-timeout.md`.
  Verificado contra dev: `doctor-consultation` sigue fallando solo por el 404
  conocido de `getFilledForm`; `appointments-create` pasa limpio 3/3.
- Pendientes sueltos de la Etapa 2 (no bloquean, ver `docs/tarea-actual.md`):
  confirmar en vivo `irADiaEnCalendarioDashboard:250`; decidir qué hacer con
  dosis/vía/unidad/frecuencia/duración/tiempo/indicaciones del medicamento
  (único hueco de cobertura sin cerrar).
- **Con la Etapa 6 commiteada, no hay encargo vigente.** Queda decidir el
  próximo.

**Reporter JSON para el generador de PDF (2026-09-25):**
- `e2e/reporter-qa.js`, registrado como tercer reporter (junto a `html` y
  `list`): escribe `reportes/corrida.json` (ignorado por git). El "paso
  fallido" es el step cuyo error es el que hizo fallar la prueba, no el
  primero con `error` (los `opcional()` dejan steps con error aunque se
  hayan manejado). Verificado contra dev: cuando el fallo cae dentro de un
  `test.step` registra el paso exacto (ej. "Finalizar consulta", línea 225).
- **Decisión abierta:** el 404 de `getFilledForm` se detecta en un `expect`
  final fuera de todo `test.step` (`consultation.full-flow.spec.js:467`) →
  `paso: null`. Opciones: envolver las aserciones finales en un step, o que
  el monitor anote en qué step ocurrió cada respuesta con error.
- Pendiente acordado: el script puente hacia el generador de PDF (no se tocó).

**Fix `auditarPantalla` (2026-09-25):** `inputValue()` se llamaba también
sobre `[contenteditable]`/`[role=combobox]` y reventaba siempre (3 disparos
de `opcional()` por corrida, valor `null` en el inventario). Ahora lee por
tipo de elemento y loguea los no-formulario — eran los 3 editores Jodit de
Tratamiento, Laboratorios y Notas del Médico. 0 disparos en 2 corridas.

**Primera corrida contra otro paciente (2026-10-01, "Agustin Tapia Nievas",
adulto de 27 años):** citas y consulta funcionan igual que con Percentil; los
datos de las 5 pestañas de la consulta se guardan y se ven bien en el perfil.
Diferencias de paciente: sin campo/tarjeta de perímetro cefálico ni pestaña
"Percentil" (adulto). Se encontró y corrigió un bug del test: "Observaciones
del diagnóstico" nunca se llenaba (había que activar el interruptor "Agregar
observaciones"; el test escribía en el combobox de CIE-10 y loguea "llenadas"
en falso). Ahora se llena bien y se verifica vía `nota_diagnostico`. Detalle:
`docs/historial/2026-10-01-hallazgo-e-observaciones-dx.md`. Medidas
configurables por `MEDIDA_PESO`/`MEDIDA_TALLA`/`MEDIDA_PERIMETRO`. Lección
(norma §5): se revisó `secciones.js` (2026-10-01): no hay más llenados con ese
patrón, pero medicamento (7 campos), "Otros medicamentos", CIE-10, servicio,
laboratorio e indicaciones solo se contaban — ahora el spec compara lo elegido
contra lo guardado (`fill*Section` devuelven sus elecciones). Esa revisión
destapó los hallazgos F y G de abajo. OJO: las corridas 2 y 3 de Tapia ya
mostraban 10/15 en "Aparatos y sistemas" y no se leyó en su momento; solo se
dio por bueno el 15/15 de la corrida 1.

**Hueco abierto en `e2e/consulta/secciones.js` (2026-09-25, sin corregir):**
CIE-10 y Laboratorios esperan 1.5s fijos a las opciones de búsqueda; si no
llegaron, loguean "⚠️ Sin opciones…" y siguen (corrida 2: "A09" respondió
con resultados 1.7s después, la app bloqueó Finalizar por CIE-10 vacío).
Además las 9 `fill*Section` están envueltas en un `try/catch` que solo
loguea "⚠️ Error en …" — un fallo al llenar no rompe el test. Esa corrida
dejó una consulta de "Percentil Prueba Prueba" iniciada sin finalizar en dev.
El onboarding/wizard (`saltarOnboardingYWizardConfig`) se deja como está por
decisión de Pedro.

**Limpieza de repo (2026-09-24, commiteada en `Trabajando`/`main`/
`Normalization`):**
- Las 3 ramas espejo, que habían quedado desincronizadas (una rama
  `etapa-3-extract-helpers` local sin pushear, `Trabajando` 10 commits
  adelante de `origin`), se volvieron a sincronizar al mismo commit.
- Destrackeados 6 archivos (`Mediplanner produccion/test-results/*`,
  `logs/test-results-staging-fullflow*.log`) que ya estaban cubiertos por
  `.gitignore` pero habían quedado trackeados de antes.
- Movidos 9 scripts sueltos de `Mediplanner Staging/`/`Mediplanner
  produccion/` a sus `scripts-diagnostico/` (mismo patrón que la raíz de dev).
- **Hallazgo de seguridad real:** 2 de esos scripts y
  `Mediplanner produccion/Tests_Produccion/auth.setup.ts` (este último ya
  commiteado desde antes) tenían el email/password de **producción**
  hardcodeados. Corregidos para leer de `.env`, mismo criterio que
  `tests/auth.setup.ts` (dev) desde el 2026-09-17.
  **La contraseña que quedó en el historial de git NO se rotó** — decisión
  explícita de Pedro (2026-09-24), no un olvido. Ver "Decisiones abiertas".

**Credenciales:** desde 2026-09-17, `tests/auth.setup.ts` (dev) y desde
2026-09-24 `Mediplanner produccion/Tests_Produccion/auth.setup.ts` ya no
tienen valores por defecto — las toman solo de `.env` y fallan con mensaje
claro si faltan.

## Hallazgos abiertos

Detalle completo en `docs/hallazgos-abiertos.md`.

| # | Hallazgo | Estado |
| --- | --- | --- |
| 1 | Carrera de datos: escribir en "General"/"Apariencia general" mientras el overlay "Recuperando datos del paciente..." sigue activo pierde lo tipeado | Causa raíz confirmada. Falta confirmación manual de Pedro antes de reportar a devs |
| D | Botón "Quitar fecha" de Vacunación inclickeable en vacunas de 4+ dosis (11 de 32 botones) | **Reportado a devs (2026-09-25). En trabajo por el equipo de desarrollo** |
| F | El perímetro cefálico no se captura en el flujo de consulta (ni modal de signos vitales ni consulta; el perfil de Percentil muestra "PC —") | Abierto, falta saber dónde se captura |
| G | "Guardar cambios" pulsado al final de la consulta no guardaba los últimos ítems de "Aparatos y sistemas" (Tapia 6/8 corridas con pérdida, Percentil 0/7). El spec ahora guarda justo tras los checklists: 3/3 corridas 15/15 | **Abierto, alta severidad** para quien guarde una sola vez al final; falta decidir si se reporta a devs |
| — | `getFilledForm` 404 tras Finalizar pese a `registerAnswers` 200 | Reproducido de nuevo 2026-09-17 noche, ya sin el confound de `doctorId` (ver abajo): 2 llamadas internas de la app en 404, resuelven solas ~3s después. La medición previa de "~100s" queda en duda |
| — | `saveService`/`getServices`: el bug histórico no reprodujo el 2026-09-10 | En observación, no cerrado |

## Decisiones abiertas

- Quedaron 2 citas de "Percentil Prueba Prueba" hoy (2026-09-24, 11:35 y
  11:40) en dev, ambas ya "Confirmada" — efecto secundario de la Etapa 6 (ver
  su historial). No molestan a los tests tal como están escritos, no se
  limpiaron. Avisar si se prefiere cancelarlas a mano.
- La contraseña de producción que quedó hardcodeada en el historial de git
  (`Mediplanner produccion/Tests_Produccion/auth.setup.ts`, ya corregida en
  el código pero no en el historial) **no se rotó** — decisión explícita de
  Pedro el 2026-09-24, confirmando que la contraseña era/es real. Revisar
  este archivo si en algún momento se decide rotarla y reescribir el
  historial de git.
- Confirmar el Hallazgo 1 a mano antes de reportarlo formalmente a devs.
- Re-confirmar el comportamiento real de borrado de dosis en Vacunación con el
  selector ya corregido (`button.btn-clear.text-danger`), para separar qué era
  test roto y qué era regresión de la app.
- Evaluar si `recetas` y `reportes` deberían tener asserts duros contra errores
  de API — hoy no detectan por sí solos una falla de backend de fondo.
- Decidir si arrancar la fase de exploración de bugs nuevos en dev, o terminar
  primero la reorganización de `docs/tarea-actual.md`.

## Pendientes de commit

Todo commiteado y pusheado en `Trabajando`/`main`/`Normalization`
(2026-10-01). Las carpetas de videos de bugs `Vide/` y `Videos/` quedan
fuera de git a propósito (en `.gitignore`, decisión de Pedro 2026-10-01: el
repo es público) — viven solo en local/OneDrive.

Nota operativa: git en esta carpeta de OneDrive falla al cambiar de
rama/commitear ("unable to append to .git/logs/HEAD") — se resuelve por
comando con `git -c windows.appendAtomically=false ...`.
