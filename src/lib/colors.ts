import { DEFAULT_THEME } from './themes'

/**
 * Category, account and ledger colours. They all take the lightness and chroma of the theme blue and only
 * turn the hue, so the donut chart and the icon tiles read as one family instead of a box of crayons.
 */

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

interface Oklch {
  l: number
  c: number
  h: number
}

function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => toLinear(x / 255)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  }
}

function linearRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ]
}

/** To a hex colour; chroma is lowered a little when the colour would fall outside what a screen can show. */
function oklchToHex(lch: Oklch): string {
  let c = lch.c
  while (c > 0 && !linearRgb({ ...lch, c }).every((v) => v >= -0.0005 && v <= 1.0005)) c -= 0.002
  return (
    '#' +
    linearRgb({ ...lch, c: Math.max(c, 0) })
      .map((v) => Math.round(fromLinear(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

const base = hexToOklch(DEFAULT_THEME.color)
const at = (h: number, c = base.c) => oklchToHex({ l: base.l, c, h })

/** Named colours, so data and screens say what they mean instead of repeating hex codes. */
export const P = {
  blue: at(base.h),
  orange: at(55),
  // brighter and warmer than the others: at the shared lightness hue 90 turns into mustard
  yellow: oklchToHex({ l: base.l + 0.1, c: 0.155, h: 82 }),
  green: at(148),
  teal: at(190),
  indigo: at(268),
  violet: at(297),
  magenta: at(328),
  pink: at(358),
  red: at(25),
  gray: at(base.h, 0.02),
}

export type ColorRole = keyof typeof P

/** A colour of another lightness or strength, for the extra choices in the picker. */
const shade = (h: number, dl: number, c = base.c) => oklchToHex({ l: base.l + dl, c, h })

/**
 * Colours offered when picking one for a category, account or ledger, ordered around the colour wheel so
 * similar colours sit next to each other.
 */
export const COLORS = [
  // warm to cool around the colour wheel, then the neutrals
  P.pink,
  shade(8, -0.02), // rose
  P.red,
  shade(40, 0.02), // coral
  P.orange,
  shade(62, -0.14, 0.08), // brown
  P.yellow,
  shade(125, 0.02), // lime
  P.green,
  shade(150, -0.13, 0.12), // forest
  shade(168, 0.04), // mint
  P.teal,
  shade(235, 0.04), // sky
  P.blue,
  shade(262, -0.14, 0.16), // navy
  P.indigo,
  P.violet,
  shade(298, -0.1, 0.17), // deep purple
  shade(250, -0.1, 0.03), // slate
  P.gray,
]
