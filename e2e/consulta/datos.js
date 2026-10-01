const DATOS_CLINICOS = {
  signosVitales: {
    presiones: ['110/070', '115/075', '120/080', '125/080', '118/078'],
    temperaturas: ['36.3', '36.5', '36.7', '36.8', '37.0'],
    frecuenciasCardiacas: ['65', '70', '72', '75', '78', '80'],
    saturaciones: ['96', '97', '98', '99'],
    frecuenciasRespiratorias: ['14', '16', '18', '20'],
    glucosas: ['85', '90', '95', '100', '105'],
  },
  cie10: ['R05', 'J00', 'A09', 'M54', 'R51', 'K59'],
  medicamentos: ['Paracetamol', 'Ibuprofeno', 'Amoxicilina', 'Omeprazol', 'Loratadina'],
  laboratorios: ['Biometría', 'Química', 'Perfil'],
  tratamientosDiferentes: ['Reposo relativo', 'Dieta blanda', 'Abundantes líquidos'],
  indicacionesGenerales: [
    'Reposo relativo, abundantes líquidos, control de signos de alarma.',
    'Dieta blanda, evitar irritantes, seguimiento en 48-72 horas si no mejora.',
  ],
};

// Textos fijos (no aleatorios) usados al llenar — se extraen a constantes
// para poder reutilizarlos tal cual en la verificación post-Finalizar, sin
// duplicar los literales ni arriesgar que se desincronicen entre llenado y
// verificación.
const TEXTO_MOTIVO = 'Paciente acude a consulta por cefalea persistente de 3 días de evolución, de intensidad moderada, sin respuesta a analgésicos de venta libre.';
const TEXTO_PADECIMIENTO = 'Inicia padecimiento actual hace 3 días con cefalea frontal de tipo opresiva, intensidad 6/10 en escala visual análoga, acompañada de fotofobia leve. Niega fiebre, vómito o alteraciones neurológicas focales.';
const TEXTO_NOTAS_EVOLUCION = 'Evolución favorable sin complicaciones';
const TEXTO_NOMBRE_REFERIDO = 'Dr. Alejandro Torres (Medicina General)';
const TEXTO_APARIENCIA = 'Paciente bien nutrido, hidratado, consciente, orientado, sin facies de dolor, sin dificultad respiratoria.';
const TEXTO_IMPRESION_DIAGNOSTICA = 'Impresión diagnóstica: Condición médica a evaluar. Se solicitan estudios complementarios.';
const TEXTO_OBSERVACIONES_DIAGNOSTICO = 'Observaciones: paciente estable, se indica seguimiento ambulatorio y vigilancia de signos de alarma.';
const TEXTO_INDICACIONES_LAB = 'Solicitar estudios de laboratorio de rutina';
const TEXTO_PROCEDIMIENTO = 'Biometría hemática completa';
const TEXTO_NOTAS_MEDICO = 'Notas del médico: Seguimiento de evolución clínica favorable. Paciente responde adecuadamente al tratamiento.';

const PACIENTE_NOMBRE = process.env.PACIENTE_NOMBRE || 'Percentil Prueba Prueba';
const PACIENTE_BUSQUEDA = process.env.PACIENTE_BUSQUEDA || 'Percentil';
const PERCENTIL_SETS = {
  1: { peso: '13', talla: '92', perimetro: '48' },
  2: { peso: '14', talla: '95', perimetro: '49' },
  3: { peso: '15', talla: '98', perimetro: '50' },
};
const PERCENTIL_RUN = parseInt(process.env.PERCENTIL_RUN || '1', 10);
// Los sets de arriba son pediátricos (paciente habitual "Percentil"). Para un
// paciente adulto se pueden pisar por variable de entorno (MEDIDA_PESO,
// MEDIDA_TALLA, MEDIDA_PERIMETRO); sin ellas, el default no cambia.
const _SET_BASE = PERCENTIL_SETS[PERCENTIL_RUN] || PERCENTIL_SETS[1];
const MEDIDAS = {
  peso: process.env.MEDIDA_PESO || _SET_BASE.peso,
  talla: process.env.MEDIDA_TALLA || _SET_BASE.talla,
  perimetro: process.env.MEDIDA_PERIMETRO || _SET_BASE.perimetro,
};

module.exports = {
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
  PACIENTE_BUSQUEDA,
  PERCENTIL_RUN,
  MEDIDAS,
};
