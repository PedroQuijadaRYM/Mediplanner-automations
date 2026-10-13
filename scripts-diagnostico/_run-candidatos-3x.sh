#!/bin/bash
# Re-corre SOLO los proyectos con hallazgos/candidatos de la corrida completa
# anterior (2026-07-31), 3 veces seguidas, para confirmar o descartar rápido
# sin perder tiempo en los que ya salieron limpios.
cd "/c/Users/pandr/OneDrive/00_Pedro_Quijada/03_RYM-Solutions/Repositorios/Mediplanner-automations" || exit 1

PROJECTS=(
  dashboard
  reportes
  ajustes-servicios
  percentil-explorar
  vacunacion-ciclo-completo
  subir-estudios
  stress-diagnosticos
  doctor-consultation
  consultation-inputs-validation
  consultation-user-errors
)

for VUELTA in 1 2 3; do
  echo "=== VUELTA $VUELTA INICIO $(date '+%Y-%m-%d %H:%M:%S') ==="
  for p in "${PROJECTS[@]}"; do
    echo "=== INICIO PROYECTO vuelta=$VUELTA proyecto=$p $(date '+%H:%M:%S') ==="
    ./node_modules/.bin/playwright test --project="$p" 2>&1
    STATUS=$?
    echo "=== FIN PROYECTO vuelta=$VUELTA proyecto=$p exit=$STATUS $(date '+%H:%M:%S') ==="
  done
  echo "=== VUELTA $VUELTA COMPLETA $(date '+%Y-%m-%d %H:%M:%S') ==="
done
echo "=== LAS 3 VUELTAS DE CANDIDATOS TERMINARON ==="
