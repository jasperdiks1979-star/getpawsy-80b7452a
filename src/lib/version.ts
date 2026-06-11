/**
 * Application version - automatically updated by release-please
 * @see https://github.com/googleapis/release-please
 */
export const APP_VERSION = '1.0.1';

/**
 * Get the current application version
 */
export function getVersion(): string {
  return APP_VERSION;
}

/**
 * Check if the current version is a pre-release
 */
export function isPrerelease(): boolean {
  return APP_VERSION.includes('-');
}
