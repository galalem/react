import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReactLocalizationPlugin } from "../src/vite";

let root: string;

beforeAll(() => {
  // A throwaway project root with two locale folders.
  root = fs.mkdtempSync(path.join(os.tmpdir(), "galalem-i18n-"));
  fs.mkdirSync(path.join(root, "lang"), { recursive: true });
  fs.writeFileSync(path.join(root, "lang", "en.json"), '{ "hello": "Hello" }');
  fs.writeFileSync(path.join(root, "lang", "es.json"), '{ "hello": "Hola" }');
  fs.mkdirSync(path.join(root, "src", "lang"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "lang", "en.json"), '{ "hi": "Hi" }');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const IMPORT = 'import { init } from "@galalem/react-localization";\n';

/** Run the plugin's transform hook against `code`, as Vite would. */
function transform(code: string, file = "main.ts") {
  const plugin = ReactLocalizationPlugin();
  (plugin.configResolved as (config: { root: string }) => void)({ root });

  const addWatchFile = vi.fn();
  // Rollup/Vite's this.error() throws to abort the transform; mirror that here
  // so tests can assert via toThrow(...).
  const error = (payload: string | { message: string }) => {
    throw new Error(typeof payload === "string" ? payload : payload.message);
  };
  const result = (plugin.transform as (this: unknown, code: string, id: string) => { code: string } | undefined)
    .call({ addWatchFile, error }, code, path.join(root, file));

  return { code: result?.code, addWatchFile };
}

describe("ReactLocalizationPlugin", () => {
  it("rewrites init({ folder }) into a loader map", () => {
    const { code, addWatchFile } = transform(IMPORT + 'init({ folder: "lang" });');
    expect(code).toContain('"en": () => import("./lang/en.json")');
    expect(code).toContain('"es": () => import("./lang/es.json")');
    expect(addWatchFile).toHaveBeenCalledWith(path.join(root, "lang", "en.json"));
    expect(addWatchFile).toHaveBeenCalledWith(path.join(root, "lang", "es.json"));
    // Directory itself must NOT be registered — Vite's import-analysis would
    // try to resolve it as a module.
    expect(addWatchFile).not.toHaveBeenCalledWith(path.join(root, "lang"));
  });

  it("rewrites init() using the default src/lang folder", () => {
    const { code } = transform(IMPORT + "init();");
    expect(code).toContain('"en": () => import("./src/lang/en.json")');
  });

  it("supports aliased imports", () => {
    const code = 'import { init as t } from "@galalem/react-localization";\nt({ folder: "lang" });';
    const out = transform(code).code;
    expect(out).toContain("t({");
    expect(out).toContain('import("./lang/en.json")');
  });

  it("supports namespace imports", () => {
    const code = 'import * as i18n from "@galalem/react-localization";\ni18n.init({ folder: "lang" });';
    const out = transform(code).code;
    expect(out).toContain("i18n.init({");
    expect(out).toContain('import("./lang/en.json")');
  });

  it("ignores unrelated member calls like obj.init()", () => {
    const { code } = transform(IMPORT + "obj.init();");
    expect(code).toBeUndefined();
  });

  it("preserves a trailing settings argument", () => {
    const { code } = transform(IMPORT + 'init({ folder: "lang" }, { storageKey: "k" });');
    expect(code).toContain("storageKey");
    expect(code).toContain('import("./lang/en.json")');
  });

  it("skips files that don't import init from the package", () => {
    const { code } = transform('init({ folder: "lang" });'); // no import
    expect(code).toBeUndefined();
  });

  it("throws on a dynamic folder value (variable)", () => {
    const code = IMPORT + 'const F = "lang"; init({ folder: F });';
    expect(() => transform(code)).toThrow(/must be a string literal/);
  });

  it("throws on a template-literal folder value", () => {
    const code = IMPORT + "init({ folder: `lang` });";
    expect(() => transform(code)).toThrow(/must be a string literal/);
  });
});