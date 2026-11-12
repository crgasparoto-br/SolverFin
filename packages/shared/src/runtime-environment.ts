export type RuntimeEnvironment = "development" | "local" | "test" | "production";

const RUNTIME_ENVIRONMENTS = new Set<RuntimeEnvironment>([
  "development",
  "local",
  "test",
  "production",
]);

export function assertExplicitRuntimeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): RuntimeEnvironment {
  const value = env.NODE_ENV?.trim().toLowerCase();

  if (!value || !RUNTIME_ENVIRONMENTS.has(value as RuntimeEnvironment)) {
    throw new Error(
      "NODE_ENV must be explicitly configured as development, local, test, or production.",
    );
  }

  return value as RuntimeEnvironment;
}

export function isLocalRuntimeEnvironment(environment: RuntimeEnvironment): boolean {
  return environment === "development" || environment === "local" || environment === "test";
}
