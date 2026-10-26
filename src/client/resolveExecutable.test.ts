import * as assert from "assert";
import { canStartBadgerExecutable } from "./cliClient";
import { resolveAvailableBadgerExecutable } from "./resolveExecutable";

suite("Windows default executable discovery", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\Jane Doe\\AppData\\Local" };
  const installed = env.LOCALAPPDATA + "\\Programs\\Badger\\badger.exe";

  test("uses default installation only after PATH spawn failure", async () => {
    const calls: string[] = [];
    const result = await resolveAvailableBadgerExecutable(async (exe) => {
      calls.push(exe);
      return exe === installed;
    }, undefined, env, "win32");
    assert.strictEqual(result, installed);
    assert.deepStrictEqual(calls, ["badger", installed]);
  });

  test("keeps a PATH process that starts with a nonzero version exit", async () => {
    const calls: string[] = [];
    const result = await resolveAvailableBadgerExecutable((exe) => {
      calls.push(exe);
      return canStartBadgerExecutable(exe, async () => ({ exitCode: 1, stdout: "", stderr: "unsupported" }));
    }, undefined, env, "win32");
    assert.strictEqual(result, "badger");
    assert.deepStrictEqual(calls, ["badger"]);
  });

  test("missing default leaves recovery on the original executable", async () => {
    assert.strictEqual(await resolveAvailableBadgerExecutable(async () => false, undefined, env, "win32"), "badger");
  });

  test("explicit setting and environment choices are never probed or replaced", async () => {
    const noProbe = async () => { throw new Error("unexpected probe"); };
    assert.strictEqual(await resolveAvailableBadgerExecutable(noProbe, () => "D:\\custom.exe", env, "win32"), "D:\\custom.exe");
    assert.strictEqual(await resolveAvailableBadgerExecutable(noProbe, () => "setting", { ...env, AIBADGER_EXECUTABLE: "override" }, "win32"), "override");
  });

  test("other platforms and missing LOCALAPPDATA do not probe", async () => {
    const noProbe = async () => { throw new Error("unexpected probe"); };
    assert.strictEqual(await resolveAvailableBadgerExecutable(noProbe, undefined, env, "linux"), "badger");
    assert.strictEqual(await resolveAvailableBadgerExecutable(noProbe, undefined, {}, "win32"), "badger");
  });
});
