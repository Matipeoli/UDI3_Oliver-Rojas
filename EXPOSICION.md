# Exposición final — Tu RAG, con cara: *El Viejo del Truco*

Un asistente que responde dudas sobre el reglamento del Truco argentino y sus variantes por país (Uruguay, Brasil, Paraguay, Venezuela, Cataluña). Es el RAG de la clase 8 (Postgres + pgvector, embeddings locales, umbral, respuesta con fuente) con un front web.

> El corpus (`corpus/truco.txt`) se armó investigando fuentes públicas (Pagat, Wikipedia, Sitio Andino, Focus); no es un reglamento oficial, y donde las fuentes se contradicen o no hay datos, el texto lo dice (Chile, Bolivia, Perú e Italia no están cubiertos). Es un ejemplo: Si lo cambiás por el tuyo, todo lo de abajo se sostiene igual; solo cambian los ejemplos y hay que **recalibrar el umbral** (paso 7).

---

## 0. La idea en una frase

Un modelo de lenguaje **no recuerda: predice** (clase 4), y por eso inventa con la misma seguridad con la que acierta. Un RAG deja de pedirle que recuerde y le pide que **lea**: busca los fragmentos relevantes en una fuente propia y se los pega en la entrada antes de que responda.

## 1. Mapa del sistema

```
INDEXAR (una vez)                         CONSULTAR (cada pregunta)
corpus/truco.txt                          navegador (public/index.html)
   │ trocearPorArticulo                      │  POST /api/preguntar
   ▼                                         ▼
56 fragmentos + metadatos                 server.mjs  (acá vive la clave)
   │ embeddingsEnLote (Ollama, bge-m3)       │ embedding de la pregunta (Ollama)
   ▼                                         ▼
Postgres + pgvector  ◄────────────────── búsqueda top-k por distancia coseno (HNSW)
   tabla fragmentos VECTOR(1024)             │ umbral ─ ¿alguno pasa? no → "no lo especifica"
                                             ▼ sí
                                          prompt de 5 ejes + fragmentos
                                             │ Gemini (API)
                                             ▼
                                          respuesta + fuentes → el front las muestra
```

**Reparto local / nube** (pregunta típica del jurado):

| Parte | Dónde corre | Por qué |
|---|---|---|
| Embeddings (`bge-m3`) | Tu compu (Ollama) | Procesa el texto una sola vez, modelo chico (~570 M de parámetros). |
| Base de vectores | Tu compu (Docker) | Los datos no salen. |
| Generación (Gemini) | Nube (API) | Genera token por token y necesita un modelo mucho más grande. |

## 2. Paso 1 — Elegir y trocear el corpus (`src/trocear.mjs`)

- **Qué hace:** parte el reglamento en un fragmento **por artículo** (56 en total). Cada uno lleva metadatos: archivo, `TÍTULO` al que pertenece, número y nombre del artículo.
- **Por qué no tamaño fijo (clase 5):** el corte por cantidad de caracteres separa el número de un artículo de su contenido, mezcla varios temas en un mismo vector y obliga a solapar texto. Con la estructura que el documento ya tiene, cada fragmento es una unidad de sentido completa y **no hace falta solapamiento**.
- **Ventaja para la fuente:** el número de artículo lo pone el programa, no depende de que el modelo lo "lea" dentro del texto. Por eso la cita siempre es verificable.
- **Detalle:** a lo que se embebe se le antepone el título y el nombre del artículo (`textoParaEmbedding`), así "DEL ENVIDO" también cuenta en el significado.

## 3. Paso 2 — Embeddings en la propia compu (`src/embeddings.mjs`)

- Un **embedding** convierte un texto en una lista de números (vector) que funciona como sus coordenadas en un mapa de significados: textos parecidos quedan cerca **aunque no compartan palabras**. Es la hipótesis distribucional (Harris, Firth).
- `bge-m3` devuelve **1024** números sin importar si el texto es una palabra o una página: la dimensión la fija el modelo.
- **En lote:** `embeddingsEnLote` manda los 56 textos en **un** pedido HTTP, no 56. Se ahorran viajes de ida y vuelta (no plata). El tope por lote es 100; `agrupar` parte listas más grandes.
- **Trampa 1:** la columna `VECTOR(1024)` exige exactamente 1024 números. Si el modelo devuelve otra cantidad, se corta con un error claro.
- **Trampa 2:** indexar con un modelo y preguntar con otro **no da error, pero no significa nada**. Por eso `EMB_MODEL` es una sola variable usada en los dos momentos.

## 4. Paso 3 — Guardar en Postgres + pgvector (`src/db.mjs`)

