import { writeMacOSFiles } from "./clipboard/macos";

/** A local desktop clipboard backend publishes original files as attachments. */
export type FileClipboard = {
  writeFiles(paths: readonly string[]): Promise<void>;
};

/**
 * Platform capabilities belong here, rather than in selection or command logic.
 * Add Windows or Linux backends here once their desktop clipboard support is verified.
 * Remote hosts cannot publish remote file references to the local desktop clipboard.
 */
export function getFileClipboard(platform: string, remote: boolean): FileClipboard | undefined {
  if (remote) return undefined;
  switch (platform) {
    case "darwin": return { writeFiles: writeMacOSFiles };
    default: return undefined;
  }
}
