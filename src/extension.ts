import * as vscode from "vscode";
import {
  canStartBadgerExecutable,
  createBadgerCliClient,
} from "./client/cliClient";
import {
  createExecutableClientCache,
  createExecutableRecoveringClient,
  createReviewExecutableRecoveringClient,
} from "./client/executableRecovery";
import {
  EXECUTABLE_PATH_SETTING,
  resolveBadgerExecutable,
} from "./client/resolveExecutable";
import type { BadgerClient, BadgerReviewClient } from "./client/types";
import {
  COPY_FILE_FOR_AI_COMMAND,
  COPY_FILES_FOR_AI_COMMAND,
  copyFilesForAI,
  type CopyFilesDeps,
} from "./context/copyFilesForAI";
import { runAsk } from "./flow/runAsk";
import { resolveAskFileSelection } from "./flow/askSelection";
import { createVscodeRunAskUi } from "./flow/vscodeUi";
import { showDeepReviewWizard } from "./flow/askWizard";
import { validateSelectors } from "./flow/selectors";
import { orderProviders, toMenuItems } from "./flow/providers";
import { continueDeepReview, prepareDeepReviewPrompt } from "./context/deepReview";
import { createVscodeResolveDeps } from "./scope/vscodeDeps";
import {
  createReviewSelectedChangesSelectionDeps,
  reviewSelectedChanges,
  REVIEW_SELECTED_CHANGES_COMMAND,
} from "./context/reviewSelectedChanges";
import {
  copyAllChangesForReview,
  REPOSITORY_REVIEW_AMBIGUOUS_TARGET_MESSAGE,
  REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE,
  resolveRepositoryReviewCommandTarget,
} from "./context/repositoryReviewCommands";
import {
  COPY_ALL_CHANGES_FOR_REVIEW_COMMAND,
  DEEP_REVIEW_COMMAND,
  resolveRepositoryReviewScope,
} from "./review/repositoryReviewContract";
import {
  COPY_WORKSPACE_CHANGES_FOR_REVIEW_COMMAND,
} from "./review/workspaceReviewContract";
import { copyWorkspaceChangesForReview } from "./context/workspaceReviewChanges";

const INSTALLATION_INSTRUCTIONS_URL =
  "https://github.com/PVRLabs/aibadger/blob/main/docs/install.md";
const OPEN_INSTALLATION_INSTRUCTIONS = "Open installation instructions";
const CHOOSE_BADGER_EXECUTABLE = "Choose Badger executable…";
const OPEN_AI_BADGER_SETTINGS = "Open AI Badger Settings";
const EXECUTABLE_UNAVAILABLE_MESSAGE =
  "AI Badger requires a local Badger installation. The extension does not download or install Badger.";
const UNSUPPORTED_API_MESSAGE =
  "This Badger version does not support the API required by AI Badger. Upgrade Badger, or choose a compatible local executable.";

export {
  DEFAULT_EXECUTABLE,
  EXECUTABLE_ENV,
  EXECUTABLE_PATH_SETTING,
  resolveBadgerExecutable,
} from "./client/resolveExecutable";

/**
 * Activate the extension.
 * Optional `client` injection is for tests; production uses the process client
 * against the local Badger CLI (`badger api prompt|extract`, explicit argv).
 */
