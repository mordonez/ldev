import {detectProject, type ProjectType} from '../core/config/project-type.js';

type ContextualHelp = {
  projectType: ProjectType;
  root: string | null;
  title: string;
  recommended: string[];
  notes: string[];
};

export function buildContextualRootHelp(cwd: string): string {
  const context = resolveContextualHelp(cwd);

  return [
    `Detected project type: ${context.projectType}`,
    context.root ? `Detected root: ${context.root}` : 'Detected root: not found',
    '',
    context.title,
    ...context.recommended.map((command) => `  ${command}`),
    '',
    'What this CLI optimizes for:',
    '  short, task-shaped workflows for humans and agents',
    '  stable JSON snapshots for diagnosis and automation',
    '  local development workflows on top of Workspace or ldev-native runtime models',
    '',
    ...context.notes.map((note) => `- ${note}`),
    '',
    "Run 'ldev <command> --help' for usage details.",
  ].join('\n');
}

export function buildContextualRootSummary(cwd: string): string {
  const context = resolveContextualHelp(cwd);

  const lines = [
    'ldev',
    `Detected project type: ${context.projectType}`,
    context.root ? `Detected root: ${context.root}` : 'Detected root: not found',
    '',
    context.title,
    ...context.recommended.map((command) => (command ? `  ${command}` : '')),
    '',
  ];

  if (context.projectType === 'unknown') {
    lines.push(
      'Agent-core entry points:',
      '  ldev context --json',
      '  ldev doctor --json   # runtime/tooling/browser/deploy checks',
      '  ldev portal check --json',
      '  ldev portal inventory page --url /web/guest/home --json',
      '  ldev resource export-structures --site /global',
      '  ldev logs diagnose --json',
      '  ldev oauth install --write-env',
      '  ldev mcp check --json   # only when MCP is part of the task',
      '',
    );
  } else if (context.projectType === 'blade-workspace') {
    lines.push(
      'Runtime-core here:',
      '  ldev start',
      '  ldev stop',
      '  ldev status --json',
      '  ldev logs --no-follow',
      '  ldev deploy all',
      '',
      'Advanced or partial here:',
      '  ldev db ...',
      '  ldev osgi ...',
      '  ldev worktree ...',
      '',
    );
  } else if (context.projectType === 'ldev-native') {
    lines.push(
      'Runtime-core here:',
      '  ldev setup',
      '  ldev start',
      '  ldev stop',
      '  ldev status --json',
      '  ldev logs diagnose --json',
      '  ldev deploy all',
      '  ldev db query ...',
      '  ldev worktree ...',
      '',
    );
  }

  lines.push(
    'What this CLI optimizes for:',
    '  short, task-shaped workflows for humans and agents',
    '  stable JSON snapshots for diagnosis and automation',
    '  local development workflows on top of Workspace or ldev-native runtime models',
    '',
    "Run 'ldev --help' to see the full command catalog.",
  );

  return lines.join('\n');
}

function resolveContextualHelp(cwd: string): ContextualHelp {
  const detected = detectProject(cwd);

  switch (detected.type) {
    case 'blade-workspace':
      return {
        projectType: detected.type,
        root: detected.root,
        title: 'Recommended first steps for this Workspace:',
        recommended: [
          'ldev context --json',
          'ldev doctor --json',
          'ldev start',
          'ldev deploy all',
          'ldev portal check --json',
          'ldev portal inventory page --url /web/guest/home --json',
          'ldev resource export-structures --site /global',
        ],
        notes: [
          'Workspace is the standard project shape.',
          'Run doctor when runtime or tool readiness matters; context is the default first snapshot.',
          'MCP is the official protocol surface for generic portal interoperability, but not universal bootstrap.',
          'Use ldev for direct task-shaped local workflows and agent context.',
          'db, osgi, and worktree remain more advanced or partial in blade-workspace today.',
        ],
      };
    case 'ldev-native':
      return {
        projectType: detected.type,
        root: detected.root,
        title: 'Recommended first steps for this ldev-native repo:',
        recommended: [
          'ldev context --json',
          'ldev doctor --json',
          'ldev setup',
          'ldev start',
          'ldev oauth install --write-env',
          'ldev portal check --json',
          'ldev portal inventory page --url /web/guest/home --json',
          'ldev resource export-structures --site /global',
        ],
        notes: [
          'ldev-native is the advanced project type for docker/ + liferay repositories.',
          'Run doctor when runtime or tool readiness matters; context is the default first snapshot.',
          'This mode includes the richer runtime contract: setup, db, env, osgi, and worktree workflows.',
          'Use it when the repository intentionally relies on Compose overlays, worktrees, or snapshot-oriented flows.',
        ],
      };
    default:
      return {
        projectType: 'unknown',
        root: null,
        title: 'Recommended paths from here:',
        recommended: [
          'blade init ai-workspace',
          'cd ai-workspace',
          'ldev doctor',
          'ldev start',
          '',
          'or:',
          'ldev project init --name my-project --dir ~/projects/my-project',
          'cd ~/projects/my-project',
          'ldev setup',
          'ldev start',
        ],
        notes: [
          'Use a standard Liferay Workspace for the public default path.',
          'Use ldev-native only when you intentionally want the docker/ + liferay runtime model.',
          'The main public agent contract starts with context, then adds doctor or mcp check only when the task actually needs them.',
        ],
      };
  }
}
