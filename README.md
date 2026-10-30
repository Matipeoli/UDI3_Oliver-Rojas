# El Viejo del Truco — RAG con front

Postgres + pgvector, embeddings locales (bge-m3 vía Ollama), generación con Gemini. Ver `EXPOSICION.md` para la explicación paso a paso.

## Puesta en marcha

1. Instalar [Ollama](https://ollama.com) y bajar el modelo: `ollama pull bge-m3`
2. Copiar `.env.example` a `.env` y pegar la `GEMINI_API_KEY` (Google AI Studio).
3. Levantar la base: `npm run db` (necesita Docker abierto).
4. Indexar el corpus: `npm run indexar`
5. Calibrar el umbral y ponerlo en `.env`: `npm run calibrar`
6. Arrancar: `npm start` y abrir <http://localhost:3000>

`npm test` corre pruebas que no necesitan nada de lo anterior.

