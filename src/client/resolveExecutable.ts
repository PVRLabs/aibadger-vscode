/** VS Code setting: optional absolute path or command name for the Badger CLI. */
export const EXECUTABLE_PATH_SETTING = "aiBadger.executablePath";

/** Env override for tests / local harnesses (takes precedence over setting). */
export const EXECUTABLE_ENV = "AIBADGER_EXECUTABLE";

/** Default when no setting or env override is set. */
export const DEFAULT_EXECUTABLE = "badger";

/**
 * Resolve the Badger executable for production activation.
 * Order: `AIBADGER_EXECUTABLE` env → configured path → `badger`.
 *
 * Pure helper so unit tests can cover resolution without the VS Code module.
 */
export function resolveBadgerExecutable(
  getConfigValue: (key: string) => string | undefined = () => undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromEnv = env[EXECUTABLE_ENV]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const fromSetting = getConfigValue(EXECUTABLE_PATH_SETTING)?.trim();
  if (fromSetting) {
    return fromSetting;
  }
  return DEFAULT_EXECUTABLE;
}
