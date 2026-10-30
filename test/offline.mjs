// Pruebas que no necesitan Ollama, Postgres ni API.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trocearPorArticulo, agrupar } from '../src/trocear.mjs';
import { coseno } from '../src/embeddings.mjs';
import { armarPrompt } from '../src/generar.mjs';

// coseno con casos conocidos (clase 6)
assert.equal(coseno([1, 0], [1, 0]), 1);
assert.equal(coseno([1, 0], [0, 1]), 0);
assert.equal(coseno([1, 0], [-1, 0]), -1);
assert.ok(Math.abs(coseno([1, 2], [2, 4]) - 1) < 1e-12, 'el largo no cambia el coseno');

// agrupar
assert.deepEqual(agrupar([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

// trocear por artículo sobre el corpus real
const texto = await readFile(new URL('../corpus/truco.txt', import.meta.url), 'utf8');
const fr = trocearPorArticulo(texto, 'truco.txt');
assert.equal(fr.length, 56, 'un fragmento por artículo');
assert.deepEqual(fr.map((f) => f.articulo), Array.from({ length: 56 }, (_, i) => i + 1));
assert.ok(fr.every((f) => f.titulo?.startsWith('TÍTULO')), 'todos con su título');
assert.ok(fr.every((f) => f.texto.startsWith(`Artículo ${f.articulo}.`)), 'cada texto arranca en su artículo');
assert.equal(fr[14].nombre, 'Tabla de puntos del truco');
assert.ok(fr[14].titulo.includes('EL TRUCO'));
assert.ok(fr[40].titulo.includes('URUGUAYO'));

// el prompt tiene los cinco ejes y las fuentes
const { sistema, usuario } = armarPrompt('¿Cuánto vale el truco?', [fr[12]]);
assert.match(sistema, /únicamente/);
assert.match(sistema, /no lo especifica/);
assert.match(usuario, /Fuente: truco\.txt — Artículo 13/);

console.log(`OK: ${fr.length} fragmentos, coseno, agrupar y prompt verificados.`);
