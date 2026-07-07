# Guide

Deeper docs for [`@galalem/react-localization`](../README.md). The package
README is the elevator pitch and quick start; this guide is the reference.

**Contents**

1. [Mental model](#1-mental-model)
2. [Choosing between `useLocale` and `<T>`](#2-choosing-between-uselocale-and-t)
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
        ▲                              │
        │ subscribes                   │ writes
        │                              ▼
┌────────────────────────┐   ┌───────────────────────────┐
│ Reactive reads         │   │ Writes                    │
│                        │   │                           │
│ <T>Save</T>            │   │ init(...)                 │
│ useLocale()            │   │ useLocale().setLocale(..) │
│   .__("Save")          │   │ setTranslations({...})    │
│   .locale              │   │                           │
│   .getSupportedLocales │   │                           │
└────────────────────────┘   └───────────────────────────┘
```

**All reads go through `useLocale()`** (or `<T>`, which uses it internally).
Reading any field of the hook's return subscribes the calling component via
`useSyncExternalStore` — so when a `setLocale` load resolves and swaps the
active dictionary, every subscribed component re-renders against the new one.

**Writes** mutate the globals. `setLocale` is the only write that also notifies
subscribers (and only after the dictionary swap succeeds — a failed load
doesn't fire a re-render).

Why the hook-only shape: exposing `__` as a free import let components
translate without subscribing. Those components rendered the correct string on
first mount and then went stale after every `setLocale`. Returning `__` from
the hook makes the subscription mandatory by construction — if you have the
translator, you're subscribed.

---

## 2. Choosing between `useLocale` and `<T>`

Two ways to reach the same dictionary. Pick by context, not preference.

| Situation | Use | Why |
|---|---|---|
| Plain text child in JSX | `<T>Save</T>` | One-liner, no destructuring, subscribes automatically. |
| String inside a JSX attribute (`placeholder`, `aria-label`, `title`, etc.) | `useLocale().__(...)` | `<T>` returns JSX, not a string, so it can't go in an attribute. |
| String built from concatenation or template literals | `useLocale().__(...)` | Same reason — you need a string value. |
| Reading or switching the active locale | `useLocale().locale` / `useLocale().setLocale(...)` | Both live on the hook. |

Concrete:

```tsx
import { T, useLocale } from "@galalem/react-localization";

function Field() {
  const { __ } = useLocale();
  return (
    <>
      <label><T>Search</T></label>
      <input placeholder={__("Search")} aria-label={__("Search")} />
    </>
  );
}
```

**Outside components?** There's no `__` free export by design. Utility modules,
event handlers in non-React files, and service-layer code get their translator
via a prop, a param, or by moving the call into a component that has already
called `useLocale`. This is a deliberate trade-off — see [§6](#why-the-hook-only-shape).

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

Everything comes from one `useLocale()` call:

```tsx
import { useLocale } from "@galalem/react-localization";

export function LanguageSwitcher() {
  const { locale, setLocale, getSupportedLocales } = useLocale();

  return (
    <select value={locale ?? ""} onChange={(e) => setLocale(e.target.value)}>
      {getSupportedLocales().map((code) => (
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

### Testing components that use `<T>` / `useLocale`

The `useLocale` hook exposes everything you need — `renderHook` gives you an
imperative handle:

```tsx
import { act, render, renderHook, screen } from "@testing-library/react";
import { init, useLocale, T } from "@galalem/react-localization";

it("renders in Spanish", async () => {
  init({ es: { Save: "Guardar" } });
  const { result } = renderHook(() => useLocale());
  await act(async () => {
    await result.current.setLocale("es");
  });

  render(<T>Save</T>);
  expect(screen.getByText("Guardar")).toBeTruthy();
});
```

For test isolation across the shared singletons, use `vi.resetModules()` + a
dynamic `import("@galalem/react-localization")` per test. See this package's
own `tests/index.test.tsx` for a working pattern.

`setTranslations` is still exported as a low-level primitive if you need to
plant a dictionary without going through a loader — but it does **not** notify
subscribers, so it's only useful for pre-render seed data, not mid-test swaps.

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

### `<T>Hello</T>` or `__("Hello")` doesn't re-render on the first `setLocale`

**Cause pre-v0.3.0.** `useLocale` used `currentLocale` as its snapshot, but
`applyLocale` sets `currentLocale` synchronously *before* the async load
resolves. So by the time the load finished and subscribers were notified, the
snapshot value hadn't changed and `useSyncExternalStore` bailed out. The
translation would flash the key on first render and stay stale until any
unrelated state update forced a re-render.

**Fix.** Upgrade to v0.3.0+ — the snapshot is now the `translations`
reference, which the load swap actually mutates.

If you're on v0.3.0+ and still seeing stale text, confirm you're translating
via `<T>` or a `useLocale().__` call (not an old free `__` import — that
export was removed in v0.3.0).

### `useSyncExternalStore is not a function`

**Cause.** React version is below 19. The library requires React ≥ 19 (both
for the hook and for stable concurrent-mode semantics).

**Fix.** Upgrade React.

### `warns and no-ops for an unknown locale` when calling `setLocale`

**Cause.** You passed a locale code that wasn't registered via `init`. The
library warns and returns a resolved promise without changing anything.

**Fix.** Check `getSupportedLocales()` (from the same `useLocale()` call)
before invoking `setLocale`, or register the locale in `init`.

---

## 6. Architecture notes

### Why a module singleton, not React Context?

A Context around the whole app would provide reactivity, but only through
components that either don't `React.memo` or that read the context themselves
via `useContext`. A memoized subtree still goes stale unless it opts in — the
same footgun as the module-global-with-no-subscribe pattern, dressed
differently.

A module singleton paired with `useSyncExternalStore` gives every subscriber
the same guarantee regardless of memoization: subscribe once, re-render on
every dictionary swap. No provider tree required.

The trade-off is **process-wide state**. That's fine for client apps and
single-locale-per-process servers. It is not fine for multi-tenant SSR — see
§4's SSR note.

### Why the hook-only shape

Earlier versions exported `__` as a free function so utility code and
non-React modules could translate too. In practice this let components read
translations without subscribing, so they'd flash the key on first render and
stay stale after every `setLocale`. Every user hit this at least once.

Returning `__` from `useLocale()` makes the subscription mandatory by
construction — you can't have the translator without the subscription. The
cost is that non-render callers (form validation modules, notification
services) can no longer `import { __ }` and go: they need to be handed `__`
from a component that has already called `useLocale`. That's an explicit,
narrow trade for eliminating the whole class of "why isn't this
re-rendering?" bug reports.

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
