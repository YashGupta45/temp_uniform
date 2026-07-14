/**
 * Global theme tokens — light-mode-first, per design guidelines
 * (Industrial Editorial / Swiss high-contrast).
 */
export const COLORS = {
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F4F5",
  text: "#0A0A0A",
  textMuted: "#52525B",
  textFaint: "#A1A1AA",
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",
  primary: "#002FA7", // Klein Blue
  primaryDim: "#E5EAF7",
  danger: "#FF3B30", // Signal Red — scanner-only
  success: "#10B981",
  warning: "#F59E0B",
  ink: "#0A0A0A",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const FONTS = {
  // System fallbacks — we don't ship the custom fonts in this MVP; using
  // system faces keeps the app cold-start fast. Design guideline intent is
  // preserved through weight/tracking rather than face.
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
  mono: "Menlo",
} as const;

export const TYPO = {
  h1: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -1.2, color: COLORS.text },
  h2: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.6, color: COLORS.text },
  h3: { fontSize: 18, fontWeight: "700" as const, letterSpacing: -0.2, color: COLORS.text },
  body: { fontSize: 15, fontWeight: "400" as const, color: COLORS.text },
  bodyMuted: { fontSize: 14, fontWeight: "400" as const, color: COLORS.textMuted },
  overline: {
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 2,
    color: COLORS.textMuted,
    textTransform: "uppercase" as const,
    fontFamily: FONTS.mono,
  },
  mono: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text },
} as const;
