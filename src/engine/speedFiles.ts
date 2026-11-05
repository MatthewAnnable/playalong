/**
 * Pre-rendered slow versions of a song's recording (Rubber Band, made offline),
 * one per speed step. The browser's own stretcher is fine for small changes but
 * gets smeary when slowed a lot, so a song can name a better-sounding file for
 * each step; speeds without one still use the browser.
 *
 * Each file is the main recording slowed by exactly that much and starting at
 * the same moment, so at speed `percent` its time is the main recording's time
 * stretched by 100 / percent. Everything else (sync points, the progress bar,
 * the highway) keeps working in the main recording's time.
 */

/** Manifest form: speed percent (as a string key) → file path. */
export type SpeedFileMap = Record<string, string>;

export function speedFileFor(files: SpeedFileMap | undefined, percent: number): string | null {
  if (!files || percent === 100) return null;
  return files[String(percent)] ?? null;
}

/** Where a pre-rendered file should be for a time in the main recording. */
export function speedFileTime(mainSeconds: number, percent: number): number {
  return Math.max(0, (mainSeconds * 100) / percent);
}

/** The main recording's time for a position in a pre-rendered file. */
export function mainTimeFromSpeedFile(fileSeconds: number, percent: number): number {
  return (fileSeconds * percent) / 100;
}
