// Troceado por estructura (clase 7): un fragmento por artículo, con metadatos.
// El título (TÍTULO III — ...) y el número de artículo los pone el programa,
// no dependen de que el modelo los "lea" dentro del texto.

const RE_TITULO = /^TÍTULO\s+[IVXLC]+\s+—\s+.+$/;
const RE_ARTICULO = /^Artículo\s+(\d+)\.\s*(.*)$/;

export function trocearPorArticulo(texto, archivo) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  const fragmentos = [];
  let titulo = null;
  let actual = null;

  const cerrar = () => {
    if (!actual) return;
    actual.texto = actual.lineas.join('\n').trim();
    delete actual.lineas;
    fragmentos.push(actual);
    actual = null;
  };

  for (const linea of lineas) {
    const l = linea.trim();
    if (RE_TITULO.test(l)) {
      cerrar();
      titulo = l;
      continue;
    }
    const m = l.match(RE_ARTICULO);
    if (m) {
      cerrar();
      actual = {
        archivo,
        titulo,
        articulo: Number(m[1]),
        nombre: m[2].trim(),
        lineas: [l],
      };
      continue;
    }
    if (actual && l) actual.lineas.push(l);
  }
  cerrar();
  return fragmentos;
}

// Texto que se manda a embeber: el contenido con su contexto (título + nombre).
export function textoParaEmbedding(f) {
  return `${f.titulo ?? ''}\nArtículo ${f.articulo}: ${f.nombre}\n${f.texto}`;
}

export function agrupar(lista, tamano) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}
