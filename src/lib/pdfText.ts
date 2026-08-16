/**
 * Extração do TEXTO de um PDF, 100% no aparelho.
 *
 * O arquivo nunca sai do dispositivo: o pdf.js roda no navegador, a gente lê o
 * texto e só as DESCRIÇÕES já revisadas por você podem (opcionalmente) ir pra
 * IA na hora de categorizar. O PDF em si nunca é enviado pra lugar nenhum.
 *
 * O pdf.js é pesado (~1 MB), então entra por import dinâmico: só baixa quando
 * alguém realmente abre um PDF.
 */

/** PDF protegido por senha (extrato de banco costuma vir assim). */
export class PdfPasswordRequired extends Error {
  /** true quando a senha foi informada e está errada */
  readonly wrong: boolean;
  constructor(wrong = false) {
    super(wrong ? "pdf_password_wrong" : "pdf_password_required");
    this.wrong = wrong;
  }
}

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * Devolve o texto do PDF com as linhas remontadas.
 *
 * O pdf.js entrega pedaços soltos com coordenadas, não linhas. Agrupamos por
 * posição vertical (com tolerância, porque a mesma linha varia alguns décimos)
 * e ordenamos pela horizontal — sem isso a data, o histórico e o valor saem
 * embaralhados e nenhum parser acerta.
 */
export async function pdfToText(file: File, password?: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data, password }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") {
      // code 2 = senha informada está incorreta; 1 = precisa de senha
      throw new PdfPasswordRequired(err.code === 2);
    }
    throw e;
  }

  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as unknown as TextItem[];

    const lines = new Map<number, { x: number; str: string }[]>();
    for (const item of items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5] / 3); // tolerância de ~3pt
      const arr = lines.get(y) ?? [];
      arr.push({ x: item.transform[4], str: item.str });
      lines.set(y, arr);
    }

    const ordered = [...lines.entries()]
      .sort((a, b) => b[0] - a[0]) // de cima pra baixo
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);

    pages.push(ordered.join("\n"));
    page.cleanup();
  }

  await doc.destroy();
  return pages.join("\n");
}
