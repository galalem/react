# @galalem/react-localization

Dead-simple React localization. One hook, one component, one global dictionary — with
optional multi-locale loading and a Vite plugin for zero-boilerplate setup.

## Install

```bash
npm i @galalem/react-localization
```

Requires React `>=19`. The Vite plugin is optional (only if you want the folder sugar).

> Looking for deeper docs? See **[docs/](./docs/)** — mental model, init
> recipes, common tasks, troubleshooting, and architecture notes.

## Quick start

Add the Vite plugin:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { ReactLocalizationPlugin } from "@galalem/react-localization/vite";

export default defineConfig({
  plugins: [ReactLocalizationPlugin()],
});
```

Drop one JSON file per locale into `src/lang/` (the default folder):

```jsonc
// src/lang/en.json
{ "hello": "Hello", "John": null }
```

```jsonc
// src/lang/es.json
{ "hello": "Hola", "John": null }
```

Initialize once, then translate with `<T>` (component) or `__` from the `useLocale()` hook:

```tsx
import { init, T, useLocale } from "@galalem/react-localization";

init({ folder: "src/lang" }); // registers en + es, picks the user's locale automatically

function Greeting({ name }: { name?: string }) {
  const { __ } = useLocale();
  return (
    <div>
      <T>hello</T> {name || __("John")}
    </div>
  );
}
```

On a Spanish browser with no `name`, this renders **“Hola John”**: `hello` is translated,
while `John` stays as-is because its value is `null` (see [Values](#values)).

## Translating

`<T>` for plain JSX children, `useLocale().__` for anything that needs a string (attributes,
interpolation, non-JSX contexts):

```tsx
import { T, Text, Translate, useLocale } from "@galalem/react-localization";

function Save() {
  const { __ } = useLocale();
  return (
    <>
      <button><T>Save</T></button>
      <button><Text>Save</Text></button>          {/* alias of <T> */}
      <button><Translate>Save</Translate></button> {/* alias of <T> */}
      <input placeholder={__("Search")} />
    </>
  );
}
```

`Text` and `Translate` are aliases of `T` — pick whichever reads best. (The component must
be capitalized: `<t>` is a DOM tag in JSX, not a component.)

### Reacting to locale changes

Both `<T>` and `useLocale()` subscribe the calling component to the active dictionary. When
`setLocale` swaps it, every subscribed component re-renders automatically — you don't have
to do anything.

Because `__` is returned from `useLocale()`, there's no way to accidentally read it without
subscribing: a component that calls `useLocale()` is always re-render-aware.

```tsx
import { useLocale } from "@galalem/react-localization";

function Save() {
  const { __ } = useLocale();
  return <button>{__("Save")}</button>;
}
```

The hook returns `{ __, locale, setLocale, getSupportedLocales }`. `locale` is the current
locale code (or `undefined`); the other two are covered in [Multiple locales](#multiple-locales).

## Values

A translation entry is either a string or `null`:

| Value    | Meaning                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| `string` | The translated text.                                                                |
| `null`   | Leave the key as-is — a name or term that shouldn't be translated (e.g. `"John": null`). |

A key with no entry at all also falls back to the key itself, so `__("Save")` returns
`"Save"` until you add a translation. Use `null` — never `""` — for deliberate
non-translations; empty strings trigger a non-blocking `console.warn` when a locale loads.

## Multiple locales

Register locales with `init`, then switch with `setLocale` from the `useLocale` hook:

```tsx
import { init, useLocale } from "@galalem/react-localization";

init({
  en: { "hello world": "Hello world" },      // inline translations
  fr: () => import("./locales/fr.json"),      // lazy loader
});

function LanguageSwitcher() {
  const { setLocale, getSupportedLocales, locale } = useLocale();
  return (
    <select value={locale ?? ""} onChange={(e) => setLocale(e.target.value)}>
      {getSupportedLocales().map((code) => (
        <option key={code} value={code}>{code}</option>
      ))}
    </select>
  );
}
```

Loaders are called on first use and cached. Inline and loader entries can be mixed freely.

## Language detection & persistence

`init` picks the initial locale for you — no extra call needed:

1. A previously **stored** preference (from an earlier `setLocale`), if it's still registered.
2. Otherwise the best match for the **browser's** languages (`navigator.languages`).

Use `setLocale` (from `useLocale`) for explicit user choices (e.g. a language switcher): it
activates the locale **and** persists it to `localStorage`, so the choice survives reloads.
Auto-detected locales are not persisted.

```tsx
import { init, detectLocale, useLocale } from "@galalem/react-localization";