export function activate(
  context: vscode.ExtensionContext,
  client?: BadgerClient,
  reviewClient?: BadgerReviewClient
): void {
  const runtime = client ? undefined : createDefaultBadgerRuntime();
  const deps = {
    scope: createVscodeResolveDeps(),
    ui: createVscodeRunAskUi(context.extensionUri, context),
    client: client ?? runtime!.client,
    reviewClient:
      reviewClient ??
      (client && isBadgerReviewClient(client) ? client : runtime?.reviewClient),
    ...(runtime
      ? {
          executableRecovery: {
            isExecutableAvailable: runtime.isExecutableAvailable,
            openRecovery: runtime.openRecovery,
          },
        }
      : {}),
  };
  const copyFilesDeps = createVscodeCopyFilesDeps();
  const reviewSelectionDeps = createReviewSelectedChangesSelectionDeps(vscode);
  const copySelectedFiles = async (
    uri?: vscode.Uri,
    selectedUris?: vscode.Uri[]
  ): Promise<void> => {
    await copyFilesForAI(uri, selectedUris, copyFilesDeps);
  };
  const askAboutSelectedFiles = async (
    resource?: vscode.Uri,
    selectedUris?: vscode.Uri[]
  ): Promise<void> => {
    const resolved = await resolveAskFileSelection(
      resource,
      selectedUris,
      {
        getActiveFileUri: () =>
          vscode.window.activeTextEditor?.document.uri,
        stat: async (uri) => {
          const stat = await vscode.workspace.fs.stat(uri as vscode.Uri);
          return { isFile: (stat.type & vscode.FileType.File) !== 0 };
        },
      }
    );
    if (!resolved.ok) {
      void vscode.window.showErrorMessage(resolved.message);
      return;
    }
    await runAsk(resolved.entry, deps);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("aiBadger.askAboutProject", async () => {
      await runAsk({ kind: "project" }, deps);
    }),
    vscode.commands.registerCommand(
      "aiBadger.askAboutFolder",
      async (resource?: vscode.Uri) => {
        await runAsk(
          { kind: "folder", resourcePath: resource?.fsPath },
          deps
        );
      }
    ),
    vscode.commands.registerCommand(
      "aiBadger.askAboutFile",
      askAboutSelectedFiles
    ),
    vscode.commands.registerCommand(
      "aiBadger.askAboutSelectedFiles",
      askAboutSelectedFiles
    ),
    vscode.commands.registerCommand(
      COPY_FILE_FOR_AI_COMMAND,
      copySelectedFiles
    ),
    vscode.commands.registerCommand(
      COPY_FILES_FOR_AI_COMMAND,
      copySelectedFiles
    ),
    vscode.commands.registerCommand(
      REVIEW_SELECTED_CHANGES_COMMAND,
      // SCM multi-select supplies every selected resource as a rest argument.
      async (...resourceStates: vscode.SourceControlResourceState[]) => {
        await reviewSelectedChanges(resourceStates, {
          selection: reviewSelectionDeps,
          writeClipboard: async (text) => {
            await vscode.env.clipboard.writeText(text);
          },
          showInformationMessage: (message) => {
            void vscode.window.showInformationMessage(message);
          },
          showErrorMessage: (message) => {
            void vscode.window.showErrorMessage(message);
          },
        });
      }
    ),
    vscode.commands.registerCommand(
      COPY_ALL_CHANGES_FOR_REVIEW_COMMAND,
      async (sourceControl?: vscode.SourceControl) => {
        const target = await resolveRepositoryActionTarget(sourceControl);
        await copyAllChangesForReview(target.target, {
          writeClipboard: async (text) => {
            await vscode.env.clipboard.writeText(text);
          },
          showInformationMessage: (message) => {
            void vscode.window.showInformationMessage(message);
          },
          showErrorMessage: (message) => {
            void vscode.window.showErrorMessage(message);
          },
        }, target.repositories);
      }
    ),
    vscode.commands.registerCommand(
      COPY_WORKSPACE_CHANGES_FOR_REVIEW_COMMAND,
      async () => {
        await copyWorkspaceChangesForReview(
          await changedWorkspaceRepositoryRoots(),
          {
            writeClipboard: async (text) => vscode.env.clipboard.writeText(text),
            showInformationMessage: (message) => { void vscode.window.showInformationMessage(message); },
            showErrorMessage: (message) => { void vscode.window.showErrorMessage(message); },
          }
        );
      }
    ),
    vscode.commands.registerCommand(
      DEEP_REVIEW_COMMAND,
      async (sourceControl?: vscode.SourceControl) => {
        const target = await resolveRepositoryActionTarget(sourceControl);
        const resolved = resolveRepositoryReviewCommandTarget(
          target.target,
          target.repositories
        );
        const scope = resolveRepositoryReviewScope(resolved);
        if (!scope) {
          void vscode.window.showErrorMessage(
            sourceControl === undefined && target.repositories.length > 0
              ? REPOSITORY_REVIEW_AMBIGUOUS_TARGET_MESSAGE
              : REPOSITORY_REVIEW_INVALID_TARGET_MESSAGE
          );
          return;
        }

        const deepReviewClient = deps.reviewClient;
        await showDeepReviewWizard({
          extensionUri: context.extensionUri,
          chatProviders: toMenuItems(orderProviders(undefined)),
          onPreparePrompt: async (guidance, action) => {
            if (!deepReviewClient) {
              return {
                ok: false,
                message:
                  "Deep Review requires a Badger version with review support.",
              };
            }
            return prepareDeepReviewPrompt(guidance, action, {
              client: deepReviewClient,
              repositoryRoot: scope.repositoryRoot,
              writeClipboard: async (text) => {
                await vscode.env.clipboard.writeText(text);
              },
              openExternal: async (url) => {
                try {
                  return await vscode.env.openExternal(vscode.Uri.parse(url));
                } catch {
                  return false;
                }
              },
              showInformationMessage: (message) => {
                void vscode.window.showInformationMessage(message);
              },
            });
          },
          ...(runtime
            ? { onOpenExecutableRecovery: runtime.openRecovery }
            : {}),
          validateSelectors: (text) => {
            const validation = validateSelectors(text);
            return validation.ok ? undefined : validation.message;
          },
          onCopyRequestedFiles: async (_guidance, selectors) => {
            if (!deepReviewClient) {
              return "Deep Review requires a Badger version with review support.";
            }
            const validation = validateSelectors(selectors);
            if (!validation.ok) {
              return validation.message;
            }
            return continueDeepReview(validation.text, {
              client: deepReviewClient,
              repositoryRoot: scope.repositoryRoot,
              writeClipboard: async (text) => {
                await vscode.env.clipboard.writeText(text);
              },
              showInformationMessage: (message) => {
                void vscode.window.showInformationMessage(message);
              },
            });
          },
        });
      }
    )
  );
}

