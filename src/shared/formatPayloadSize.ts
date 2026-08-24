export function formatPayloadSize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1000 * 1000) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  return `${(bytes / (1000 * 1000)).toFixed(1)} MB`;
}
