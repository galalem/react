---
"@galalem/react-localization": minor
---

Hook-only translator API + first-render subscription fix.

**Fix.** `useLocale` (and by extension `<T>`) failed to re-render on the very
first locale load. Root cause: `useSyncExternalStore` was tracking
`currentLocale`, which `applyLocale` sets synchronously *before* the async
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
import { __, setLocale, getLocale, getSupportedLocales, useLocale } from "@galalem/react-localization";
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