type GitExtension = {
  getAPI(version: number): {
    repositories: readonly GitRepository[];
    getRepository(uri: vscode.Uri): { rootUri: vscode.Uri } | null;
  };
};

type GitRepository = {
  rootUri: vscode.Uri;
  state?: {
    workingTreeChanges?: readonly unknown[];
    indexChanges?: readonly unknown[];
    mergeChanges?: readonly unknown[];
    untrackedChanges?: readonly unknown[];
  };
};

async function changedWorkspaceRepositoryRoots(): Promise<string[]> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) return [];
  try {
    const repositories = (await extension.activate()).getAPI(1).repositories;
    return repositories.filter((repository) => {
      const state = repository.state;
      return state !== undefined && [
        state.workingTreeChanges,
        state.indexChanges,
        state.mergeChanges,
        state.untrackedChanges,
      ].some((changes) => (changes?.length ?? 0) > 0);
    }).map((repository) => repository.rootUri.fsPath);
  } catch {
    return [];
  }
}

type RepositoryActionTarget = {
  target: unknown;
  repositories: Array<{
    id: string;
    providerId?: string;
    rootUri: { fsPath: string };
  }>;
};

async function resolveRepositoryActionTarget(
  argument: unknown
): Promise<RepositoryActionTarget> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) return { target: argument, repositories: [] };
  try {
    const git = (await extension.activate()).getAPI(1);
    const resourceUri = resourceGroupUri(argument);
    if (resourceUri) {
      const repository = git.getRepository(resourceUri);
      if (repository) {
        return {
          target: {
            id: `git:${repository.rootUri.toString()}`,
            rootUri: repository.rootUri,
          },
          repositories: [],
        };
      }
    }
    return {
      target: argument,
      repositories: gitRepositories(git.repositories),
    };
  } catch {
    return { target: argument, repositories: [] };
  }
}

function resourceGroupUri(argument: unknown): vscode.Uri | undefined {
  if (!argument || typeof argument !== "object") return undefined;
  const states = (argument as {
    resourceStates?: readonly { resourceUri?: vscode.Uri }[];
  }).resourceStates;
  return states?.find((state) => state.resourceUri)?.resourceUri;
}

function gitRepositories(
  repositories: readonly { rootUri: vscode.Uri }[]
): Array<{
  id: string;
  providerId?: string;
  rootUri: { fsPath: string };
}> {
  return repositories.map((repository) => ({
      id: `git:${repository.rootUri.toString()}`,
      providerId: "git",
      rootUri: repository.rootUri,
  }));
}

export function deactivate(): void {
  // Nothing to clean up yet.
}

type DefaultBadgerRuntime = {
  client: BadgerClient;
  reviewClient: BadgerReviewClient;
  isExecutableAvailable: () => Promise<boolean>;
  openRecovery: () => Promise<boolean>;
};

