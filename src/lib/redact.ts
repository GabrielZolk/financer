/**
 * Máscara de dado sensível antes de qualquer coisa sair do aparelho.
 *
 * O extrato (PDF/OFX/CSV) é lido aqui e nunca é enviado. Mas as DESCRIÇÕES
 * podem ir pra IA na hora de categorizar, e descrição de banco costuma trazer
 * CPF, número de conta, cartão e e-mail no meio do texto. Nada disso ajuda a
 * dizer se a compra é "Mercado" ou "Transporte" — então sai.
 *
 * O que NÃO é mascarado: nome de estabelecimento e palavras comuns (é
 * exatamente o que a IA precisa pra acertar a categoria) e valores/datas
 * (que já vão em campo próprio).
 */

const RULES: { re: RegExp; to: string }[] = [
  // e-mail
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, to: "[email]" },
  // CPF: 123.456.789-00 ou 12345678900
  { re: /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/g, to: "[cpf]" },
  // CNPJ: 12.345.678/0001-90
  { re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{2}\b/g, to: "[cnpj]" },
  // cartão mascarado pelo próprio banco (**** 1234) e afins
  // (sem \b na frente: '*' não é caractere de palavra, a borda nunca casaria)
  { re: /[*x]{2,}[\s.-]?\d{3,4}\b/gi, to: "[cartao]" },
  // agência/conta explícitas
  { re: /\b(ag(encia|\.)?|c\/c|conta)\s*:?\s*\d[\d.\-/]{3,}/gi, to: "[conta]" },
  // sequência longa de dígitos (conta, cartão, id de transação, CPF sem máscara)
  { re: /\b\d[\d.\-/]{9,}\b/g, to: "[num]" },
  { re: /\b\d{11,}\b/g, to: "[num]" },
];

/** Aplica as máscaras numa descrição. */
export function redactDescription(description: string): string {
  let out = description;
  for (const { re, to } of RULES) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

/** Aplica em lote e diz se alguma coisa foi de fato mascarada. */
export function redactAll(descriptions: string[]): {
  redacted: string[];
  changed: number;
} {
  let changed = 0;
  const out = descriptions.map((d) => {
    const r = redactDescription(d);
    if (r !== d.replace(/\s+/g, " ").trim()) changed++;
    return r;
  });
  return { redacted: out, changed };
}
