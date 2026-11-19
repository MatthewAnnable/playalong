/**
 * How long an ordinary status message stays up before it fades, in ms:
 * long enough to read at a glance, a little longer for a longer message.
 * Errors return null — they stay until the next message replaces them.
 */
export function statusHoldMs(message: string, isError: boolean): number | null {
  if (isError) return null;
  return Math.min(3000 + message.length * 40, 7000);
}
