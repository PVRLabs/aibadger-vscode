export const MAX_REVIEW_PAYLOAD_BYTES = 512 * 1024;
export const MAX_REVIEW_FILE_BYTES = 64 * 1024;

export const REVIEW_TASK =
  "Review the selected changes for concrete bugs, edge cases, regressions, maintainability problems, and unintended behavior changes. Report concise findings, or clearly state that no issues were found. Include a brief, directional recommendation for addressing each finding when useful. Do not provide detailed patches or implementation code unless explicitly requested.";
