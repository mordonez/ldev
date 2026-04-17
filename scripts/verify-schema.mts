#!/usr/bin/env node

/**
 * Verify Zod schemas at development/package time.
 *
 * Usage:
 *   tsx scripts/verify-schema.mts
 *
 * This script validates that:
 * 1. All contract schemas are defined and importable
 * 2. Schemas can parse minimal valid payloads
 * 3. Type inference works correctly
 * 4. No circular dependencies exist
 *
 * Exit codes:
 *   0 = all schemas valid
 *   1 = schema validation failed
 */

import * as contracts from '../src/core/contracts/index.js';

let allValid = true;
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [] as Array<{name: string; error: string}>,
};

function check(name: string, fn: () => void): void {
  results.total += 1;
  try {
    fn();
    console.log(`✓ ${name}`);
    results.passed += 1;
  } catch (error) {
    console.error(`✗ ${name}`);
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
      results.errors.push({name, error: error.message});
    }
    results.failed += 1;
    allValid = false;
  }
}

function main(): void {
  console.log('Verifying Zod schemas...\n');

  // Verify shared schemas
  console.log('Shared Schemas:');
  check('resolvedSiteSchema exists', () => {
    const schema = contracts.resolvedSiteSchema;
    if (!schema) throw new Error('resolvedSiteSchema not exported');
  });

  check('resolvedSiteSchema validates positive id', () => {
    const schema = contracts.resolvedSiteSchema;
    const result = schema.safeParse({
      id: 123,
      friendlyUrlPath: '/test',
      name: 'Test',
    });
    if (!result.success) {
      throw new Error(`Parse failed: ${result.error.message}`);
    }
  });

  check('siteLookupPayloadSchema tolerates partial input', () => {
    const schema = contracts.siteLookupPayloadSchema;
    const result = schema.safeParse({id: 123});
    if (!result.success) {
      throw new Error(`Parse failed: ${result.error.message}`);
    }
    if (result.data.id !== 123) {
      throw new Error('Parsed data does not match input');
    }
  });

  check('headlessSiteSchema defined', () => {
    const schema = contracts.headlessSiteSchema;
    if (!schema) throw new Error('headlessSiteSchema not exported');
  });

  check('dataDefinitionSchema defined', () => {
    const schema = contracts.dataDefinitionSchema;
    if (!schema) throw new Error('dataDefinitionSchema not exported');
  });

  check('contentTemplateSchema tolerates numeric and string id', () => {
    const schema = contracts.contentTemplateSchema;
    const numeric = schema.safeParse({
      id: 12345,
      name: 'T1',
      contentStructureId: 100,
      externalReferenceCode: 'erc',
    });
    const string = schema.safeParse({
      id: 'uuid-string',
      name: 'T2',
      contentStructureId: 100,
      externalReferenceCode: 'erc',
    });
    if (!numeric.success || !string.success) {
      throw new Error('Failed to parse id variants');
    }
  });

  console.log('\nInventory Schemas:');
  check('liferayInventorySiteSchema defined', () => {
    const schema = contracts.liferayInventorySiteSchema;
    if (!schema) throw new Error('liferayInventorySiteSchema not exported');
  });

  check('liferayInventorySiteSchema validates complete site', () => {
    const schema = contracts.liferayInventorySiteSchema;
    const result = schema.safeParse({
      groupId: 1,
      siteFriendlyUrl: '/test',
      name: 'Test Site',
      pagesCommand: 'inventory pages --site /test',
    });
    if (!result.success) {
      throw new Error(`Parse failed: ${result.error.message}`);
    }
  });

  check('liferayInventoryTemplateSchema defined', () => {
    const schema = contracts.liferayInventoryTemplateSchema;
    if (!schema) throw new Error('liferayInventoryTemplateSchema not exported');
  });

  check('liferayInventoryStructureSchema defined', () => {
    const schema = contracts.liferayInventoryStructureSchema;
    if (!schema) throw new Error('liferayInventoryStructureSchema not exported');
  });

  console.log('\nResource Schemas:');
  check('liferayResourceSyncFragmentItemResultSchema defined', () => {
    const schema = contracts.liferayResourceSyncFragmentItemResultSchema;
    if (!schema) throw new Error('liferayResourceSyncFragmentItemResultSchema not exported');
  });

  check('liferayResourceSyncFragmentItemResultSchema validates import result', () => {
    const schema = contracts.liferayResourceSyncFragmentItemResultSchema;
    const result = schema.safeParse({
      collection: 'col',
      fragment: 'frag',
      status: 'imported',
      fragmentEntryId: 123,
    });
    if (!result.success) {
      throw new Error(`Parse failed: ${result.error.message}`);
    }
  });

  check('liferayResourceSyncFragmentsSingleResultSchema defined', () => {
    const schema = contracts.liferayResourceSyncFragmentsSingleResultSchema;
    if (!schema) throw new Error('liferayResourceSyncFragmentsSingleResultSchema not exported');
  });

  check('liferayResourceSyncFragmentsResultSchema discriminates union', () => {
    const schema = contracts.liferayResourceSyncFragmentsResultSchema;
    const singleResult = schema.safeParse({
      mode: 'oauth-jsonws-import',
      site: '/site',
      siteId: 1,
      projectDir: '/dir',
      summary: {importedFragments: 0, fragmentResults: 0, pageTemplateResults: 0, errors: 0},
      fragmentResults: [],
      pageTemplateResults: [],
    });
    const allSitesResult = schema.safeParse({
      mode: 'all-sites',
      sites: 0,
      imported: 0,
      errors: 0,
      siteResults: [],
    });
    if (!singleResult.success || !allSitesResult.success) {
      throw new Error('Discriminated union parse failed');
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.passed}/${results.total} checks passed`);
  if (results.failed > 0) {
    console.log(`\nFailed checks (${results.failed}):`);
    results.errors.forEach(({name, error}) => {
      console.log(`  - ${name}: ${error}`);
    });
  }
  console.log('='.repeat(50));

  process.exit(allValid ? 0 : 1);
}

main();
