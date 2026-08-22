export const solverFinColors = {
  primary: "#0F3D4C",
  primarySoft: "#E8F3F6",
  primaryHover: "#0A2E3A",
  secondary: "#16A34A",
  accent: "#22D3EE",
  accentStrong: "#0891B2",
  accentSurface: "#CFFAFE",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceSoft: "#EEF5F8",
  text: "#0F172A",
  mutedText: "#475569",
  border: "#CBD5E1",
  line: "#E2E8F0",
  neutralControlHover: "#F1F7F9",
  neutralControlBorderHover: "#A5CBD6",
  neutralControlActiveHover: "#DCEEF3",
  neutralControlTextHover: "#0F3D4C",
  success: "#166534",
  successSurface: "#DCFCE7",
  successBorder: "#BBF7D0",
  danger: "#DC2626",
  dangerSurface: "#FEE2E2",
  dangerBorder: "#FECACA",
  warning: "#F59E0B",
  warningText: "#B45309",
  warningSurface: "#FEF3C7",
  warningBorder: "#FDE68A",
  information: "#0369A1",
  informationSurface: "#E0F2FE",
  informationBorder: "#BAE6FD",
  darkSurface: "#061923",
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
    heading: "0.9375rem",
    lg: "1rem",
    xl: "1.125rem",
    "2xl": "1.375rem",
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extraBold: 800,
  },
  lineHeights: {
    tight: 1.2,
    compact: 1.3,
    normal: 1.5,
    relaxed: 1.7,
  },
} as const;

export const solverFinShadows = {
  sm: "0 1px 3px rgba(15, 23, 42, 0.07), 0 1px 2px rgba(15, 23, 42, 0.05)",
  focus: "0 0 0 3px rgba(34, 211, 238, 0.35)",
  dialog: "0 24px 80px rgba(15, 23, 42, 0.18)",
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
  shellCompact: "47.5rem",
  dialogStack: "56.25rem",
} as const;

export const solverFinLayout = {
  contentMaxWidth: "112.5rem",
  gutterMobile: "0.875rem",
  gutterDesktop: "1.25rem",
  gridGap: "1rem",
  gridMinColumn: "16rem",
  dialogMaxWidth: "45rem",
} as const;

export const solverFinDensity = {
  interactiveTargetMin: "2.75rem",
  controlMinHeight: "2.25rem",
  compactActionMinHeight: "2.125rem",
  iconActionSize: "1.875rem",
  controlPaddingInline: "0.625rem",
  panelPaddingBlock: "0.875rem",
  panelPaddingInline: "1rem",
  tableCellBlock: "0.75rem",
  tableCellInline: "1rem",
} as const;

export const solverFinSemanticStates = {
  positive: {
    foreground: solverFinColors.success,
    surface: solverFinColors.successSurface,
    border: solverFinColors.successBorder,
    marker: "+",
  },
  negative: {
    foreground: solverFinColors.danger,
    surface: solverFinColors.dangerSurface,
    border: solverFinColors.dangerBorder,
    marker: "-",
  },
  neutral: {
    foreground: solverFinColors.mutedText,
    surface: solverFinColors.surfaceSoft,
    border: solverFinColors.border,
    marker: "=",
  },
  attention: {
    foreground: solverFinColors.warningText,
    surface: solverFinColors.warningSurface,
    border: solverFinColors.warningBorder,
    marker: "!",
  },
  information: {
    foreground: solverFinColors.information,
    surface: solverFinColors.informationSurface,
    border: solverFinColors.informationBorder,
    marker: "i",
  },
} as const;

export const solverFinDesignTokens = {
  colors: solverFinColors,
  spacing: solverFinSpacing,
  radii: solverFinRadii,
  typography: solverFinTypography,
  shadows: solverFinShadows,
  motion: solverFinMotion,
  breakpoints: solverFinBreakpoints,
  layout: solverFinLayout,
  density: solverFinDensity,
  semanticStates: solverFinSemanticStates,
} as const;

type WidenDesignTokenValues<T> = T extends string
  ? string
  : T extends number
    ? number
    : { readonly [K in keyof T]: WidenDesignTokenValues<T[K]> };

export type SolverFinDesignTokens = WidenDesignTokenValues<typeof solverFinDesignTokens>;
