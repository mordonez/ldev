import type {ProjectInventory} from '../../core/config/project-inventory.js';
import type {PlatformCapabilities} from '../../core/platform/capabilities.js';

export type Presence = {
  status: 'present' | 'missing';
  source: 'env' | 'localProfile' | 'dockerEnv' | 'profile' | 'fallback';
};

export type CommandStatus = {
  supported: boolean;
  requires: string[];
  missing: string[];
};

export type AgentContextIssue = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
};
export type AgentContextReport = {
  ok: true;
  generatedAt: string;
  project: {
    type: string;
    cwd: string;
    root: string | null;
    branch: string | null;
    isWorktree: boolean;
    worktreeRoot: string | null;
  };
  liferay: {
    product: string | null;
    version: string | null;
    edition: 'dxp' | 'portal' | null;
    image: string | null;
    portalUrl: string | null;
    auth: {
      oauth2: {
        clientId: Presence;
        clientSecret: Presence;
        scopes: number;
      };
    };
    timeoutSeconds: number;
  };
  paths: {
    dockerDir: string | null;
    liferayDir: string | null;
    dockerEnv: string | null;
    liferayProfile: string | null;
    liferayLocalProfile: string | null;
    resources: ProjectInventory['resources'];
  };
  runtime: {
    adapter: string;
    composeFiles: string[];
    services: string[];
    ports: ProjectInventory['runtime']['ports'];
    composeProjectName: string | null;
    dataRoot: string | null;
  };
  inventory: ProjectInventory['local'];
  ai: {
    manifestPresent: boolean;
    managedRules: number;
    modifiedRules: number;
    staleRuntimeRules: number;
  };
  platform: {
    os: PlatformCapabilities['os'];
    tools: {
      git: boolean;
      docker: boolean;
      dockerCompose: boolean;
      java: boolean;
      node: boolean;
      blade: boolean;
      lcp: boolean;
      playwrightCli: boolean;
    };
    features: {
      worktrees: boolean;
      btrfsSnapshots: boolean;
    };
  };
  commands: Record<string, CommandStatus>;
  issues: AgentContextIssue[];
};
