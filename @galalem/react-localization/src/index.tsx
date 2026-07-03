import { useSyncExternalStore, type ReactElement } from "react";

// --- Types -------------------------------------------------------------------

/**
 * The global dictionary: source string → translated string.
 * Value semantics:
 *  - `string` — the translation (empty strings are honored; `warnEmptyValues` flags them)
 *  - `null`   — non-translatable, use the key as-is
 */
export type Translations = Record<string, string | null>;

/** A lazy loader for a locale, e.g. `() => import("./en.json")`. */
export type LocaleLoader = () => Promise<{ default: Record<string, string | null> }>;

/** A locale's source: either a lazy loader or an inline translations object. */
export type LocaleSource = LocaleLoader | Translations;

/** Map of locale code → its source (loader or inline translations). */
export interface InitOptions {
  [locale: string]: LocaleSource;
}

/** Optional settings for {@link init}. */
export interface InitSettings {
  /**
   * localStorage key for the persisted locale preference.
   * Defaults to `"@galalem/react-localization:locale"`.
   */
  storageKey?: string;
}

// --- Translation -------------------------------------------------------------

let translations: Translations = {};

/** Replace the active dictionary. */
export function setTranslations(next: Translations): void {
  translations = next;
}

/**
 * Translate a string: returns the mapped value if the key exists, otherwise
 * returns the input unchanged.
 * @example __("hello world")
 */
export function __(key: string): string {
  return translations[key] ?? key;
}

/**
 * Component form of {@link __} — its (string) children get translated.
 * Auto-subscribes to locale changes via {@link useLocale}, so it re-renders
 * whenever `setLocale` swaps the active dictionary.
 * @example <T>hello world</T>
 */
export function T({ children }: { children: string }): ReactElement {
  useLocale();
  return <>{__(children)}</>;
}

/** Alias of {@link T}. */
export const Translate = T;

/** Alias of {@link T}. */
export const Text = T;

// --- Locale management -------------------------------------------------------

const sources = new Map<string, LocaleSource>();
const cache = new Map<string, Translations>();

/** Default localStorage key for the user's persisted locale preference. */
const DEFAULT_STORAGE_KEY = "@galalem/react-localization:locale";

/** Active localStorage key; overridable via {@link init} settings. */
let storageKey = DEFAULT_STORAGE_KEY;

/** The currently selected locale. Also guards a slow stale load from overwriting a newer one. */
let currentLocale: string | undefined;

// --- React subscription store ------------------------------------------------

/**
 * Subscribers get notified after a `setLocale` load resolves and the dictionary
 * has been swapped. `<T>` and `useLocale` register here so components re-render
 * on locale changes.
 */
const subscribers = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function notifyLocaleChange(): void {
  for (const cb of subscribers) cb();
}

/**
 * Subscribe a component to locale changes. Returns the current locale.
 *
 * Use this inside a component that reads translations via {@link __} to make
 * it re-render whenever `setLocale` swaps the active dictionary. `<T>` already
 * calls this internally, so components that only use `<T>` don't need it.
 *
 * @example
 *   function Save() {
 *     useLocale();
 *     return <button>{__("Save")}</button>;
 *   }
 */
export function useLocale(): string | undefined {
  // Same snapshot function for client and server: `currentLocale` is a
  // per-process module global — see the SSR notes in the README.
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}

/**
 * Register the available locales and their sources.
 *
 * The no-arg and `{ folder }` forms are authoring sugar: the Vite plugin turns
 * them into an explicit loader map at build time. All forms are typed; at
 * runtime `init` only ever sees a locale → source map.
 *
 * @example init()                                  // plugin → src/lang/*.json
 * @example init({ folder: "locales" })             // plugin → <root>/locales/*.json
 * @example init({ en: () => import("./en.json") }) // explicit lazy loader
 * @example init({ en: { hello: "Hello" } })        // inline translations
 */
export function init(): void;
export function init(options: { folder: string }, settings?: InitSettings): void;
export function init(options: InitOptions, settings?: InitSettings): void;
export function init(
  options?: InitOptions | { folder: string },
  settings?: InitSettings,
): void {
  if (settings?.storageKey) storageKey = settings.storageKey;

  if (options === undefined || ("folder" in options && typeof options.folder === "string")) {
    throw new Error(
      "[@galalem/react-localization] init() / init({ folder }) needs the Vite plugin " +
        "(ReactLocalizationPlugin) to turn a locale folder into a loader map at build time. " +
        "Add the plugin, or call init({ <locale>: loader | translations }) explicitly.",
    );
  }

  sources.clear();
  cache.clear(); // drop stale translations so re-init picks up new content
  for (const [locale, source] of Object.entries(options as InitOptions)) {
    sources.set(locale, source);
  }

  // Auto-pick the initial locale so apps don't need a separate call.
  autoSelectLocale();
}

