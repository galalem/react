# Guide

Deeper docs for [`@galalem/react-localization`](../README.md). The package
README is the elevator pitch and quick start; this guide is the reference.

**Contents**

1. [Mental model](#1-mental-model)
2. [Choosing between `__`, `<T>`, and `useLocale`](#2-choosing-between-__-t-and-uselocale)
3. [Init recipes](#3-init-recipes)
4. [Common tasks](#4-common-tasks)
5. [Troubleshooting](#5-troubleshooting)
6. [Architecture notes](#6-architecture-notes)

---

## 1. Mental model

Everything the library does sits on top of **four module-level globals**, kept in
memory for the lifetime of the JavaScript process. If you can hold this picture
in your head, every surprise makes sense.

```
┌───────────────────────────────── module state ──────────────────────────────────┐
│                                                                                 │
│   translations : Record<string, string | null>   ← the ACTIVE dictionary        │
│   sources      : Map<locale, LocaleSource>       ← what init() registered       │
│   cache        : Map<locale, Translations>       ← memoized loader results      │
│   currentLocale: string | undefined              ← what setLocale intends       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲                        ▲                                     │
        │ reads                  │ subscribes                          │ writes
        │                        │                                     ▼
┌──────────────────┐   ┌──────────────────────┐         ┌───────────────────────────┐
│ Stateless reads  │   │ Reactive reads       │         │ Writes                    │
│                  │   │                      │         │                           │
│ __("Save")       │   │ <T>Save</T>          │         │ init(...)                 │
│ getLocale()      │   │ useLocale()          │         │ setLocale("fr")           │
│ detectLocale()   │   │                      │         │ setTranslations({...})    │
│ getSupportedLocales() │                     │         │                           │
└──────────────────┘   └──────────────────────┘         └───────────────────────────┘
```

**Stateless reads** just look at the globals. Safe anywhere — utility modules,
event handlers, `console.log`, non-React code.

**Reactive reads** register a subscriber via `useSyncExternalStore`. When a
`setLocale` load resolves, the library walks the subscriber set and every
subscribed component re-renders against the new dictionary.

**Writes** mutate the globals. `setLocale` is the only write that also notifies
subscribers (and only after the dictionary swap succeeds — a failed load
doesn't fire a re-render).

Why this matters: if a component using `__` doesn't re-render after
`setLocale`, it's because that component never subscribed. Wrap the string in
`<T>` or add a `useLocale()` call — see §2.

---

## 2. Choosing between `__`, `<T>`, and `useLocale`

Three ways to reach the same dictionary. Pick by context, not preference.

| Situation | Use | Why |
|---|---|---|
| Plain text child in JSX | `<T>Save</T>` | Auto-subscribes. One line, no ceremony. |
| String inside a JSX attribute (`placeholder`, `aria-label`, `title`, etc.) | `useLocale()` + `__(...)` inside the component | `<T>` returns JSX, not a string, so it can't go in an attribute. |
| String built from concatenation or template literals | `useLocale()` + `__(...)` in the component | Same reason — you need a string value. |
| Outside React (utility, event handler, notification body, form validation) | `__(...)` alone | Not in a render tree; nothing to re-render. Fires with whatever's active. |
| Rendering the current locale itself | `const locale = useLocale();` | Its return value is the current locale; the subscription is the side benefit. |

Concrete:

```tsx
import { __, T, useLocale } from "@galalem/react-localization";

// JSX child — auto re-renders.
<button><T>Save</T></button>

// JSX attribute — need the string, so use __ and subscribe explicitly.
function Field() {
  useLocale();
  return <input placeholder={__("Search")} aria-label={__("Search")} />;
}

// Outside React — no subscription needed.
function onSaveClick() {
  toast.success(__("Saved"));
}
```

**Don't do this:** `<span>{__("Save")}</span>` in a component that never calls
`useLocale()` and has no `<T>` anywhere in its tree. The text is correct on
first render but never updates. Either wrap in `<T>` or add `useLocale()` at
the top of the component.

---

## 3. Init recipes

`init` accepts four shapes. All of them do the same thing at the end: populate
`sources` with `locale → LocaleSource`.

| Shape | When | Requires Vite plugin |
|---|---|---|
| `init()` | Vite app, JSON files live in `src/lang/*.json` | Yes |
| `init({ folder: "path" })` | Vite app, JSON files live elsewhere | Yes |
| `init({ en: () => import("./en.json"), fr: () => import("./fr.json") })` | Non-Vite bundler, or explicit control | No |
| `init({ en: { hello: "Hello" }, fr: { hello: "Bonjour" } })` | Tests, tiny apps, inline data | No |

### `init()` — plugin, default folder

Zero-argument. Requires the plugin. Reads `src/lang/*.json` at build time and
inlines a lazy-loader map.

```ts
init();  // plugin rewrites to { en: () => import("./lang/en.json"), ... }
```

### `init({ folder })` — plugin, custom folder

Same as above but with an explicit folder relative to the Vite project root.

```ts
init({ folder: "locales" });        // <root>/locales/*.json
init({ folder: "src/i18n" });       // <root>/src/i18n/*.json
```

The folder value **must be a string literal** — the plugin resolves it at
build time. Passing a variable throws a build error naming the file and line.

### Explicit loader map — no plugin

Works with any bundler. You write the import specifiers yourself.

```ts
init({
  en: () => import("./locales/en.json"),
  fr: () => import("./locales/fr.json"),
  es: () => import("./locales/es.json"),
});
```

Each loader is called at most once (results are cached).

### Inline translations — no bundling

Useful for tests, tiny apps, or one-locale cases.

```ts
init({
  en: { hello: "Hello", "Sign in": "Sign in" },
  fr: { hello: "Bonjour", "Sign in": "Se connecter" },
});
```

### Mixing loaders and inline

Any two entries can be different shapes. The library doesn't care.

```ts
init({
  en: { hello: "Hello" },                    // inline
  fr: () => import("./locales/fr.json"),     // lazy loader
  de: () => import("./locales/de.json"),
});
```

### Second argument: settings

```ts
init(source, { storageKey: "myapp:lang" });
```

- `storageKey` — the `localStorage` key used to persist the user's choice.
  Default is `"@galalem/react-localization:locale"`. Override this when you
  host multiple independent apps at the same origin, or want to namespace by
  tenant.

  Re-calling `init` with a different `storageKey` starts writing to the new
  key. The old key's value is **not** migrated or cleared — that's an
  explicit contract (tested).

---

## 4. Common tasks

### A language switcher UI

Uses `getSupportedLocales`, `useLocale`, and `setLocale`. `useLocale` gives you
the active value AND the re-render subscription in one line.

```tsx
import { setLocale, useLocale, getSupportedLocales } from "@galalem/react-localization";

export function LanguageSwitcher() {
  const active = useLocale();
  const locales = getSupportedLocales();

  return (
    <select value={active ?? ""} onChange={(e) => setLocale(e.target.value)}>
      {locales.map((code) => (
        <option key={code} value={code}>{code}</option>
      ))}
    </select>
  );
}
```

To show the language name in each option instead of the code, keep a static
map of code → display name (e.g. `{ en: "English", fr: "Français" }`) — the
library doesn't know human names, deliberately.

### Adding a new locale to a live dev server

With the Vite plugin:

1. Drop the new JSON file into your locale folder (e.g. `src/lang/de.json`).
2. **Restart** `vite dev`. Editing an existing JSON hot-reloads; adding a new
   file doesn't — the plugin watches individual files it saw at transform
   time, not the folder itself. (A `configureServer`-based fix is planned.)

Without the plugin: add a new entry to your `init({...})` call. The bundler
picks it up on the next reload.

### Detecting missing translations

Empty-string values are already warned:

```
[@galalem/react-localization] Locale "fr" has empty-string translation(s)
for "hello". Use `null` for intentionally-untranslated strings instead of "".
```

For keys that have no entry at all, `__(key)` returns the key unchanged and
the render silently uses the source string. To surface those, grep your
locale JSONs for missing keys against a canonical list — or add a small script
that compares each locale's key set to `en`'s.

### Testing components that use `<T>` / `__`

You don't need `init` in tests. Import `setTranslations` and hand-set the dict
in a `beforeEach`:

```tsx
import { beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { setTranslations, T } from "@galalem/react-localization";

beforeEach(() => setTranslations({ Save: "Guardar" }));

it("renders in Spanish", () => {
  render(<T>Save</T>);
  expect(screen.getByText("Guardar")).toBeTruthy();
});
```

For `useLocale` + re-render tests, use `vi.resetModules()` + a dynamic
`import("@galalem/react-localization")` per test to reset the singletons.
See this package's own `src/index.test.tsx` for a working pattern.

### SSR / SSG

Safe when **one Node process serves one locale**: SSG (build-time HTML
generation), single-tenant SSR, or when the whole render happens after `init`
has picked a stable locale.

Unsafe for **multi-tenant SSR where concurrent requests need different
locales** — the requests race on the shared `translations` global. If that's
your setup, use a request-scoped i18n library (i18next with an instance per
request, or FormatJS with an intl provider).

Detection and persistence quietly no-op when `navigator` / `localStorage`
aren't defined, so importing the library on the server doesn't crash.

---

## 5. Troubleshooting

### `[@galalem/react-localization] init() / init({ folder }) needs the Vite plugin`

**Cause.** You called `init()` or `init({ folder: "..." })` and the Vite
plugin isn't in `vite.config.ts` — or you're not using Vite.

**Fix.** Add the plugin, or use an explicit loader map:

```ts
// vite.config.ts
import { ReactLocalizationPlugin } from "@galalem/react-localization/vite";
export default defineConfig({ plugins: [react(), ReactLocalizationPlugin()] });
```

or:

```ts
init({ en: () => import("./locales/en.json"), fr: () => import("./locales/fr.json") });
```

### Build error: `init({ folder: <expression> }) can't be rewritten`

**Cause.** The plugin can only inline **string-literal** folder paths. Passing
a variable, template literal, or spread doesn't work — the file list has to
be known at build time.

**Fix.** Use a string literal, or drop the sugar and pass an explicit loader
map.

```ts
init({ folder: "src/lang" });                 // ✅
init({ folder: FOLDER });                     // ❌
init({ folder: `${env}/lang` });              // ❌
```

### `Failed to resolve import ".../src/lang" from src/App.tsx`

**Cause.** Historically the plugin registered the locale folder with
`addWatchFile(dir)`, which Vite's import-analysis then tried to resolve as a
module. Fixed since v0.1.0 (each JSON file is registered individually).

**Fix.** Upgrade the package. If you're on the fixed version and still see
this, confirm you don't have an unrelated bare-folder import in your code.

### `Invalid hook call` after installing the tarball locally

**Cause.** Two copies of React are being resolved at runtime — one from your
app, one from the library's node_modules. Usually caused by `npm link` /
`pnpm link` which symlinks and doesn't dedupe peer deps.

**Fix.** Use `pnpm pack` and install the resulting `.tgz`, or use a
`file:` protocol dep — both preserve peer resolution against the consumer's
React.

### A translation renders as empty text

**Cause.** The JSON has `"": ""` or `"key": ""` — an empty string is a valid
translation value and gets rendered verbatim. `null` is the "leave the key
as-is" sentinel; empty string is not.

**Fix.** Use `null` for keys that shouldn't be translated (proper nouns,
brand names). The library also logs a `console.warn` on locale load listing
every empty-string value.

### `<T>Hello</T>` doesn't re-render when I call `setLocale`

Should not happen — `<T>` calls `useLocale()` internally. If you're on a
version older than v0.1.0, upgrade. Also check: are you rendering `<T>` at
all, or using `__("Hello")` directly? If the latter, add `useLocale()` at the
top of the component or switch to `<T>`.

### `useSyncExternalStore is not a function`

**Cause.** React version is below 18. The library requires React ≥ 18 (both
for the hook and for stable concurrent-mode semantics).

**Fix.** Upgrade React.

### `warns and no-ops for an unknown locale` when calling `setLocale`

**Cause.** You passed a locale code that wasn't registered via `init`. The
library warns and returns a resolved promise without changing anything.

**Fix.** Check `getSupportedLocales()` before calling `setLocale`, or register
the locale in `init`.

---

## 6. Architecture notes

### Why a module singleton, not React Context?

Context requires every consumer of `__` to be inside a Provider tree. That
breaks the "call `__` anywhere" model — utility functions, event handlers,
service-layer code, non-React modules. A module singleton lets a single
import work everywhere, and pairs with `useSyncExternalStore` to give React
components the reactivity they need without forcing Provider wrapping on the
whole app.

The trade-off is **process-wide state**. That's fine for client apps and
single-locale-per-process servers. It is not fine for multi-tenant SSR — see
§4's SSR note.

### Why a Vite plugin, not runtime file scanning?

Bundlers need statically analyzable `import()` specifiers to code-split and
include JSON assets. `import(anyString)` at runtime doesn't work in browsers,
`fs` doesn't exist in browsers, and the file list has to be known at build
time. The plugin scans the folder on the developer's machine and inlines an
explicit loader map so the bundler can do its job.

Without the plugin, you write that loader map yourself — no magic, no missing
functionality, just one more line per locale.

### The value space: `string | null`

Two states, both meaningful:

- `string` — a translation (empty string is honored; a `console.warn` on load
  flags likely mistakes).
- `null` — intentional identity, "leave the key as-is." Used for proper
  nouns, brand names, and terms that shouldn't be localized.

A **missing key** falls through to the key itself — the same behavior as
`null` — so untranslated apps still render sensibly.

Historically an unknown key was marked `false` inside the dictionary so it
could be reported later. That was removed in v0.1.0 because it caused a
write-during-render (bad under concurrent rendering and SSR). Reporting
missing translations, if needed, is a follow-up feature with a dedicated API.
