import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { native, nativeAccent } from './native'
import { scopedName } from './environment'

const themeKey = scopedName('splittrip.flutter.theme')

export const accentNames: Record<string, string> = {
  '#56ab83': 'Sage Green',
  '#009688': 'Teal Blue',
  '#2196f3': 'Ocean Blue',
  '#00b0ff': 'Neon Cyan',
  '#8e24aa': 'Royal Purple',
  '#e91e63': 'Hot Pink',
  '#d81b60': 'Crimson Red',
  '#f4511e': 'Sunset Orange',
  '#ffa000': 'Amber Gold',
  '#795548': 'Warm Brown',
}
export const backgrounds = {
  light: {
    default: ['Default Slate', '#f4f4f5', '#ffffff'],
    white: ['Pure White', '#ffffff', '#f4f4f5'],
    cream: ['Warm Cream', '#faf6f0', '#fffdf9'],
    mint: ['Fresh Mint', '#f1f8f5', '#fafdfb'],
    lavender: ['Lavender Breeze', '#f6f5fa', '#fdfdff'],
    rose: ['Rose Quartz', '#faf5f6', '#fffbfc'],
  },
  dark: {
    default: ['Default Dark', '#121212', '#1e1e1e'],
    pure: ['Amoled Black', '#000000', '#121212'],
    midnight: ['Midnight Blue', '#0b0f19', '#151d30'],
    slate: ['Slate Grey', '#1a1d24', '#242933'],
    forest: ['Deep Forest', '#0c100e', '#141a17'],
    plum: ['Deep Plum', '#0e0a14', '#171120'],
    espresso: ['Espresso Dark', '#120e0c', '#1c1613'],
  },
}
type Values = {
  mode: 'light' | 'dark' | 'system'
  accent: string
  background: string
  dynamic: boolean
}
const defaults: Values = {
  mode: 'system',
  accent: '#56ab83',
  background: 'default',
  dynamic: false,
}
type Appearance = Values & {
  dark: boolean
  setMode: (v: Values['mode']) => void
  setAccent: (v: string) => void
  setBackground: (v: string) => void
  setDynamic: (v: boolean) => void
}
const Context = createContext<Appearance | null>(null)
export function useAppearance() {
  const c = useContext(Context)
  if (!c) throw Error('Missing appearance context')
  return c
}
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Values>(() => {
    try {
      return {
        ...defaults,
        ...JSON.parse(localStorage.getItem(themeKey) || '{}'),
      }
    } catch {
      return defaults
    }
  })
  const [systemDark, setSystem] = useState(
      () => matchMedia('(prefers-color-scheme:dark)').matches,
    ),
    [wallpaper, setWallpaper] = useState('')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme:dark)')
    const refresh = () => setSystem(media.matches)
    media.addEventListener('change', refresh)
    return () => media.removeEventListener('change', refresh)
  }, [])
  useEffect(() => {
    if (native && prefs.dynamic)
      void nativeAccent()
        .then((c) => setWallpaper(c || ''))
        .catch(() => setWallpaper(''))
  }, [prefs.dynamic, systemDark])
  const dark = prefs.mode === 'system' ? systemDark : prefs.mode === 'dark'
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    const palette: Record<string, string[]> =
      backgrounds[dark ? 'dark' : 'light']
    const colors =
      palette[prefs.dynamic ? 'default' : prefs.background] || palette.default
    root.style.setProperty('--bg', colors[1])
    root.style.setProperty('--surface', colors[2])
    const hue = prefs.dynamic ? wallpaper || defaults.accent : prefs.accent
    root.style.setProperty('--brand', hue)
    root.style.setProperty(
      '--accent',
      dark
        ? 'color-mix(in srgb,' + hue + ' 70%, white)'
        : 'color-mix(in srgb,' + hue + ' 68%, #102c1e)',
    )
    root.style.setProperty(
      '--sage',
      'color-mix(in srgb,' + hue + ' 20%,var(--surface))',
    )
    localStorage.setItem(themeKey, JSON.stringify(prefs))
  }, [prefs, dark, wallpaper])
  const update = (p: Partial<Values>) => set((old) => ({ ...old, ...p }))
  return (
    <Context.Provider
      value={{
        ...prefs,
        dark,
        setMode: (v) => update({ mode: v }),
        setAccent: (v) => update({ accent: v }),
        setBackground: (v) => update({ background: v }),
        setDynamic: (v) => update({ dynamic: v }),
      }}
    >
      {children}
    </Context.Provider>
  )
}