/** Production client plus dialog-open availability and recovery bridges. */
function createDefaultBadgerRuntime(): DefaultBadgerRuntime {
  let chosenExecutable: string | undefined;
  const configuredExecutable = () =>
    resolveBadgerExecutable((key) =>
      vscode.workspace.getConfiguration().get<string>(key)
    );
  const currentExecutable = () =>
    chosenExecutable ?? configuredExecutable();
  const recoverAndRemember = async (
    reason: "unavailable" | "unsupportedApi" = "unavailable"
  ): Promise<string | undefined> => {
    const executable = await showBadgerRecovery(reason);
    if (executable) {
      chosenExecutable = executable;
    }
    return executable;
  };

  const createClient = createExecutableClientCache(
    currentExecutable,
    (executable) => createBadgerCliClient({ executable })
  );

  const client = createExecutableRecoveringClient({
    createClient,
    recoverExecutable: recoverAndRemember,
    recoverUnsupportedApi: () => recoverAndRemember("unsupportedApi"),
  });
  const reviewClient = createReviewExecutableRecoveringClient({
    createClient,
    recoverExecutable: recoverAndRemember,
    recoverUnsupportedApi: () => recoverAndRemember("unsupportedApi"),
  });

  return {
    client,
    reviewClient,
    isExecutableAvailable: () =>
      canStartBadgerExecutable(currentExecutable()),
    openRecovery: async () => {
      const executable = await recoverAndRemember();
      return executable
        ? canStartBadgerExecutable(executable)
        : false;
    },
  };
}

function isBadgerReviewClient(
  value: BadgerClient
): value is BadgerClient & BadgerReviewClient {
  const candidate = value as Partial<BadgerReviewClient>;
  return (
    typeof candidate.reviewContext === "function" &&
    typeof candidate.reviewContinuation === "function"
  );
}

function createVscodeCopyFilesDeps(): CopyFilesDeps {
  return {
    getActiveFileUri: () => vscode.window.activeTextEditor?.document.uri,
    getWorkspaceFolder: (uri) =>
      vscode.workspace.getWorkspaceFolder(uri as vscode.Uri),
    getRelativePath: (uri) =>
      vscode.workspace.asRelativePath(uri as vscode.Uri, false),
    stat: async (uri) => {
      const stat = await vscode.workspace.fs.stat(uri as vscode.Uri);
      return { isFile: (stat.type & vscode.FileType.File) !== 0 };
    },
    getOpenDocumentText: (uri) => {
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === uri.toString()
      );
      return document?.getText();
    },
    readFile: async (uri) =>
      vscode.workspace.fs.readFile(uri as vscode.Uri),
    writeClipboard: async (text) => vscode.env.clipboard.writeText(text),
    showInformationMessage: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    showErrorMessage: (message) => {
      void vscode.window.showErrorMessage(message);
    },
  };
}

async function showBadgerRecovery(
  reason: "unavailable" | "unsupportedApi"
): Promise<string | undefined> {
  const choice = await vscode.window.showErrorMessage(
    reason === "unsupportedApi"
      ? UNSUPPORTED_API_MESSAGE
      : EXECUTABLE_UNAVAILABLE_MESSAGE,
    { modal: true },
    OPEN_INSTALLATION_INSTRUCTIONS,
    CHOOSE_BADGER_EXECUTABLE,
    OPEN_AI_BADGER_SETTINGS
  );

  if (choice === OPEN_INSTALLATION_INSTRUCTIONS) {
    await vscode.env.openExternal(vscode.Uri.parse(INSTALLATION_INSTRUCTIONS_URL));
    return undefined;
  }

  if (choice === OPEN_AI_BADGER_SETTINGS) {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "@ext:pvrlabs.ai-badger"
    );
    return undefined;
  }

  if (choice !== CHOOSE_BADGER_EXECUTABLE) {
    return undefined;
  }

  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Choose Badger executable",
    title: "Choose Badger executable",
  });
  const executable = selected?.[0]?.fsPath;
  if (!executable) {
    return undefined;
  }

  await vscode.workspace
    .getConfiguration()
    .update(EXECUTABLE_PATH_SETTING, executable, vscode.ConfigurationTarget.Global);
  return executable;
}
