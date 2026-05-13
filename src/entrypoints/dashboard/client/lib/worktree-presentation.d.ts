type DashboardPresentationAction = {
  action?: string;
  className: string;
  disabled?: boolean;
  label: string;
  target: string;
};

type DashboardPresentationSection = {
  key: string;
  label: string;
};

export function buildWorktreePresentation(
  wt: Record<string, unknown>,
  tasks: Array<{kind: string; status: string; worktreeName?: string}>,
  activeSection?: string,
): {
  actions: DashboardPresentationAction[];
  advancedActions: DashboardPresentationAction[];
  badges: Array<{label: string; tone: string}>;
  busy: (action: string) => boolean;
  primary: [string, string, string];
  running: boolean;
  sections: DashboardPresentationSection[];
  selected?: DashboardPresentationSection;
  stopped: boolean;
};
