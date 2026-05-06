import * as vscode from 'vscode';
import { scan, analyze, findProjectRoot } from '@staipler/core';
import type { AnalysisResult, ScanResult } from '@staipler/core';

export interface PipelineSnapshot {
  projectRoot: string;
  scanResult: ScanResult;
  analysis: AnalysisResult;
  scannedAt: Date;
}

export type PipelineStatus =
  | { kind: 'idle' }
  | { kind: 'no-workspace' }
  | { kind: 'ready'; snapshot: PipelineSnapshot }
  | { kind: 'error'; message: string };

export class PipelineState {
  private _status: PipelineStatus = { kind: 'idle' };
  private readonly _onDidChange = new vscode.EventEmitter<PipelineStatus>();
  readonly onDidChange = this._onDidChange.event;

  get status(): PipelineStatus {
    return this._status;
  }

  setNoWorkspace(): void {
    this._status = { kind: 'no-workspace' };
    this._onDidChange.fire(this._status);
  }

  refresh(workspaceRoot: string): void {
    try {
      let projectRoot: string;
      try {
        projectRoot = findProjectRoot(workspaceRoot);
      } catch {
        projectRoot = workspaceRoot;
      }
      const scanResult = scan(projectRoot);
      const analysis = analyze(scanResult);
      this._status = {
        kind: 'ready',
        snapshot: { projectRoot, scanResult, analysis, scannedAt: new Date() },
      };
    } catch (err) {
      this._status = {
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
    this._onDidChange.fire(this._status);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
