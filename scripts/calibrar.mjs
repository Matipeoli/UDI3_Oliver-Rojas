// Calibración del umbral (clase 7/8): mide la similitud del mejor fragmento para
// preguntas que SÍ están y que NO están, sin llamar al modelo de chat.
// Editá las dos listas con preguntas tuyas (con palabras propias y reformuladas).
import { embeddingsEnLote } from '../src/embeddings.mjs';
import { masParecidos } from '../src/db.mjs';
import { pool } from '../src/db.mjs';

const SI_ESTAN = [
  '¿Qué carta es la más fuerte?',
  '¿Cuántos puntos gano si el otro no quiere el truco?',
  '¿Quién gana si hay empate en el envido?',
  '¿Cuántos puntos tiene la mejor flor?',
  '¿Puedo hacerle señas a mi compañero?',
  '¿Cuándo se puede cantar envido?',
  '¿Qué pasa si las tres manos quedan empatadas?',
  '¿Cómo funciona la muestra en Uruguay?',
  '¿Qué son las manilhas en el truco brasileño?',
  '¿A cuántos puntos se juega el truc catalán?',
];
const NO_ESTAN = [
  '¿Cuánto cuesta un mazo de cartas?',
  '¿Cómo se juega al póker?',
  '¿Quién inventó el truco?',
  '¿A qué hora abre el club?',
  '¿Cuál es la capital de Francia?',
  '¿Cómo se juega al truco en Chile?',
];

async function medir(preguntas) {
  const vectores = await embeddingsEnLote(preguntas);
  const out = [];
  for (let i = 0; i < preguntas.length; i++) {
    const [mejor] = await masParecidos(vectores[i], 1);
    out.push({ pregunta: preguntas[i], sim: mejor.similitud, art: mejor.articulo });
  }
  return out;
}

const si = await medir(SI_ESTAN);
const no = await medir(NO_ESTAN);
const fmt = (r) => `  ${r.sim.toFixed(3)}  (art. ${String(r.art).padStart(2)})  ${r.pregunta}`;

console.log('\nPreguntas que SÍ están (similitud del mejor fragmento):');
si.sort((a, b) => a.sim - b.sim).forEach((r) => console.log(fmt(r)));
console.log('\nPreguntas que NO están:');
no.sort((a, b) => b.sim - a.sim).forEach((r) => console.log(fmt(r)));

const minSi = si[0].sim;
const maxNo = no[0].sim;
console.log(`\nLa más baja de las que SÍ están: ${minSi.toFixed(3)}`);
console.log(`La más alta de las que NO están: ${maxNo.toFixed(3)}`);
if (minSi > maxNo) {
  console.log(`Las nubes NO se superponen: cualquier umbral entre ${maxNo.toFixed(3)} y ${minSi.toFixed(3)} separa todo.`);
  console.log(`Sugerido (punto medio): UMBRAL=${((minSi + maxNo) / 2).toFixed(2)}`);
} else {
  console.log('Las nubes se SUPERPONEN: no hay corte perfecto. Elegí qué error preferís (falso negativo = decir "no lo especifica" de más).');
  console.log(`Para evitar inventar, subí el umbral hacia ${maxNo.toFixed(2)}; para no perder respuestas, bajalo hacia ${minSi.toFixed(2)}.`);
}
await pool.end();
