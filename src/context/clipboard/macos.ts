import { execFile } from "node:child_process";
import { promisify } from "node:util";

// NSURL objects publish native file references without decoding image contents.
export const MACOS_FILE_CLIPBOARD_SCRIPT = `
ObjC.import('AppKit');
function run(paths) {
  var urls = $.NSMutableArray.alloc.init;
  paths.forEach(function(path) { urls.addObject($.NSURL.fileURLWithPath($(path))); });
  var board = $.NSPasteboard.generalPasteboard;
  board.clearContents;
  if (!board.writeObjects(urls)) throw new Error('Could not write file URLs');
  if (Number(board.pasteboardItems.count) !== paths.length) {
    throw new Error('Clipboard item count does not match the selected file count');
  }
  for (var i = 0; i < paths.length; i++) {
    var actual = ObjC.unwrap(board.pasteboardItems.objectAtIndex(i).stringForType($('public.file-url')));
    var expected = ObjC.unwrap(urls.objectAtIndex(i).absoluteString);
    if (actual !== expected) throw new Error('Clipboard file URL does not match the selected file');
  }
}
`;

export async function writeMacOSFiles(paths: readonly string[]): Promise<void> {
  await promisify(execFile)("/usr/bin/osascript", [
    "-l", "JavaScript", "-e", MACOS_FILE_CLIPBOARD_SCRIPT, "--", ...paths,
  ], { timeout: 10000, maxBuffer: 64 * 1024 });
}
