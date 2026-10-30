// Servidor Node: sirve el front y expone el RAG real. La clave de API vive acá, no en el navegador.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { preguntar } from './src/rag.mjs';
import { contar } from './src/db.mjs';

const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

app.get('/api/estado', async (_req, res) => {
  try {
    res.json({ fragmentos: await contar(), umbral: config.umbral, k: config.k, modelo: config.genModel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/preguntar', async (req, res) => {
  const pregunta = String(req.body?.pregunta ?? '').trim();
  if (!pregunta) return res.status(400).json({ error: 'Escribí una pregunta.' });
  if (pregunta.length > 500) return res.status(400).json({ error: 'Pregunta demasiado larga (máx. 500).' });
  try {
    res.json(await preguntar(pregunta));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(config.puerto, () => console.log(`RAG Truco en http://localhost:${config.puerto}`));
