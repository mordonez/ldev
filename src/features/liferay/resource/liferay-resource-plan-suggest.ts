import type {
  ResourcePlanOccurrence,
  ResourcePlanOptions,
  ResourcePlanResourceType,
  ResourcePlanSuggestedImport,
} from './liferay-resource-plan-types.js';

export function buildWhereUsedCommand(type: ResourcePlanResourceType, key: string, sites?: string[]): string {
  const siteFlags = (sites ?? []).map((site) => ` --site ${site}`).join('');
  return `ldev portal inventory where-used --type ${type} --key ${key}${siteFlags}`;
}

export function buildSuggestedImport(
  type: ResourcePlanResourceType,
  owner: ResourcePlanOccurrence,
  occurrences: ResourcePlanOccurrence[],
): ResourcePlanSuggestedImport {
  const notes: string[] = [];

  if (occurrences.length > 1) {
    const sites = occurrences.map((occurrence) => occurrence.siteFriendlyUrl).join(', ');
    notes.push(
      `Key '${owner.key}' exists in ${occurrences.length} sites (${sites}). ` +
        'Confirm the owner site before importing; importing into the wrong site creates a divergent duplicate.',
    );
  }

  if (type === 'fragment') {
    notes.push(
      'Fragment import has no --check-only preview. Export the current fragment first as a rollback baseline.',
    );
    return {
      command: `ldev resource import-fragment --site ${owner.siteFriendlyUrl} --fragment ${owner.key}`,
      checkOnly: false,
      notes,
    };
  }

  const flag = {structure: '--structure', template: '--template', adt: '--adt'}[type];
  const commandName = {structure: 'import-structure', template: 'import-template', adt: 'import-adt'}[type];

  if (type === 'adt' && owner.widgetType) {
    notes.push(`ADT widget type: ${owner.widgetType}. Pass --widget-type ${owner.widgetType} if inference fails.`);
  }

  return {
    command: `ldev resource ${commandName} --site ${owner.siteFriendlyUrl} ${flag} ${owner.key} --check-only`,
    checkOnly: true,
    notes,
  };
}

export function buildValidationSteps(
  type: ResourcePlanResourceType,
  owner: ResourcePlanOccurrence,
  suggestedImport: ResourcePlanSuggestedImport,
  options: ResourcePlanOptions,
): string[] {
  const site = owner.siteFriendlyUrl;
  const key = owner.key;
  const exportCommand = {
    structure: `ldev resource export-structure --site ${site} --structure ${key}`,
    template: `ldev resource export-template --site ${site} --template ${key}`,
    adt: `ldev resource export-adt --site ${site} --adt ${key}`,
    fragment: `ldev resource export-fragment --site ${site} --fragment ${key}`,
  }[type];
  const readBackCommand = {
    structure: `ldev resource structure --structure ${key} --site ${site} --json`,
    template: `ldev resource template --template ${key} --site ${site} --json`,
    adt: `ldev resource adt --adt ${key} --site ${site} --json`,
    fragment: `ldev resource fragments --site ${site} --json`,
  }[type];

  const steps = [
    `Export the current portal state as a baseline: ${exportCommand}`,
    suggestedImport.checkOnly
      ? `Validate the local file without writing: ${suggestedImport.command}`
      : `Import the local resource (no preview available): ${suggestedImport.command}`,
  ];

  if (suggestedImport.checkOnly) {
    steps.push('Apply the change by re-running the import without --check-only.');
  }

  steps.push(
    `Read back the imported resource and verify the content: ${readBackCommand}`,
    `Re-check impacted pages: ${buildWhereUsedCommand(type, key, options.sites)}`,
    'Open the matched page URLs from the usage section and verify they still render correctly.',
  );

  return steps;
}
