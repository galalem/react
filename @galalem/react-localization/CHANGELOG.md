# @galalem/react-localization

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
