import * as path from "path";

/**
 * Root-relative scope for Badger: forward slashes, no leading `./`.
 * Returns undefined when the resource is the project root itself.
 */
export function relativeScope(
  projectRoot: string,
  resourcePath: string
): string | undefined {
  const root = path.resolve(projectRoot);
  const resource = path.resolve(resourcePath);
  const rel = path.relative(root, resource);

  if (!rel || rel === ".") {
    return undefined;
  }

  // Outside the root (or different drive on Windows).
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return undefined;
  }

  return rel.split(path.sep).join("/");
}

/**
 * True when resourcePath is under projectRoot (or is the root).
 */
export function isPathInsideRoot(
  projectRoot: string,
  resourcePath: string
): boolean {
  const root = path.resolve(projectRoot);
  const resource = path.resolve(resourcePath);
  const rel = path.relative(root, resource);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
