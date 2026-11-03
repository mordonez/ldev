import type {OAuthTokenClient} from '../../core/http/auth.js';
import type {HttpApiClient} from '../../core/http/client.js';
import type {LiferayGateway} from './liferay-gateway.js';

export type ApiDiscoverDependencies = {
  gateway?: LiferayGateway;
  apiClient?: HttpApiClient;
  tokenClient?: OAuthTokenClient;
};

export type ApiDiscoverOptions = {
  app?: string;
  path?: string;
  method?: string;
  schema?: string;
  example?: string;
};

export type ApiDiscoverApp = {
  name: string;
  specPaths: string[];
};

export type ApiDiscoverAppsResult = {
  mode: 'apps';
  apps: ApiDiscoverApp[];
};

export type ApiDiscoverParameter = {
  name: string;
  in: string;
  required: boolean;
  type?: string;
  description?: string;
};

export type ApiDiscoverEndpoint = {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  parameters: ApiDiscoverParameter[];
  supportsPagination: boolean;
  supportsFilter: boolean;
  supportsSort: boolean;
  supportsSearch: boolean;
  requestSchema?: string;
  responseSchema?: string;
};

export type ApiDiscoverSchemaProperty = {
  name: string;
  type: string;
  required: boolean;
};

export type ApiDiscoverSchemaSummary = {
  name: string;
  propertyCount: number;
};

export type ApiDiscoverSchemaDetail = ApiDiscoverSchemaSummary & {
  properties: ApiDiscoverSchemaProperty[];
};

export type ApiDiscoverExample = {
  method: string;
  path: string;
  url: string;
  curl: string;
  javascript: string;
};

export type ApiDiscoverConventions = {
  auth: string;
  pagination: string;
  filter: string;
  sort: string;
  search: string;
  fields: string;
};

export type ApiDiscoverSpecResult = {
  mode: 'spec';
  app: string;
  specPath: string;
  baseUrl: string;
  title?: string;
  version?: string;
  endpointCount: number;
  endpoints: ApiDiscoverEndpoint[];
  schemaCount: number;
  schemas: ApiDiscoverSchemaSummary[];
  schemaDetail?: ApiDiscoverSchemaDetail;
  conventions: ApiDiscoverConventions;
  example?: ApiDiscoverExample;
};

export type ApiDiscoverResult = ApiDiscoverAppsResult | ApiDiscoverSpecResult;
