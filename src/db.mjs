import pg from 'pg';
import { config } from './config.mjs';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// pgvector recibe el vector como texto: '[0.1,0.2,...]'
export const aVector = (v) => `[${v.join(',')}]`;

export async function crearEsquema() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fragmentos (
      id        SERIAL PRIMARY KEY,
      archivo   TEXT NOT NULL,
      titulo    TEXT,
      articulo  INT,
      nombre    TEXT,
      texto     TEXT NOT NULL,
      embedding VECTOR(${config.dimensiones}) NOT NULL
    )`);
  // HNSW: búsqueda aproximada por grafo de vecinos, con distancia coseno.
  await pool.query(
    'CREATE INDEX IF NOT EXISTS fragmentos_hnsw ON fragmentos USING hnsw (embedding vector_cosine_ops)',
  );
}

export async function vaciar() {
  await pool.query('TRUNCATE fragmentos RESTART IDENTITY');
}

export async function insertar(f, vector) {
  await pool.query(
    `INSERT INTO fragmentos (archivo, titulo, articulo, nombre, texto, embedding)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [f.archivo, f.titulo, f.articulo, f.nombre, f.texto, aVector(vector)],
  );
}

// <=> es DISTANCIA coseno (0 = idénticos). Se ordena por distancia ascendente;
// la similitud que se muestra es 1 - distancia.
export async function masParecidos(vector, k) {
  const { rows } = await pool.query(
    `SELECT archivo, titulo, articulo, nombre, texto,
            1 - (embedding <=> $1) AS similitud
       FROM fragmentos
   ORDER BY embedding <=> $1
      LIMIT $2`,
    [aVector(vector), k],
  );
  return rows.map((r) => ({ ...r, similitud: Number(r.similitud) }));
}

export async function contar() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM fragmentos');
  return rows[0].n;
}
