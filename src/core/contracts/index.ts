// Shared schemas (used by both inventory and resource)
export {
  resolvedSiteSchema,
  siteLookupPayloadSchema,
  headlessPageSchema,
  headlessSiteSchema,
  dataDefinitionSchema,
  contentTemplateSchema,
  jsonwsCompanySchema,
  jsonwsGroupSearchResultSchema,
} from './shared.schema.js';

export type {
  ResolvedSite,
  SiteLookupPayload,
  HeadlessPage,
  HeadlessSite,
  DataDefinition,
  ContentTemplate,
  JsonwsCompany,
  JsonwsGroupSearchResult,
} from './shared.schema.js';

// Inventory schemas
export {
  liferayInventorySiteSchema,
  liferayInventoryTemplateSchema,
  liferayInventoryStructureSchema,
  liferayInventorySitesSchema,
  liferayInventoryTemplatesSchema,
  liferayInventoryStructuresSchema,
  whereUsedResourceTypes,
  whereUsedMatchKinds,
  pageEvidenceSourceValues,
  whereUsedResourceTypeSchema,
  whereUsedMatchKindSchema,
  pageEvidenceSourceSchema,
  whereUsedQuerySchema,
  whereUsedMatchSchema,
  whereUsedPageMatchSchema,
  whereUsedResultSchema,
  whereUsedPlanResultSchema,
} from './inventory.schema.js';

export type {
  LiferayInventorySite,
  LiferayInventoryTemplate,
  LiferayInventoryStructure,
  LiferayInventorySites,
  LiferayInventoryTemplates,
  LiferayInventoryStructures,
  WhereUsedResourceTypeValue,
  WhereUsedMatchKindValue,
  PageEvidenceSourceValue,
  WhereUsedQuery,
  WhereUsedResourceType,
  WhereUsedMatchKind,
  WhereUsedMatch,
  WhereUsedPageMatch,
  WhereUsedResultContract,
  WhereUsedPlanResultContract,
  WhereUsedResult,
  WhereUsedPlanResult,
  WhereUsedRunResult,
} from './inventory.schema.js';

// Resource schemas
export {
  liferayResourceSyncFragmentItemResultSchema,
  liferayResourceSyncFragmentsSingleResultSchema,
  liferayResourceSyncFragmentsAllSitesResultSchema,
  liferayResourceSyncFragmentsResultSchema,
  liferayResourceImportFailureSchema,
  liferayResourceSyncAdtItemResultSchema,
  liferayResourceSyncStructureItemResultSchema,
  liferayResourceSyncTemplateItemResultSchema,
} from './resource.schema.js';

export type {
  LiferayResourceSyncFragmentItemResult,
  LiferayResourceSyncFragmentsSingleResult,
  LiferayResourceSyncFragmentsAllSitesResult,
  LiferayResourceSyncFragmentsResult,
  LiferayResourceImportFailure,
  LiferayResourceSyncAdtItemResult,
  LiferayResourceSyncStructureItemResult,
  LiferayResourceSyncTemplateItemResult,
} from './resource.schema.js';

// Environment schemas (ldev_status, ldev_logs_diagnose, ldev_context)
export {
  envServiceStatusSchema,
  envStatusReportSchema,
  diagnosedExceptionSchema,
  envLogsDiagnoseResultSchema,
  presenceSchema,
  commandStatusSchema,
  agentContextIssueSchema,
  agentContextReportSchema,
} from './environment.schema.js';

export type {
  EnvServiceStatusContract,
  EnvStatusReportContract,
  DiagnosedExceptionContract,
  EnvLogsDiagnoseResultContract,
  PresenceContract,
  CommandStatusContract,
  AgentContextIssueContract,
  AgentContextReportContract,
} from './environment.schema.js';

// Health schemas (liferay_check, liferay_doctor, liferay_mcp_check)
export {
  liferayHealthResultSchema,
  doctorCheckSchema,
  doctorToolStatusSchema,
  doctorReportSchema,
  mcpCheckResultSchema,
} from './health.schema.js';

export type {
  LiferayHealthResultContract,
  DoctorCheckContract,
  DoctorToolStatusContract,
  DoctorReportContract,
  McpCheckResultContract,
} from './health.schema.js';

// Deploy schemas (liferay_deploy_status)
export {deployStatusModuleSchema, deployStatusResultSchema} from './deploy.schema.js';

export type {DeployStatusModuleContract, DeployStatusResultContract} from './deploy.schema.js';

// OSGi schemas (liferay_osgi_status, liferay_osgi_diag, liferay_osgi_thread_dump)
export {osgiStatusResultSchema, osgiDiagResultSchema, osgiThreadDumpResultSchema} from './osgi.schema.js';

export type {
  OsgiStatusResultContract,
  OsgiDiagResultContract,
  OsgiThreadDumpResultContract,
} from './osgi.schema.js';

// Dashboard schemas (dashboard HTTP API JSON responses)
export {
  dashboardTaskLevelSchema,
  dashboardTaskStatusSchema,
  dashboardTaskLogEntrySchema,
  dashboardTaskSchema,
  dashboardTaskListResponseSchema,
  dashboardTaskAcceptedResponseSchema,
  dashboardTaskBlockedResponseSchema,
  dashboardTaskCancelResponseSchema,
  dashboardGitCommitSchema,
  dashboardAheadBehindSchema,
  dashboardEnvSchema,
  dashboardWorktreeSchema,
  dashboardMcpClientStatusSchema,
  dashboardMcpStatusSchema,
  dashboardStatusResponseSchema,
  dashboardLogsResponseSchema,
  dashboardLogStreamEventSchema,
  dashboardMaintenancePreviewResponseSchema,
} from './dashboard.schema.js';

export type {
  DashboardTaskLevelContract,
  DashboardTaskStatusContract,
  DashboardTaskLogEntryContract,
  DashboardTaskContract,
  DashboardTaskListResponseContract,
  DashboardTaskAcceptedResponseContract,
  DashboardTaskBlockedResponseContract,
  DashboardTaskCancelResponseContract,
  DashboardGitCommitContract,
  DashboardAheadBehindContract,
  DashboardEnvContract,
  DashboardWorktreeContract,
  DashboardMcpClientStatusContract,
  DashboardMcpStatusContract,
  DashboardStatusResponseContract,
  DashboardLogsResponseContract,
  DashboardLogStreamEventContract,
  DashboardMaintenancePreviewResponseContract,
} from './dashboard.schema.js';
