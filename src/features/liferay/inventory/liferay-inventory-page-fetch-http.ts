import type {LiferayGateway} from '../liferay-gateway.js';

export async function safeGatewayGet<T>(
  gateway: LiferayGateway,
  requestPath: string,
  label: string,
  requestOptions?: {headers?: Record<string, string>},
): Promise<{ok: boolean; data: T | null}> {
  try {
    const data = await gateway.getJson<T>(requestPath, label, requestOptions);
    return {ok: true, data};
  } catch {
    return {ok: false, data: null};
  }
}
