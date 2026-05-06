import * as vscode from 'vscode';
import type { LayerAnalysis, ScannedFile } from '@staipler/core';
import type { PipelineState, PipelineSnapshot } from './pipeline-state.js';

type NodeKind =
  | 'score'
  | 'stage-header'
  | 'stage-detail'
  | 'layers-header'
  | 'layer'
  | 'kb-header'
  | 'kb-file'
  | 'message';

export class StaiplerNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly kind: NodeKind,
    readonly children?: StaiplerNode[],
    readonly filePath?: string,
  ) {
    super(label, collapsibleState);
  }
}

const LAYER_HINTS: Record<string, string> = {
  identity: 'Persona',
  goals: 'Priorities',
  context: 'Domain',
  policies: 'Compliance',
  constraints: 'Limits',
  skills: 'Workflows',
  style: 'Formatting',
  examples: 'Few-shot',
  tools: 'Tool rules',
  prompts: 'Fragments',
  evals: 'Tests',
  memory: 'Session',
  continuity: 'Handoffs',
};

function statusIcon(status: LayerAnalysis['status']): vscode.ThemeIcon {
  if (status === 'present') return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
  if (status === 'weak') return new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
  return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('testing.iconFailed'));
}

function gradeColor(grade: string): vscode.ThemeColor {
  if (grade === 'A' || grade === 'B') return new vscode.ThemeColor('testing.iconPassed');
  if (grade === 'C' || grade === 'D') return new vscode.ThemeColor('testing.iconQueued');
  return new vscode.ThemeColor('testing.iconFailed');
}

export class StaiplerTreeProvider implements vscode.TreeDataProvider<StaiplerNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<StaiplerNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly state: PipelineState) {
    state.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  getTreeItem(element: StaiplerNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StaiplerNode): StaiplerNode[] {
    if (element) return element.children ?? [];
    return this.rootNodes();
  }

  private rootNodes(): StaiplerNode[] {
    const status = this.state.status;
    if (status.kind === 'idle') {
      return [this.message('Scanning…', 'sync~spin')];
    }
    if (status.kind === 'no-workspace') {
      return [this.message('Open a folder to scan', 'folder-opened')];
    }
    if (status.kind === 'error') {
      return [this.message(`Scan error: ${status.message}`, 'error')];
    }
    return this.snapshotNodes(status.snapshot);
  }

  private snapshotNodes(snapshot: PipelineSnapshot): StaiplerNode[] {
    const { analysis, scanResult } = snapshot;
    const present = analysis.layers.filter(l => l.status === 'present').length;
    const weak = analysis.layers.filter(l => l.status === 'weak').length;
    const missing = analysis.layers.filter(l => l.status === 'missing').length;

    const score = new StaiplerNode(
      `Empowerment ${analysis.readinessScore}/100 (${analysis.grade})`,
      vscode.TreeItemCollapsibleState.None,
      'score',
    );
    score.iconPath = new vscode.ThemeIcon('graph', gradeColor(analysis.grade));
    score.description = `${present} present · ${weak} weak · ${missing} missing`;
    score.tooltip = `Last scanned ${snapshot.scannedAt.toLocaleTimeString()}\nProject: ${snapshot.projectRoot}`;

    return [
      score,
      this.pipelineNode(snapshot),
      this.layersNode(analysis),
      this.knowledgeBaseNode(scanResult),
    ];
  }

  private pipelineNode(snapshot: PipelineSnapshot): StaiplerNode {
    const { scanResult, analysis } = snapshot;
    const totalCandidateFiles = analysis.layers.reduce((n, l) => n + l.files.length, 0);
    const resolvedLayers = analysis.layers.filter(l => l.status !== 'missing').length;

    const ingestion = this.detail(
      'Ingestion',
      `${scanResult.files.length} instruction file${scanResult.files.length === 1 ? '' : 's'} scanned`,
      'inbox',
    );
    const extraction = this.detail(
      'Extraction',
      `${totalCandidateFiles} layer candidate${totalCandidateFiles === 1 ? '' : 's'} from filename + content`,
      'search',
    );
    const organization = this.detail(
      'Organization',
      `${resolvedLayers}/${analysis.layers.length} layers resolved`,
      'organization',
    );
    const compilation = this.detail(
      'Compilation',
      'Run `staipler ci` or `staipler inject` to compile',
      'package',
    );

    const header = new StaiplerNode(
      'Evidence Pipeline',
      vscode.TreeItemCollapsibleState.Expanded,
      'stage-header',
      [ingestion, extraction, organization, compilation],
    );
    header.iconPath = new vscode.ThemeIcon('git-merge');
    return header;
  }

