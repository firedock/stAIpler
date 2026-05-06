import * as vscode from 'vscode';
import { PipelineState } from './pipeline-state.js';
import { StaiplerTreeProvider } from './tree-provider.js';

const REFRESH_DEBOUNCE_MS = 400;

const WATCH_GLOB = '**/{*.md,*.mdc,.staipler.json,.cursorrules,.windsurfrules,.clinerules}';

export function activate(context: vscode.ExtensionContext): void {
  const state = new PipelineState();
  const treeProvider = new StaiplerTreeProvider(state);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('staipler.pipeline', treeProvider),
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'staipler.pipeline.focus';
  statusBar.tooltip = 'stAIpler — click to open pipeline view';
  context.subscriptions.push(statusBar);

  state.onDidChange((status) => {
    if (status.kind === 'ready') {
      const { readinessScore, grade } = status.snapshot.analysis;
      statusBar.text = `$(layers) stAIpler ${readinessScore}/100 (${grade})`;
      statusBar.show();
    } else if (status.kind === 'error') {
      statusBar.text = '$(layers) stAIpler · error';
      statusBar.show();
    } else if (status.kind === 'no-workspace') {
      statusBar.text = '$(layers) stAIpler · no folder';
      statusBar.show();
    } else {
      statusBar.text = '$(layers) stAIpler · scanning';
      statusBar.show();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('staipler.refresh', () => {
      refresh(state);
    }),
    vscode.commands.registerCommand('staipler.openFile', async (path: string) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
      await vscode.window.showTextDocument(doc);
    }),
  );

  let debounceTimer: NodeJS.Timeout | null = null;
  const queueRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refresh(state), REFRESH_DEBOUNCE_MS);
  };

  const watcher = vscode.workspace.createFileSystemWatcher(WATCH_GLOB);
  watcher.onDidChange(queueRefresh);
  watcher.onDidCreate(queueRefresh);
  watcher.onDidDelete(queueRefresh);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => refresh(state)),
  );

  context.subscriptions.push({ dispose: () => state.dispose() });

  refresh(state);
}

function refresh(state: PipelineState): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    state.setNoWorkspace();
    return;
  }
  state.refresh(folders[0]!.uri.fsPath);
}

export function deactivate(): void {}
