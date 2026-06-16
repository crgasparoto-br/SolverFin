export type PwaDisplayMode = "standalone" | "browser" | "minimal-ui" | "fullscreen";
export type PwaShareMethod = "GET" | "POST";
export type PwaShareEnctype = "application/x-www-form-urlencoded" | "multipart/form-data";

export interface PwaIconDefinition {
  src: string;
  sizes: string;
  type: string;
  purpose: "any" | "maskable" | "monochrome";
}

export interface PwaShareTargetDefinition {
  action: string;
  method: PwaShareMethod;
  enctype: PwaShareEnctype;
  params: {
    title: string;
    text: string;
    url: string;
  };
}

export interface SolverFinWebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: PwaDisplayMode;
  background_color: string;
  theme_color: string;
  lang: "pt-BR";
  categories: readonly string[];
  icons: readonly PwaIconDefinition[];
  share_target: PwaShareTargetDefinition;
}

export interface PwaInstallabilityCheck {
  installable: boolean;
  missing: readonly string[];
  warnings: readonly string[];
}

export const solverFinWebManifest = {
  id: "/app",
  name: "SolverFin",
  short_name: "SolverFin",
  description: "Controle financeiro inteligente para pessoas, MEIs e pequenos negocios.",
  start_url: "/app?source=pwa",
  scope: "/",
  display: "standalone",
  background_color: "#f8fafc",
  theme_color: "#0f172a",
  lang: "pt-BR",
  categories: ["finance", "productivity", "business"],
  icons: [
    {
      src: "/icons/solverfin-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/solverfin-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/solverfin-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  share_target: {
    action: "/app/inbox/compartilhar",
    method: "POST",
    enctype: "application/x-www-form-urlencoded",
    params: {
      title: "title",
      text: "text",
      url: "url",
    },
  },
} as const satisfies SolverFinWebManifest;

export function buildSolverFinWebManifest(): SolverFinWebManifest {
  return solverFinWebManifest;
}

export function validatePwaInstallability(
  manifest: SolverFinWebManifest,
): PwaInstallabilityCheck {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (manifest.name.trim().length === 0) {
    missing.push("name");
  }

  if (manifest.start_url.trim().length === 0) {
    missing.push("start_url");
  }

  if (manifest.display !== "standalone" && manifest.display !== "fullscreen") {
    warnings.push("Use standalone ou fullscreen para abrir como app instalado.");
  }

  const hasLargeIcon = manifest.icons.some((icon) => icon.sizes === "512x512");
  const hasMaskableIcon = manifest.icons.some((icon) => icon.purpose === "maskable");

  if (!hasLargeIcon) {
    missing.push("icons.512x512");
  }

  if (!hasMaskableIcon) {
    warnings.push("Inclua icone maskable para melhor acabamento no Android.");
  }

  return {
    installable: missing.length === 0,
    missing,
    warnings,
  };
}
