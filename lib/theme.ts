/** Operator-tool theme presets. The active theme is stored on <html data-theme>
 *  and persisted to localStorage; CSS variable values live in app/globals.css. */

export type ThemeId = "nobc" | "midnight" | "obsidian" | "rose" | "parchment" | "void" | "ember"

export const THEME_STORAGE_KEY = "nobc-theme"
export const DEFAULT_THEME: ThemeId = "nobc"

export type ThemeMeta = {
  id: ThemeId
  label: string
  icon: "sun" | "moon" | "gem" | "palette"
}

export const THEMES: ThemeMeta[] = [
  { id: "nobc",      label: "Light",     icon: "sun"     },
  { id: "midnight",  label: "Midnight",  icon: "moon"    },
  { id: "obsidian",  label: "Obsidian",  icon: "gem"     },
  { id: "rose",      label: "Rosé",      icon: "palette" },
  { id: "parchment", label: "Parchment", icon: "sun"     },
  { id: "void",      label: "Void",      icon: "moon"    },
  { id: "ember",     label: "Ember",     icon: "moon"    },
]

export function isThemeId(value: unknown): value is ThemeId {
  return value === "nobc" || value === "midnight" || value === "obsidian" || value === "rose" || value === "parchment" || value === "void" || value === "ember"
}

export function nextTheme(current: ThemeId): ThemeId {
  const idx = THEMES.findIndex((t) => t.id === current)
  return THEMES[(idx + 1) % THEMES.length].id
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Inline, render-blocking snippet — applies the saved theme before first paint. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var valid=['nobc','midnight','obsidian','rose','parchment','void','ember'];if(valid.indexOf(t)!==-1){document.documentElement.dataset.theme=t;}}catch(e){}})();`
