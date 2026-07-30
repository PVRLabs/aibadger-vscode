export type AdditionalContextFile = {
  path: string;
  contents: string;
};

export type BinaryContextFile = {
  path: string;
  binaryType: string;
  size: string;
};

export type ExcludedContextFile = {
  path: string;
  reason: string;
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function formatFile(file: AdditionalContextFile | BinaryContextFile): string {
  if ("binaryType" in file) {
    return [
      `--- File: ${normalizePath(file.path)} (Binary File) ---`,
      `Type: ${file.binaryType}`,
      `Size: ${file.size}`,
      "--- End File ---",
    ].join("\n");
  }

  const contents = file.contents.endsWith("\n")
    ? file.contents
    : `${file.contents}\n`;
  return [
    `--- File: ${normalizePath(file.path)} (Full File) ---`,
    `${contents}--- End File ---`,
  ].join("\n");
}

/**
 * Formats selected files as standalone, AI-friendly clipboard context.
 * This intentionally does not share the Badger CLI prompt formatter.
 */
export function formatAdditionalContext(
  question: string | undefined,
  files: readonly (AdditionalContextFile | BinaryContextFile)[],
  excludedFiles: readonly ExcludedContextFile[] = []
): string {
  const trimmedQuestion = question?.trim() ?? "";
  const sections: string[] = [];

  if (trimmedQuestion !== "") {
    sections.push(`[QUESTION]\n${trimmedQuestion}`);
  }

  sections.push(
    files.length === 0
      ? "[ADDITIONAL CONTEXT]"
      : `[ADDITIONAL CONTEXT]\n\n${files.map(formatFile).join("\n\n")}`
  );
  if (excludedFiles.length > 0) {
    sections.push(
      [
        "[EXCLUDED FILES]",
        "The following selected files are listed for awareness but their contents were excluded from this prompt:",
        ...excludedFiles.map(
          (file) => `- ${normalizePath(file.path)} (${file.reason})`
        ),
      ].join("\n")
    );
  }
  return `${sections.join("\n\n")}\n`;
}
