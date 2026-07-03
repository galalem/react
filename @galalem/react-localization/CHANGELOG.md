# @galalem/react-localization

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
