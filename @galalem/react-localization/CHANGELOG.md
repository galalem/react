# @galalem/react-localization

## 0.3.0

### Minor Changes

- 0e8dfc0: Hook-only translator API + first-render subscription fix.

  **Fix.** `useLocale` (and by extension `<T>`) failed to re-render on the very
  first locale load. Root cause: `useSyncExternalStore` was tracking
  `currentLocale`, which `applyLocale` sets synchronously _before_ the async
  load resolves — so the subscriber-notify that ran after the swap saw an
  unchanged snapshot and React bailed out. Components rendered the raw key on
  mount and only picked up the translation on the next unrelated re-render.

  The snapshot is now the `translations` object reference, which is what
  actually swaps on load. First render still shows the key (the load is async
  by nature), but the follow-up re-render fires reliably.

  **Breaking — API shape.** `__`, `setLocale`, `getLocale`, and
  `getSupportedLocales` are no longer free exports. They now live on the
  `useLocale()` return:

  ```ts
  const { __, locale, setLocale, getSupportedLocales } = useLocale();
  ```

  Why: exposing `__` as a free import let components translate without
  subscribing, which is exactly how the first-render bug hid for so long — the
  correct string on mount, then silent staleness on every `setLocale`.
  Returning `__` from the hook makes the subscription mandatory by construction.

  `getLocale()` is dropped in favor of `useLocale().locale`.

  **Migration.**

  ```ts
  // Before
  import {
    __,
    setLocale,
    getLocale,
    getSupportedLocales,
    useLocale,
  } from "@galalem/react-localization";
  function Save() {
    useLocale();
    return <button>{__("Save")}</button>;
  }

  // After
  import { useLocale } from "@galalem/react-localization";
  function Save() {
    const { __ } = useLocale();
    return <button>{__("Save")}</button>;
  }
  ```

  `<T>`, `Text`, `Translate`, `init`, `load`, `detectLocale`, `setTranslations`,
  and all types are unchanged. Non-render call sites that used to
  `import { __ }` (utility modules, event handlers in non-React files) must now
  receive `__` from a component that called `useLocale`. See the guide's
  architecture notes for the trade-off.

## 0.2.0

### Minor Changes

- b8afdff: Narrow the React peer range from `>=18` to `^19`.

  The library uses no React-19-only APIs — `useSyncExternalStore` has been
  available since 18 — but our test infrastructure (Vitest +
  `@testing-library/react@16` + workspace peer hoisting) doesn't currently
  produce a green matrix run on React 18. Rather than claim support we can't
  verify in CI, the peer is tightened.

  React 18 users on `0.1.0` continue to work; upgrading to `0.2.0` will emit a
  peer-dependency warning until you're on React 19. Broader React 18 support
  may return once the test setup is fixed.

## 0.1.0

### Minor Changes

- Initial release.

  - `__(key)` and `<T>Save</T>` for translating strings.
  - `init()` with inline translations, an explicit loader map, or the Vite
    plugin's folder sugar.
  - `setLocale` / `getLocale` / `detectLocale` for switching and detection.
  - `useLocale()` hook for React re-render on locale change; `<T>` auto-subscribes.
  - `ReactLocalizationPlugin` for Vite: turns `init()` / `init({ folder })` into
    a static loader map at build time; throws build-time on dynamic `folder`.
  - SSR-safe for single-locale-per-process (see `docs/` for the mental model).
