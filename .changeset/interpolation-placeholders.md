---
"@galalem/react-localization": minor
---

Add simple `{placeholder}` interpolation: pass values as the second argument of `__` (`__("Hello, {name}", { name })`) or via the new `args` prop on `<T>` / `<Text>` / `<Translate>`. Placeholder names are limited to English letters, digits and `_`; anything else in braces is left as literal text, and placeholders without a matching arg are left as-is. Also exports the `TranslationArgs` type.
