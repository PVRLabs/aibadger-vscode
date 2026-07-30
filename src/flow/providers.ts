/**
 * Optional Prompt 1 handoff shortcuts: open a public AI chat landing page
 * in the system browser after an explicit user click.
 *
 * Prompt text is never attached to the URL. Prompt 2 must not offer these
 * actions — the user continues the same chat.
 */

export type ChatProvider = {
  /** Stable preference key (not user-facing). */
  id: string;
  /** Display name used in menus and toasts. */
  name: string;
  /** Public chat landing page only (no prompt payload). */
  url: string;
};

/** Fixed catalog for the MVP open-chat convenience menu. */
export const CHAT_PROVIDERS: readonly ChatProvider[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
  { id: "claude", name: "Claude", url: "https://claude.ai" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  { id: "grok", name: "Grok", url: "https://grok.com" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com" },
] as const;

export const LAST_CHAT_PROVIDER_STATE_KEY = "aiBadger.lastChatProviderId";

export function providerById(id: string): ChatProvider | undefined {
  return CHAT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Order providers for the dropdown: last-used first when known and valid.
 * Primary button always remains "Copy to Clipboard" (not the last provider).
 */
export function orderProviders(
  lastId: string | undefined
): readonly ChatProvider[] {
  if (!lastId) {
    return CHAT_PROVIDERS;
  }
  const preferred = providerById(lastId);
  if (!preferred) {
    return CHAT_PROVIDERS;
  }
  return [preferred, ...CHAT_PROVIDERS.filter((p) => p.id !== lastId)];
}

/** Webview-safe subset (no URLs in the page — host opens via openExternal). */
export type ChatProviderMenuItem = {
  id: string;
  name: string;
};

export function toMenuItems(
  providers: readonly ChatProvider[]
): ChatProviderMenuItem[] {
  return providers.map((p) => ({ id: p.id, name: p.name }));
}
