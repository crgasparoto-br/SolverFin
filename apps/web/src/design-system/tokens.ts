export const solverFinColors = {
  primary: "#0F3D4C",
  secondary: "#16A34A",
  accent: "#22D3EE",
  background: "#F8FAFC",
  text: "#0F172A",
  warning: "#F59E0B",
  danger: "#DC2626",
  successSurface: "#DCFCE7",
  darkSurface: "#061923",
  border: "#CBD5E1",
  mutedText: "#475569",
  surface: "#FFFFFF",
} as const;

export const solverFinSpacing = {
  px: "1px",
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
} as const;

export const solverFinRadii = {
  none: "0",
  sm: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  full: "999px",
} as const;

export const solverFinTypography = {
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  sizes: {
    xs: "0.6875rem",
    sm: "0.8125rem",
    md: "0.875rem",
    lg: "1rem",
    xl: "1.125rem",
    "2xl": "1.375rem",
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

export const solverFinShadows = {
  sm: "0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.06)",
  focus: `0 0 0 3px rgba(34, 211, 238, 0.35)`,
  dialog: "0 24px 80px rgba(15, 23, 42, 0.24)",
  toast: "0 16px 40px rgba(15, 23, 42, 0.18)",
} as const;

export const solverFinMotion = {
  fast: "120ms ease-out",
  standard: "180ms ease-out",
  slow: "240ms ease-out",
} as const;

export const solverFinBreakpoints = {
  sm: "40rem",
  md: "48rem",
  lg: "64rem",
} as const;

export const solverFinDesignTokens = {
  colors: solverFinColors,
  spacing: solverFinSpacing,
  radii: solverFinRadii,
  typography: solverFinTypography,
  shadows: solverFinShadows,
  motion: solverFinMotion,
  breakpoints: solverFinBreakpoints,
} as const;

export type SolverFinDesignTokens = typeof solverFinDesignTokens;
