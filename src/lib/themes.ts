export interface ThemeColor {
  id: string
  name: string
  /** the accent: buttons, the selected tab, links */
  color: string
}

/** Accent colours the user can pick. More can be added here later. */
export const THEMES: ThemeColor[] = [{ id: 'blue', name: '藍色', color: '#4ab0e0' }]

export const DEFAULT_THEME = THEMES[0]!

export const themeById = (id: string): ThemeColor => THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