- **Por qué una base y no `indice.json`:** el JSON se lee entero aunque se usen pocos fragmentos, lo usa un programa a la vez y no sabe buscar (lo hace tu código comparando contra todos).
- La tabla `fragmentos` guarda el texto, los metadatos y `embedding VECTOR(1024)`.
- **Índice HNSW** (`vector_cosine_ops`): arma un grafo de vecinos en varios niveles (pocos puntos arriba con saltos largos, todos abajo con saltos cortos). Buscar es ir saltando de vecino en vecino acercándose a la pregunta, **sin mirar a todos**. Es búsqueda **aproximada**: a cambio de velocidad puede no devolver exactamente el más cercano. Con 56 fragmentos no se nota; importa con cientos de miles.
- **Reindexar:** `indexar.mjs` hace `TRUNCATE` antes de insertar. Sin eso, un `INSERT` **agrega** filas y el corpus quedaría duplicado (el mismo fragmento repetido en el top-3).
- **Docker:** la base corre en un contenedor, y los datos viven en un *volumen* que sobrevive aunque el contenedor se apague.

## 5. Paso 4 — Buscar por significado (`masParecidos`)

```sql
SELECT ..., 1 - (embedding <=> $1) AS similitud
  FROM fragmentos ORDER BY embedding <=> $1 LIMIT 3
```

- **Similitud coseno:** producto punto dividido por el producto de las normas. Mide hacia dónde apuntan dos vectores, ignorando su largo: 1 = mismo significado, 0 = sin relación, −1 = opuestos. (Está programada a mano en `coseno` y verificada con casos conocidos en `npm test`.)
- **¿Por qué el `ORDER BY` usa distancia y no similitud?** Porque `<=>` es la **distancia** coseno (1 − similitud), y el índice HNSW está construido sobre esa distancia. Ordenar por distancia **ascendente** es lo mismo que por similitud descendente, pero es la forma que el índice puede usar. Para mostrarla al usuario se convierte: `1 - distancia`.
- Devuelve los **k = 3** más cercanos.

## 6. Paso 5 — Umbral: la primera barrera contra inventar (`src/rag.mjs`)

- La búsqueda **siempre** devuelve k resultados, aunque ninguno sirva. El umbral descarta los de similitud menor a `UMBRAL` **antes de llegar al modelo**; si no pasa ninguno, se responde "El reglamento no lo especifica." sin gastar una llamada a la API.
- **Dos tipos de error:** *falso positivo* (pasa un fragmento que no sirve → riesgo de invención) y *falso negativo* (se descarta uno que sí servía → "no lo especifica" de más).
- **Mi elección:** prefiero el falso negativo. Para un asistente de reglas, pedirle al usuario que reformule cuesta menos que darle una regla inventada con aire oficial.
- **Es específico del modelo:** el umbral de la clase 7 (modelo de Google) no sirve con `bge-m3`. Hay que medirlo de nuevo (paso 7).

## 7. Paso 6 — Calibrar el umbral con evidencia (`npm run calibrar`)

`scripts/calibrar.mjs` mide la similitud del mejor fragmento para preguntas que **sí** están y que **no** están, sin llamar a Gemini, y las ordena en una recta. Si las dos nubes no se superponen, sugiere el punto medio; si se superponen, no existe corte perfecto y hay que elegir qué error cometer.

> **Completar antes de exponer:** corré `npm run calibrar`, pegá acá los números reales y el `UMBRAL` que elegiste y por qué.
>
> | Pregunta | Sí/No está | Similitud |
> |---|---|---|
> | … | … | … |
>
> Umbral elegido: `____`

## 8. Paso 7 — El prompt: la segunda barrera (`src/generar.mjs`)

Los **cinco ejes** (clase 5):

| Eje | En este proyecto |
|---|---|
| Rol | Asistente sobre el reglamento del Truco. |
| Contexto | Los fragmentos recuperados, cada uno rotulado `[Fuente: archivo — Artículo N]`. |
| Tarea | Responder la pregunta usando solo esos fragmentos. |
| Restricciones | Sin conocimiento propio ni reglas inventadas; si no está, responder exactamente "El reglamento no lo especifica." |
| Formato | Castellano rioplatense, máximo 4 oraciones, terminar con "Fuente: Artículo N". |

- **Dos capas, ninguna infalible sola:** el umbral corta lo que ni se parece; el prompt cubre lo que pasó el umbral pero no contiene la respuesta (p. ej. un artículo del mismo tema que no responde esa duda puntual).
- `temperature: 0.2` para respuestas previsibles (clase 3: baja temperatura = menos variación).

## 9. Paso 8 — El servidor y por qué la clave no va en el navegador (`server.mjs`)