  private detail(label: string, description: string, icon: string): StaiplerNode {
    const node = new StaiplerNode(label, vscode.TreeItemCollapsibleState.None, 'stage-detail');
    node.description = description;
    node.iconPath = new vscode.ThemeIcon(icon);
    return node;
  }

  private layersNode(analysis: PipelineSnapshot['analysis']): StaiplerNode {
    const children = analysis.layers
      .slice()
      .sort((a, b) => a.kind.localeCompare(b.kind))
      .map(l => this.layerLeaf(l));

    const header = new StaiplerNode(
      'Layers',
      vscode.TreeItemCollapsibleState.Expanded,
      'layers-header',
      children,
    );
    header.description = `${analysis.layers.length} types`;
    header.iconPath = new vscode.ThemeIcon('symbol-namespace');
    return header;
  }

  private layerLeaf(layer: LayerAnalysis): StaiplerNode {
    const fileCount = layer.files.length;
    const importanceTag =
      layer.importance === 'critical' ? '!' : layer.importance === 'recommended' ? '*' : ' ';
    const hint = LAYER_HINTS[layer.kind] ?? '';

    const hasFiles = fileCount > 0;
    const childFiles = hasFiles
      ? layer.files.map(f => this.fileLeaf(f))
      : undefined;

    const node = new StaiplerNode(
      `${importanceTag} ${layer.kind}`,
      hasFiles
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      'layer',
      childFiles,
    );
    node.description = `${layer.qualityScore}/100 · ${hint}${fileCount > 0 ? ` · ${fileCount} file${fileCount === 1 ? '' : 's'}` : ''}`;
    node.tooltip = `${layer.kind} (${layer.importance})\n${layer.diagnosis}\n\n${layer.recommendation}`;
    node.iconPath = statusIcon(layer.status);
    return node;
  }

  private fileLeaf(file: ScannedFile): StaiplerNode {
    const node = new StaiplerNode(
      file.path.split('/').pop() ?? file.path,
      vscode.TreeItemCollapsibleState.None,
      'kb-file',
      undefined,
      file.path,
    );
    node.description = file.path;
    node.resourceUri = vscode.Uri.file(file.path);
    node.iconPath = vscode.ThemeIcon.File;
    node.command = {
      command: 'staipler.openFile',
      title: 'Open',
      arguments: [file.path],
    };
    return node;
  }

  private knowledgeBaseNode(scanResult: PipelineSnapshot['scanResult']): StaiplerNode {
    const kb = scanResult.knowledgeBase;
    const totalKb = kb.reduce((s, f) => s + f.size, 0);
    const children = kb.length > 0
      ? kb.map(f => {
          const node = new StaiplerNode(
            f.path.split('/').pop() ?? f.path,
            vscode.TreeItemCollapsibleState.None,
            'kb-file',
            undefined,
            f.path,
          );
          node.description = `${(f.size / 1024).toFixed(1)}K`;
          node.resourceUri = vscode.Uri.file(f.path);
          node.iconPath = vscode.ThemeIcon.File;
          node.command = {
            command: 'staipler.openFile',
            title: 'Open',
            arguments: [f.path],
          };
          return node;
        })
      : [this.message('No knowledge base files detected', 'info')];

    const header = new StaiplerNode(
      'Knowledge Base',
      vscode.TreeItemCollapsibleState.Collapsed,
      'kb-header',
      children,
    );
    header.description = kb.length > 0
      ? `${kb.length} file${kb.length === 1 ? '' : 's'} · ${(totalKb / 1024).toFixed(1)}K`
      : 'empty';
    header.iconPath = new vscode.ThemeIcon('book');
    return header;
  }

  private message(text: string, icon: string): StaiplerNode {
    const node = new StaiplerNode(text, vscode.TreeItemCollapsibleState.None, 'message');
    node.iconPath = new vscode.ThemeIcon(icon);
    return node;
  }
}
