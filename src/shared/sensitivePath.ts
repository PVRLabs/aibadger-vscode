export function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const rooted = `/${normalized}`;
  const base = normalized.split("/").at(-1) ?? "";
  if ([".env.example", ".env.template", ".env.sample"].includes(base)) return false;
  if ([".env", ".npmrc", ".pypirc", ".netrc", "credentials", "credentials.json", "secret.json", "secrets.json", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"].includes(base)) return true;
  if (base.startsWith(".env.") || /\.(pem|key|p12|pfx|kubeconfig)$/.test(base) || /_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  return rooted.includes("/.azure/") || rooted.endsWith("/.azure") || /\/(\.aws\/(credentials|config)|\.gcp\/credentials\.json)$/.test(rooted);
}
