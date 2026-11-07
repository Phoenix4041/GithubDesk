import { describe, expect, it } from "vitest";
import { normalizeForSearch, rankItems, scoreItem } from "./command-model";

const items = [
  { title: "Nueva rama", keywords: "branch crear" },
  { title: "Abrir repositorio", keywords: "open carpeta" },
  { title: "Hacer fetch", keywords: "traer remoto" },
  { title: "Ir a Historial" },
  { title: "Guardar en stash", keywords: "alijo" },
];

describe("normalizeForSearch", () => {
  it("lowers case and removes accents", () => {
    expect(normalizeForSearch("Configuración")).toBe("configuracion");
    expect(normalizeForSearch("ÁRBOL")).toBe("arbol");
  });
});

describe("rankItems", () => {
  it("keeps the original order for an empty query", () => {
    expect(rankItems(items, "  ").map((item) => item.title)).toEqual(items.map((item) => item.title));
  });

  it("matches ignoring accents and case", () => {
    expect(rankItems(items, "hist").map((item) => item.title)).toEqual(["Ir a Historial"]);
    expect(rankItems(items, "REPOSITORIO").map((item) => item.title)).toEqual(["Abrir repositorio"]);
  });

  it("prefers word starts over matches in the middle", () => {
    const list = [{ title: "Reabrir" }, { title: "Abrir repositorio" }];
    expect(rankItems(list, "abrir").map((item) => item.title)).toEqual(["Abrir repositorio", "Reabrir"]);
  });

  it("searches the extra keywords", () => {
    expect(rankItems(items, "branch").map((item) => item.title)).toEqual(["Nueva rama"]);
    expect(rankItems(items, "alijo").map((item) => item.title)).toEqual(["Guardar en stash"]);
  });

  it("requires every word to match", () => {
    expect(rankItems(items, "nueva rama").map((item) => item.title)).toEqual(["Nueva rama"]);
    expect(rankItems(items, "nueva fetch")).toEqual([]);
  });

  it("accepts loose subsequences for longer queries", () => {
    expect(rankItems(items, "hcfth").map((item) => item.title)).toEqual(["Hacer fetch"]);
    expect(rankItems(items, "zzz")).toEqual([]);
  });

  it("keeps ties in their original order", () => {
    const list = [{ title: "Aa one" }, { title: "Aa two" }];
    expect(rankItems(list, "aa").map((item) => item.title)).toEqual(["Aa one", "Aa two"]);
  });
});

describe("scoreItem", () => {
  it("returns zero without tokens and null for no match", () => {
    expect(scoreItem({ title: "Algo" }, "")).toBe(0);
    expect(scoreItem({ title: "Algo" }, "xyz")).toBeNull();
  });
});
