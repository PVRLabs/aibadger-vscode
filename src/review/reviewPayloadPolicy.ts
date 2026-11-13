export const MAX_REVIEW_PAYLOAD_BYTES = 512 * 1024;
export const MAX_REVIEW_FILE_BYTES = 64 * 1024;

export const REVIEW_TASK =
  "Review the selected changes for concrete bugs, edge cases, regressions, maintainability problems, and unintended behavior changes. Report concise findings, or clearly state that no issues were found. Include a brief, directional recommendation for addressing each finding when useful. Do not provide detailed patches or implementation code unless explicitly requested. Review untracked and unstaged file contents normally. Do not treat Git staging or commit status alone as a review finding, or recommend staging or committing changes unless explicitly requested. Continue reporting concrete correctness issues, including missing files and broken references.";
