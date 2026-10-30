// Momento 2: CONSULTAR (cada vez que alguien pregunta).
// pregunta -> embedding -> top-k en Postgres -> umbral -> prompt -> Gemini -> respuesta + fuentes.
import { config } from './config.mjs';
import { embedding } from './embeddings.mjs';
import { masParecidos } from './db.mjs';
import { generar } from './generar.mjs';

export const SIN_RESPUESTA = 'El reglamento no lo especifica.';

const resumir = (f) => ({
  archivo: f.archivo,
  titulo: f.titulo,
  articulo: f.articulo,
  nombre: f.nombre,
  similitud: Number(f.similitud.toFixed(4)),
  texto: f.texto,
});

export async function preguntar(pregunta) {
  const vector = await embedding(pregunta);
  const candidatos = await masParecidos(vector, config.k);

  // Primera barrera contra la invención: el umbral corta ANTES de llamar al modelo.
  const pasan = candidatos.filter((f) => f.similitud >= config.umbral);

  const base = {
    umbral: config.umbral,
    candidatos: candidatos.map(resumir), // para diagnosticar fallas en la demo
  };

  if (pasan.length === 0) {
    return { ...base, respuesta: SIN_RESPUESTA, motivo: 'umbral', fuentes: [] };
  }

  // Segunda barrera: la instrucción del prompt, para lo que pasó el umbral sin tener la respuesta.
  const respuesta = await generar(pregunta, pasan);
  const sinRespuesta = respuesta.startsWith(SIN_RESPUESTA);
  return {
    ...base,
    respuesta,
    motivo: sinRespuesta ? 'prompt' : 'ok',
    fuentes: sinRespuesta ? [] : pasan.map(resumir),
  };
}
