import 'dotenv/config';

export const config = {
  geminiKey: process.env.GEMINI_API_KEY,
  genModel: process.env.GEN_MODEL ?? 'gemini-2.5-flash',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  embModel: process.env.EMB_MODEL ?? 'bge-m3',
  dimensiones: Number(process.env.DIMENSIONES ?? 1024),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://rag:rag@localhost:5432/rag',
  k: Number(process.env.K ?? 3),
  umbral: Number(process.env.UMBRAL ?? 0.5),
  puerto: Number(process.env.PORT ?? 3000),
};
