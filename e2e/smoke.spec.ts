import { test, expect } from "@playwright/test";

// Cada teste roda num contexto novo (IndexedDB limpo) → o app semeia dados padrão.

test("abre o app e mostra o painel inicial", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  await expect(page.getByText("Saldo consolidado")).toBeVisible();
});

test("contas padrão são semeadas", async ({ page }) => {
  await page.goto("/#/accounts");
  await expect(page.getByText("Carteira")).toBeVisible();
  await expect(page.getByText("Conta Corrente")).toBeVisible();
  await expect(page.getByText("Patrimônio líquido")).toBeVisible();
});

test("criar um lançamento reflete na lista", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saldo consolidado")).toBeVisible();

  await page.getByRole("button", { name: /Lançar/ }).click();
  await expect(page.getByRole("heading", { name: "Novo lançamento" })).toBeVisible();

  await page.getByPlaceholder("0,00").first().fill("123,45");
  await page.getByRole("button", { name: "Salvar" }).click();

  // celebração some; vai pra Lançamentos e confere o valor
  await page.getByRole("link", { name: "Lançamentos" }).click();
  await expect(page.getByText("-R$ 123,45").first()).toBeVisible();
});

test("botão de feedback abre o modal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enviar feedback" }).click();
  await expect(page.getByRole("heading", { name: "Enviar feedback" })).toBeVisible();
  await expect(page.getByPlaceholder("Sua mensagem…")).toBeVisible();
});

test("navegação entre as abas funciona", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["Orçamento", "Metas", "Relatórios", "Ajustes"]) {
    await page.getByRole("link", { name: tab }).click();
    await expect(page.getByRole("heading", { name: tab })).toBeVisible();
  }
});
