import assert from "node:assert/strict";

import { buildShellNavigation } from "../app-shell/navigation.js";
import { buildSolverFinWebManifest, evaluateMobileViewportReadiness, validatePwaInstallability } from "./index.js";

manifestIsInstallableAndAcceptsSharedText();
mobileNavigationKeepsPrimaryRoutesReachable();
mobileEmptyAndErrorStatesNeedClearActions();

function manifestIsInstallableAndAcceptsSharedText(): void {
  const manifest = buildSolverFinWebManifest();
  const installability = validatePwaInstallability(manifest);

  assert.equal(installability.installable, true);
  assert.equal(installability.missing.length, 0);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.share_target.action, "/app/inbox/compartilhar");
  assert.equal(manifest.share_target.method, "POST");
}

function mobileNavigationKeepsPrimaryRoutesReachable(): void {
  const navigation = buildShellNavigation({
    activePath: "/app/lancamentos",
    viewportMode: "mobile",
  });
  const readiness = evaluateMobileViewportReadiness({
    viewportWidth: 390,
    navigation,
    state: "ready",
    hasPrimaryAction: true,
    hasReadableEmptyState: true,
    hasRetryAction: true,
  });

  assert.equal(readiness.mobileFirst, true);
  assert.equal(readiness.bottomNavigationVisible, true);
  assert.equal(readiness.primaryRoutesReachable, true);
}

function mobileEmptyAndErrorStatesNeedClearActions(): void {
  const navigation = buildShellNavigation({
    activePath: "/app",
    viewportMode: "mobile",
  });
  const emptyReadiness = evaluateMobileViewportReadiness({
    viewportWidth: 390,
    navigation,
    state: "empty",
    hasPrimaryAction: false,
    hasReadableEmptyState: false,
    hasRetryAction: true,
  });
  const errorReadiness = evaluateMobileViewportReadiness({
    viewportWidth: 390,
    navigation,
    state: "error",
    hasPrimaryAction: false,
    hasReadableEmptyState: true,
    hasRetryAction: false,
  });

  assert.equal(emptyReadiness.mobileFirst, false);
  assert.equal(errorReadiness.mobileFirst, false);
  assert.equal(emptyReadiness.issues.some((issue) => issue.includes("Estado vazio")), true);
  assert.equal(errorReadiness.issues.some((issue) => issue.includes("Estado de erro")), true);
}
