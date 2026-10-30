// Momento 1: INDEXAR (una vez, o cuando cambia el corpus).
// leer corpus -> trocear por artículo -> embeddings en lote -> guardar en Postgres.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trocearPorArticulo, textoParaEmbedding, agrupar } from './trocear.mjs';
import { embeddingsEnLote } from './embeddings.mjs';
import { crearEsquema, vaciar, insertar, contar, pool } from './db.mjs';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'corpus');

const archivos = (await readdir(carpeta)).filter((a) => a.endsWith('.txt'));
const fragmentos = [];
for (const archivo of archivos) {
  const texto = await readFile(path.join(carpeta, archivo), 'utf8');
  fragmentos.push(...trocearPorArticulo(texto, archivo));
}
console.log(`Corpus: ${archivos.length} archivo(s), ${fragmentos.length} fragmentos.`);

await crearEsquema();
// Un INSERT agrega filas: si no vaciamos antes, reindexar duplica todo.
await vaciar();

let hechos = 0;
for (const lote of agrupar(fragmentos, 100)) {
  const vectores = await embeddingsEnLote(lote.map(textoParaEmbedding));
  for (let i = 0; i < lote.length; i++) await insertar(lote[i], vectores[i]);
  hechos += lote.length;
  console.log(`  ${hechos}/${fragmentos.length}`);
}

console.log(`Listo. Filas en la tabla: ${await contar()}.`);
await pool.end();