init({ en: { hello: "Hello" }, fr: () => import("./locales/fr.json") });
// active locale is now the stored preference, or the browser's best match

detectLocale();        // best browser match among registered locales, or undefined

function Example() {
  const { locale, setLocale } = useLocale();
  // locale === "en" | "fr" | undefined — the current locale
  // await setLocale("fr"); // switch + persist; resolves once applied (awaiting is optional)
}
```

`setLocale` returns a promise that settles when the switch has been applied. Awaiting is
optional — failures are logged, never thrown, so a non-awaited call is safe too.

**On the server:** the active locale is a per-process global — one locale served per Node
process. Detection and persistence quietly no-op when `navigator` / `localStorage` are absent.
This is safe for SSG, single-tenant SSR (one deploy = one locale), and client hydration. It is
**not** safe for multi-tenant SSR that serves different locales to concurrent requests: the
requests would race on the shared dictionary. Reach for a request-scoped i18n library in that
case — see [Scope](#scope--when-to-graduate).

The preference is stored under `@galalem/react-localization:locale` by default. Override the
key via `init`'s second argument (handy for multiple independent setups on one origin):

```ts
init({ en: { hello: "Hello" }, fr: () => import("./locales/fr.json") }, {
  storageKey: "myapp:lang",
});
```

## Vite plugin (folder sugar)

The plugin (added in [Quick start](#quick-start)) lets `init` take a folder instead of a
hand-written loader map:

```ts
init();                        // every .json in src/lang (the default folder)
init({ folder: "locales" });   // every .json in <project-root>/locales
```

At build time these are rewritten into an explicit lazy-loader map. Notes:

- Folders resolve from the **Vite project root**; the default is `src/lang`.
- Adding/removing a locale file re-triggers the transform in dev.
- `init` must be a real import from this package — the plugin resolves the binding, so a
  named, aliased (`import { init as t }`), or namespace (`import * as i18n`) import all work.
- Without the plugin, `init()` / `init({ folder })` throw a helpful error — pass loaders or
  inline translations explicitly instead.

## Scope & when to graduate

This package is deliberately small: string keys → string values, one active locale per
process. That covers static UI text in most apps and keeps the API to two names (`useLocale`, `<T>`).

Reach for a heavier library when you need:

- **Interpolation** — `"Hello, {name}"` with runtime values.
- **Plurals or gender** — ICU-style `"{count, plural, one {# item} other {# items}}"`.
- **Rich text** — nested React elements inside a translated message.
- **Per-request locale in multi-tenant SSR** — see the SSR note above.

Good options: [i18next](https://www.i18next.com/) with
[react-i18next](https://react.i18next.com/), [FormatJS](https://formatjs.io/) (`react-intl`),
or [Lingui](https://lingui.dev/). All three do the things this package deliberately doesn't.

## API

| Export                | Signature                                              | Description                                             |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `useLocale`           | `() => LocaleAPI`                                      | React hook: returns `{ __, locale, setLocale, getSupportedLocales }` and subscribes the calling component to locale changes. |
| `T` / `Text` / `Translate` | `({ children }: { children: string }) => ReactElement` | Component form of `__`. Subscribes internally.     |
| `init`                | `(options?, settings?: InitSettings) => void`          | Register locales (+ optional `{ storageKey }`); folder sugar needs the Vite plugin. |
| `detectLocale`        | `() => string \| undefined`                            | Best browser-language match among registered locales.   |
| `load`                | `(locale: string) => Promise<Translations>`            | Resolve (and cache) a locale's translations.            |
| `setTranslations`     | `(next: Translations) => void`                         | Replace the active dictionary. Low-level primitive — normally `setLocale` handles this. Does not notify subscribers. |

**Hook return (`LocaleAPI`):**

| Field                 | Signature                                              | Description                                             |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `__`                  | `(key: string) => string`                              | Translate a string, or return it unchanged.             |
| `locale`              | `string \| undefined`                                  | The currently selected locale.                          |
| `setLocale`           | `(locale: string) => Promise<void>`                    | Switch + persist the locale; resolves once applied.     |
| `getSupportedLocales` | `() => string[]`                                       | Locales registered via `init`.                          |

**Types:** `Translations`, `LocaleLoader`, `LocaleSource`, `InitOptions`, `InitSettings`, `LocaleAPI`.

**Plugin:** `ReactLocalizationPlugin` — imported from `@galalem/react-localization/vite`.