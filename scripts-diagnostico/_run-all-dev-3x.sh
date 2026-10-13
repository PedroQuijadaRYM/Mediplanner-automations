#!/bin/bash
# Corre TODOS los proyectos de playwright.config.js (dev) 3 veces seguidas,
# a pedido de Pedro (2026-07-31), documentando bugs en CONTEXTO.md aparte.
# Se ejecuta como proceso desacoplado (nohup) para no depender del timeout
# de una sola llamada de herramienta — puede tardar varias horas en total.
cd "/c/Users/pandr/OneDrive/00_Pedro_Quijada/03_RYM-Solutions/Repositorios/Mediplanner-automations" || exit 1

PROJECTS=(
  dashboard-explorar
  dashboard
  reportes
  ajustes-servicios
  ajustes-explorar
  reportes-explorar
  percentil-explorar
  recetas-explorar
  recetas
  vacunacion-explorar
  vacunacion-ciclo-completo
  appointments-create
  doctor-consultation
  consultation-inputs-validation
  consultation-user-errors
  system-health
  ingresos
  subir-estudios
  stress-citas
  stress-pacientes
  stress-ingresos
  stress-login
  stress-informacion-paciente
  stress-facturacion
  stress-antecedentes
  stress-diagnosticos
)

for PASE in 1 2 3; do
  echo "=== PASE $PASE INICIO $(date '+%Y-%m-%d %H:%M:%S') ==="
  for p in "${PROJECTS[@]}"; do
    echo "=== INICIO PROYECTO pase=$PASE proyecto=$p $(date '+%H:%M:%S') ==="
    ./node_modules/.bin/playwright test --project="$p" 2>&1
    STATUS=$?
    echo "=== FIN PROYECTO pase=$PASE proyecto=$p exit=$STATUS $(date '+%H:%M:%S') ==="
  done
  echo "=== PASE $PASE COMPLETO $(date '+%Y-%m-%d %H:%M:%S') ==="
done
echo "=== LAS 3 PASADAS TERMINARON ==="
