export function actionKind(action: string): string;
export function actionUrl(name: string, action: string): string;
export function previewUrl(name: string, action: string): string;
export function primaryActionForWorktree(
  wt: {env?: {portalReachable?: boolean | null} | null},
  running: boolean,
  stopped: boolean,
): [string, string, string];
