/** Operator-tool theme presets. The active theme is stored on <html data-theme>
 *  and persisted to localStorage; CSS variable values live in app/globals.css. */

export type ThemeId = "nobc" | "midnight"

export const THEME_STORAGE_KEY = "nobc-theme"
export const DEFAULT_THEME: ThemeId = "nobc"

export type ThemeMeta = {
  id: ThemeId
  label: string
  icon: "sun" | "moon"
}

export const THEMES: ThemeMeta[] = [
  { id: "nobc", label: "NoBC", icon: "sun" },
  { id: "midnight", label: "Midnight", icon: "moon" },
]

export function isThemeId(value: unknown): value is ThemeId {
  return value === "nobc" || value === "midnight"
}

export function nextTheme(current: ThemeId): ThemeId {
  return current === "nobc" ? "midnight" : "nobc"
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Inline, render-blocking snippet — applies the saved theme before first paint. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='nobc'||t==='midnight'){document.documentElement.dataset.theme=t;}}catch(e){}})();`
