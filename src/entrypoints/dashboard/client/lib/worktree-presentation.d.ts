import type {PrimaryAction} from './actions.ts';

type DashboardPresentationAction = {
  action?: string;
  className: string;
  disabled?: boolean;
  label: string;
  target: string;
};

export function buildWorktreePresentation(
  wt: Record<string, unknown>,
  tasks: Array<{kind: string; status: string; worktreeName?: string}>,
): {
  actions: DashboardPresentationAction[];
  advancedActions: DashboardPresentationAction[];
  busy: (action: string) => boolean;
  cardStatus: string | null;
  primary: PrimaryAction;
  running: boolean;
  stopped: boolean;
};
