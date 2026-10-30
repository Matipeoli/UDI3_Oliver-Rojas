import { config } from './config.mjs';

// Embeddings en lote contra Ollama (modelo local bge-m3): un solo pedido HTTP
// con una lista de textos; vuelve una lista de vectores en el mismo orden.
export async function embeddingsEnLote(textos) {
  let res;
  try {
    res = await fetch(`${config.ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.embModel, input: textos }),
    });
  } catch {
    throw new Error(
      `No pude conectar con Ollama en ${config.ollamaUrl}. ¿Está abierto? (ollama pull ${config.embModel})`,
    );
  }
  if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${await res.text()}`);
  const { embeddings } = await res.json();
  for (const v of embeddings) {
    if (v.length !== config.dimensiones) {
      throw new Error(
        `El modelo devolvió ${v.length} números pero DIMENSIONES=${config.dimensiones} (y la columna VECTOR(n)). Tienen que coincidir.`,
      );
    }
  }
  return embeddings;
}

export async function embedding(texto) {
  const [v] = await embeddingsEnLote([texto]);
  return v;
}

// Similitud coseno a mano (clase 6): producto punto / producto de las normas.
export function coseno(a, b) {
  let punto = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return punto / (Math.sqrt(na) * Math.sqrt(nb));
}
