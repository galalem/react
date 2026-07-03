// vite.ts — build-time loader codegen for @galalem/react-localization.
//
// Rewrites the authoring sugar
//   init()                          // → uses the default folder (src/lang)
//   init({ folder: "./locales" })   // → uses the given folder
// into an explicit lazy loader map
//   init({ "en": () => import("...en.json"), ... })
//
// Only the first argument is rewritten, so a trailing settings argument
// (e.g. init({ folder: "x" }, { storageKey })) is preserved. Folders resolve
// from the Vite project root; emitted import specifiers are relative to the
// calling file, as bundlers require.

import fs from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import type { Plugin } from "vite";

const PKG = "@galalem/react-localization";
const DEFAULT_FOLDER = "src/lang";

/** Only scan real JS/TS(X) modules. */
const SCANNABLE = /\.(?:[cm]?[jt]sx?)$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve how `init` is referenced in a module, honouring aliased and namespace
 * imports. Returns the callee expression (e.g. `init`, `i18nInit`, `i18n.init`)
 * or `undefined` if the module doesn't import it from this package.
 */
function resolveInitCallee(code: string): string | undefined {
  const pkg = escapeRe(PKG);

  // import * as ns from "pkg"  →  ns.init
  const ns = code.match(new RegExp(`import\\s*\\*\\s*as\\s+([\\w$]+)\\s+from\\s*['"]${pkg}['"]`));
  if (ns) return `${ns[1]}.init`;

  // import { init [as alias], ... } from "pkg"
  const named = code.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${pkg}['"]`));
  if (named) {
    const binding = named[1].match(/\binit\b(?:\s+as\s+([\w$]+))?/);
    if (binding) return binding[1] ?? "init";
  }

  return undefined;
}

export function ReactLocalizationPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "galalem-react-localization",

    configResolved(config) {
      root = config.root;
    },

    transform(code, id) {
      if (id.includes("\0") || id.includes("/node_modules/")) return;
      if (!SCANNABLE.test(id)) return;
      if (!code.includes("init")) return;

      const callee = resolveInitCallee(code);
      if (!callee) return;

      // Namespace calls (`ns.init`) include a dot; a bare identifier must NOT be
      // a property access, so guard it with a negative lookbehind for ".".
      const member = callee.includes(".");
      const calleeRe = member ? `\\b${escapeRe(callee)}` : `(?<!\\.)\\b${escapeRe(callee)}`;

      // <callee>({ folder: "..." } ...) — capture the prefix and the folder object.
      const folderRe = new RegExp(
        `(${calleeRe}\\s*\\(\\s*)(\\{\\s*folder\\s*:\\s*(['"])(.*?)\\3\\s*,?\\s*\\})`,
        "g",
      );
      // <callee>() — no args, use the default folder.
      const emptyRe = new RegExp(`${calleeRe}\\s*\\(\\s*\\)`, "g");
      // <callee>({ folder: <non-string> ... }) — a dynamic folder value the plugin
      // can't inline. The trailing `[^\s}]` forces `\s*` to actually consume all
      // whitespace before the check (else it can backtrack to 0 and the negative
      // lookahead sees whitespace, not the real value). The lookahead rejects
      // quoted string literals — those are handled by folderRe. Without this
      // check, dynamic shapes slip through to runtime, which throws a misleading
      // "needs the Vite plugin" error even though the plugin ran.
      const dynamicFolderRe = new RegExp(
        `${calleeRe}\\s*\\(\\s*\\{\\s*folder\\s*:\\s*(?!['"])[^\\s}]`,
        "g",
      );

      for (const m of code.matchAll(dynamicFolderRe)) {
        if (m.index === undefined) continue;
        this.error({
          id,
          pos: m.index,
          message:
            "[galalem-react-localization] init({ folder: <expression> }) can't be rewritten — " +
            'the folder must be a string literal (e.g. init({ folder: "src/lang" })). ' +
            "For a dynamic path, pass an explicit loader map instead: " +
            'init({ en: () => import("./en.json"), ... }).',
        });
      }

      const s = new MagicString(code);
      const sourceDir = path.dirname(id);
      let changed = false;

      for (const m of code.matchAll(folderRe)) {
        if (m.index === undefined) continue;
        const objStart = m.index + m[1].length;
        const objEnd = objStart + m[2].length;
        const dir = path.resolve(root, m[4]);
        const { code: loaderMap, files } = buildLoaderMap(dir, sourceDir);
        for (const f of files) this.addWatchFile(f);
        s.overwrite(objStart, objEnd, loaderMap);
        changed = true;
      }

      for (const m of code.matchAll(emptyRe)) {
        if (m.index === undefined) continue;
        const dir = path.resolve(root, DEFAULT_FOLDER);
        const { code: loaderMap, files } = buildLoaderMap(dir, sourceDir);
        for (const f of files) this.addWatchFile(f);
        s.overwrite(m.index, m.index + m[0].length, `${callee}(${loaderMap})`);
        changed = true;
      }

      if (!changed) return;
      return { code: s.toString(), map: s.generateMap({ hires: true }) };
    },
  };
}

/**
 * Read the locale folder and return an object-literal source string mapping
 * each `<locale>.json` to a lazy dynamic import, relative to the source file.
 * Also returns the absolute paths of every JSON file so the caller can register
 * them individually with `addWatchFile` — passing a directory to `addWatchFile`
 * makes Vite's import-analysis try to resolve the folder as a module.
 */
function buildLoaderMap(
  absDir: string,
  sourceDir: string,
): { code: string; files: string[] } {
  if (!fs.existsSync(absDir)) {
    throw new Error(
      `[galalem-react-localization] Locale folder not found: ${absDir}`,
    );
  }

  const jsonFiles = fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  const entries = jsonFiles.map((f) => {
    const locale = path.basename(f, ".json");
    // Specifier must be relative to the source file, POSIX, "./"-prefixed.
    let spec = path.relative(sourceDir, path.join(absDir, f)).split(path.sep).join("/");
    if (!spec.startsWith(".")) spec = `./${spec}`;
    return `  ${JSON.stringify(locale)}: () => import(${JSON.stringify(spec)})`;
  });

  return {
    code: `{\n${entries.join(",\n")}\n}`,
    files: jsonFiles.map((f) => path.join(absDir, f)),
  };
}