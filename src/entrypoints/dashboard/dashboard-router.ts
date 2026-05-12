import type http from 'node:http';

export type DashboardRouteContext = {
  method: string;
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: string;
};

export type DashboardRoute = {
  handle: (context: DashboardRouteContext, match: RegExpExecArray | null) => void;
  method: string;
  path?: string;
  pattern?: RegExp;
  startsWith?: string;
};

export function dispatchDashboardRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  routes: DashboardRoute[],
): boolean {
  const context: DashboardRouteContext = {
    method: req.method ?? 'GET',
    req,
    res,
    url: req.url ?? '/',
  };

  for (const route of routes) {
    if (route.method !== context.method) {
      continue;
    }

    if (route.path && route.path === context.url) {
      route.handle(context, null);
      return true;
    }

    if (route.startsWith && context.url.startsWith(route.startsWith)) {
      route.handle(context, null);
      return true;
    }

    const match = route.pattern?.exec(context.url);
    if (match) {
      route.handle(context, match);
      return true;
    }
  }

  return false;
}