- Todo lo que llega al navegador es visible para quien abra las herramientas de desarrollo. Una clave de API puesta ahí se puede robar y usar a tu costa.
- Por eso el front solo llama a `POST /api/preguntar` de **tu** servidor Node; el servidor es quien tiene el `.env` (que no se sube a ningún repositorio) y habla con Gemini y con la base.
- Además valida la pregunta (no vacía, máx. 500 caracteres).

## 10. Paso 9 — El front (`public/index.html`)

Un "tapete" de truco con un personaje, *el Viejo*. Cumple las tres reglas no negociables:

1. **Usa el RAG real:** misma búsqueda en Postgres, mismo umbral, misma generación; el front no tiene lógica propia.
2. **La clave no está en el navegador:** todo pasa por `server.mjs`.
3. **Muestra de dónde sale la respuesta:** cada respuesta trae tarjetas desplegables con **archivo, artículo, nombre del artículo, similitud y el texto citado**, para verificar a mano.

Además tiene un panel **"Diagnóstico"** en cada respuesta: lista los 3 candidatos con su similitud y si pasan o no el umbral. Sirve para la parte de la demo donde hay que decir si una falla fue de la búsqueda o del modelo. Cuando no hay respuesta, una etiqueta aclara **cuál de las dos barreras** actuó (umbral o prompt).

## 11. Guion de la demo en vivo

1. **El corpus:** reglamento del Truco y sus variantes por país, 56 artículos, 12 títulos.
2. **El front:** abrir `http://localhost:3000`, mostrar el contador de fragmentos y el umbral.
3. **Una pregunta que funciona:** *"¿Cuántos puntos gano si el otro no quiere el truco?"* → artículos 13 a 15. Abrir la tarjeta y mostrar que el texto lo dice. Nota: la pregunta casi no repite palabras del artículo ("no quiero" ≠ "no querido"), pero la encuentra por significado.
4. **Una pregunta que no está:** *"¿Cuánto cuesta un mazo?"* → "El reglamento no lo especifica." Mostrar en el diagnóstico que ningún fragmento pasó el umbral.
5. **Una pregunta que falla:** elegir una real durante los ensayos (ver abajo) y diagnosticar con el panel: ¿el fragmento correcto estaba entre los 3 candidatos? Si **no**, falló la búsqueda (troceado, umbral o embedding). Si **sí** estaba y el modelo igual respondió mal, falló la generación (prompt o modelo).
6. **Mis estrategias:** troceado por artículo (56 artículos vs. tamaño fijo), umbral calibrado con evidencia, prompt de cinco ejes.

**Candidatas a "pregunta que falla"** (probalas antes y quedate con la que realmente falle; no la inventes):
- Preguntas que combinan dos artículos, p. ej. *"Si me voy al mazo en medio de un truco y había un envido, ¿cuántos puntos pierdo?"* (artículos 17 y 23).
- Preguntas con un término que el texto no usa, p. ej. *"¿Qué es el macho?"* (en el artículo 8 está, pero en una oración secundaria).
- Preguntas sobre variantes regionales que el reglamento no cubre.

## 12. Preguntas técnicas probables y respuesta corta

- **¿Qué es un embedding?** Un vector de 1024 números que ubica un texto en un mapa de significados.
- **¿Qué mide la similitud coseno?** El ángulo entre dos vectores: la dirección, no el largo.
- **¿Por qué no alcanza con pegar todo el corpus?** Puede no entrar en la ventana; se reenvía y se paga en cada turno; y el modelo aprovecha mal lo que cae en el medio (*lost in the middle*).
- **¿Cómo encuentra HNSW los fragmentos sin mirar todos?** Grafo de vecinos en niveles; se salta de vecino en vecino. Es aproximado.
- **¿Qué evita que el modelo invente?** Dos capas: el umbral (antes del modelo) y la restricción del prompt (dentro del modelo). Ninguna es perfecta sola.
- **¿Por qué el `ORDER BY` usa distancia?** `<=>` es distancia y el índice HNSW está definido sobre ella; ordenar ascendente por distancia equivale a descendente por similitud.
- **¿Qué pasa si reindexo?** `TRUNCATE` antes del `INSERT`, si no se duplican las filas.
- **¿Por qué la clave no va en el navegador?** Cualquiera podría verla y usarla; vive en el servidor.
- **¿Qué cambia si cambio el modelo de embeddings?** Dimensión (columna y `.env`), reindexar todo y recalibrar el umbral.
- **¿Qué falta para producción?** Reranking, búsqueda híbrida (significado + palabras clave), actualización incremental y medición formal con un set de preguntas con respuesta conocida.