/**
 * Resolve a locale's translations, calling its loader on first use and caching
 * the result. Throws if the locale was never registered via {@link init}.
 */
export async function load(locale: string): Promise<Translations> {
  const cached = cache.get(locale);
  if (cached) return cached;

  const source = sources.get(locale);
  if (!source) throw new Error(`Unknown locale "${locale}"`);

  // A source is either a lazy loader or an inline translations object.
  const json: Translations =
    typeof source === "function" ? (await source()).default : source;

  warnEmptyValues(locale, json);
  cache.set(locale, json);
  return json;
}

/**
 * Load a locale, make it active, and remember it as the user's preference in
 * localStorage. Use this for explicit choices (e.g. a language switcher).
 *
 * Returns a promise that resolves once the switch has settled (translations
 * applied, or the failure logged). Awaiting is optional — failures are logged,
 * never thrown, so a non-awaited call is safe.
 */
export function setLocale(locale: string): Promise<void> {
  if (!sources.has(locale)) {
    console.warn(
      `[@galalem/react-localization] setLocale("${locale}"): unknown locale. ` +
        "Register it via init(...) first.",
    );
    return Promise.resolve();
  }
  storeLocale(locale);
  return applyLocale(locale);
}

/** The currently selected locale, or `undefined` if none has been set yet. */
export function getLocale(): string | undefined {
  return currentLocale;
}

/** Locales registered via {@link init}. */
export function getSupportedLocales(): string[] {
  return Array.from(sources.keys());
}

/**
 * Find the registered locale that best matches the browser's preferred
 * languages (`navigator.languages`). Matches exact tags first (`en-US`), then
 * falls back to the base language (`en`). Case-insensitive. Returns `undefined`
 * if nothing matches, or when there's no browser (e.g. SSR).
 */
export function detectLocale(): string | undefined {
  const supported = getSupportedLocales();
  if (supported.length === 0 || typeof navigator === "undefined") return undefined;

  // Lowercased tag/base → the registered locale code (exact wins over base).
  const byLower = new Map<string, string>();
  for (const code of supported) {
    byLower.set(code.toLowerCase(), code);
    const base = code.toLowerCase().split("-")[0];
    if (!byLower.has(base)) byLower.set(base, code);
  }

  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    if (!tag) continue;
    const lower = tag.toLowerCase();
    const hit = byLower.get(lower) ?? byLower.get(lower.split("-")[0]);
    if (hit) return hit;
  }

  return undefined;
}

// --- Internal ----------------------------------------------------------------

/** Load a locale and make it active, ignoring stale in-flight loads. Does not persist. */
function applyLocale(locale: string): Promise<void> {
  currentLocale = locale;
  return load(locale)
    .then((next) => {
      if (currentLocale === locale) {
        setTranslations(next);
        notifyLocaleChange();
      }
    })
    .catch((error) => {
      console.error(`[@galalem/react-localization] Failed to load locale "${locale}":`, error);
    });
}

/**
 * Pick the initial locale automatically: a stored preference (if it is still
 * registered), otherwise the detected browser language. Auto choices are not
 * persisted — only an explicit {@link setLocale} writes the preference.
 */
function autoSelectLocale(): void {
  const stored = getStoredLocale();
  const chosen = stored && sources.has(stored) ? stored : detectLocale();
  if (chosen) void applyLocale(chosen); // fire-and-forget; applyLocale never rejects
}

function getStoredLocale(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    return localStorage.getItem(storageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeLocale(locale: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    // ignore: private mode, quota, etc. (non-blocking)
  }
}

/**
 * Non-blocking check: warns about `""` values, which should be `null` instead.
 * Runs once per locale (called from {@link load}, which caches).
 */
function warnEmptyValues(locale: string, dict: Translations): void {
  const empty = Object.keys(dict).filter((key) => dict[key] === "");
  if (empty.length === 0) return;

  console.warn(
    `[@galalem/react-localization] Locale "${locale}" has empty-string translation(s) ` +
      `for ${empty.map((key) => JSON.stringify(key)).join(", ")}. ` +
      'Use `null` for intentionally-untranslated strings instead of "".',
  );
}