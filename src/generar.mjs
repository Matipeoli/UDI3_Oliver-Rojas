import { config } from './config.mjs';

// Los cinco ejes del prompt (clase 5): Rol, Contexto, Tarea, Restricciones, Formato.
export function armarPrompt(pregunta, fragmentos) {
  const contexto = fragmentos
    .map((f) => `[Fuente: ${f.archivo} — Artículo ${f.articulo}: ${f.nombre}]\n${f.texto}`)
    .join('\n\n---\n\n');

  const sistema = [
    // Rol
    'Sos un asistente que responde dudas sobre el reglamento del Truco y sus variantes por país.',
    // Tarea
    'Respondé la pregunta del usuario usando únicamente los fragmentos del reglamento que se te entregan.',
    // Restricciones
    'No uses conocimiento propio ni inventes reglas. Si los fragmentos no contienen la respuesta, respondé exactamente: "El reglamento no lo especifica." y nada más.',
    // Formato
    'Si la pregunta no nombra un país, respondé según el truco argentino; si la regla cambia según el país o la mesa, aclaralo. Si la pregunta es de un país que los fragmentos no cubren, decí que no está cubierto.',
    'Respondé en castellano rioplatense, breve y directo (máximo 5 oraciones) y terminá citando la fuente con el formato "Fuente: Artículo N" (podés citar varios).',
  ].join('\n');

  // Contexto
  const usuario = `FRAGMENTOS DEL REGLAMENTO:\n\n${contexto}\n\nPREGUNTA: ${pregunta}`;
  return { sistema, usuario };
}

export async function generar(pregunta, fragmentos) {
  if (!config.geminiKey) throw new Error('Falta GEMINI_API_KEY en el .env');
  const { sistema, usuario } = armarPrompt(pregunta, fragmentos);

  // La clave viaja en un header desde el servidor: nunca llega al navegador.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.genModel}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: usuario }] }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini respondió ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const texto = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!texto) throw new Error('Gemini no devolvió texto (¿bloqueo de seguridad?).');
  return texto;
}
