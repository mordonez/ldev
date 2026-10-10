import fs from 'fs-extra';
import path from 'node:path';

import type {ResourceLintFinding, ResourceLintResult} from '../../../core/contracts/index.js';
import {isRecord, parseJsonSafely} from '../../../core/utils/json.js';
import {LiferayErrors} from '../errors/index.js';
import {buildResourceLintResult, createResourceLintFinding} from './liferay-resource-lint-shared.js';

/**
 * Static linter for `page-definition.json` files (layouts, page templates and
 * display page templates) plus companion `ddm-structures/*.xml` descriptors.
 *
 * Catches Liferay authoring traps that fail silently at runtime:
 * - missing `"type": "Root"` on the top-level pageElement (empty page, no log line)
 * - miscased reserved Info Item field keys such as `"Title"` (mapping never resolves)
 * - DDM structure field names shadowed by reserved JournalArticle Info Item fields
 * - `numberOfItems` smaller than `numberOfItemsPerPage` in Collection Display config
 */

export type LiferayResourceLintPageDefinitionOptions = {
  file?: string;
  dir?: string;
};

/**
 * Reserved JournalArticle Info Item field keys, from
 * com.liferay.journal.web.internal.info.item.JournalArticleInfoItemFields.
 * Custom DDM fields sharing one of these names are silently shadowed.
 */
export const RESERVED_INFO_ITEM_FIELD_NAMES = [
  'authorName',
  'authorProfileImage',
  'createDate',
  'description',
  'displayDate',
  'expirationDate',
  'lastEditorName',
  'lastEditorProfileImage',
  'modifiedDate',
  'previewImage',
  'publishDate',
  'smallImage',
  'title',
] as const;

const RESERVED_FIELD_NAMES = new Set<string>(RESERVED_INFO_ITEM_FIELD_NAMES);
const RESERVED_FIELD_NAMES_LOWERCASE = new Map<string, string>(
  RESERVED_INFO_ITEM_FIELD_NAMES.map((name) => [name.toLowerCase(), name]),
);

const PAGE_DEFINITION_FILE_NAME = 'page-definition.json';
const SCAN_IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.gradle', 'build', 'dist', 'bundles']);

export async function runLiferayResourceLintPageDefinition(
  options: LiferayResourceLintPageDefinitionOptions,
): Promise<ResourceLintResult> {
  const {target, jsonFiles, xmlFiles} = await resolvePageDefinitionTargets(options);
  const findings: ResourceLintFinding[] = [];

  for (const file of jsonFiles) {
    findings.push(...(await lintPageDefinitionFile(file)));
  }

  for (const file of xmlFiles) {
    findings.push(...(await lintDdmStructureXmlFile(file)));
  }

  return buildResourceLintResult(target, jsonFiles.length + xmlFiles.length, findings);
}

// ── Target resolution ─────────────────────────────────────────────────────────

async function resolvePageDefinitionTargets(
  options: LiferayResourceLintPageDefinitionOptions,
): Promise<{target: string; jsonFiles: string[]; xmlFiles: string[]}> {
  if (options.file !== undefined && options.file.trim() !== '') {
    const file = path.resolve(options.file);
    if (!(await fs.pathExists(file))) {
      throw LiferayErrors.resourceError(`File not found: ${file}`);
    }

    return file.toLowerCase().endsWith('.xml')
      ? {target: file, jsonFiles: [], xmlFiles: [file]}
      : {target: file, jsonFiles: [file], xmlFiles: []};
  }

  const dir = path.resolve(options.dir ?? '.');
  if (!(await fs.pathExists(dir))) {
    throw LiferayErrors.resourceError(`Directory not found: ${dir}`);
  }

  const jsonFiles: string[] = [];
  const xmlFiles: string[] = [];
  await collectPageDefinitionFiles(dir, jsonFiles, xmlFiles);
  jsonFiles.sort((left, right) => left.localeCompare(right));
  xmlFiles.sort((left, right) => left.localeCompare(right));

  if (jsonFiles.length === 0 && xmlFiles.length === 0) {
    throw LiferayErrors.resourceError(
      `No ${PAGE_DEFINITION_FILE_NAME} or ddm-structures/*.xml files found under ${dir}`,
    );
  }

  return {target: dir, jsonFiles, xmlFiles};
}

async function collectPageDefinitionFiles(dir: string, jsonFiles: string[], xmlFiles: string[]): Promise<void> {
  const entries = await fs.readdir(dir, {withFileTypes: true});

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SCAN_IGNORED_DIRECTORIES.has(entry.name)) {
        await collectPageDefinitionFiles(entryPath, jsonFiles, xmlFiles);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === PAGE_DEFINITION_FILE_NAME) {
      jsonFiles.push(entryPath);
    } else if (entry.name.toLowerCase().endsWith('.xml') && path.basename(dir) === 'ddm-structures') {
      xmlFiles.push(entryPath);
    }
  }
}

// ── page-definition.json rules ────────────────────────────────────────────────

async function lintPageDefinitionFile(file: string): Promise<ResourceLintFinding[]> {
  const raw = await fs.readFile(file, 'utf8');
  const parsed = parseJsonSafely<unknown>(raw);

  if (!isRecord(parsed)) {
    return [createResourceLintFinding(file, 'invalid-json', 'error', 'File is not valid JSON or is not a JSON object')];
  }

  const findings: ResourceLintFinding[] = [];
  findings.push(...checkRootPageElementType(file, parsed));
  walkJson(parsed, '$', (value, jsonPath) => {
    findings.push(...checkMiscasedReservedFieldKey(file, value, jsonPath));
    findings.push(...checkCollectionItemCap(file, value, jsonPath));
  });

  return findings;
}

function checkRootPageElementType(file: string, parsed: Record<string, unknown>): ResourceLintFinding[] {
  const pageElement = parsed.pageElement;
  if (!isRecord(pageElement)) {
    return [
      createResourceLintFinding(
        file,
        'missing-page-element',
        'error',
        'Missing top-level "pageElement" object; Liferay ignores this file silently',
        '$.pageElement',
      ),
    ];
  }

  if (pageElement.type !== 'Root') {
    return [
      createResourceLintFinding(
        file,
        'missing-root-type',
        'error',
        'Top-level pageElement must declare "type": "Root"; without it the page deploys but renders completely empty with no log line',
        '$.pageElement.type',
      ),
    ];
  }

  return [];
}

function checkMiscasedReservedFieldKey(file: string, value: unknown, jsonPath: string): ResourceLintFinding[] {
  if (!isRecord(value) || typeof value.fieldKey !== 'string') {
    return [];
  }

  const fieldKey = value.fieldKey;
  if (RESERVED_FIELD_NAMES.has(fieldKey)) {
    return [];
  }

  const reserved = RESERVED_FIELD_NAMES_LOWERCASE.get(fieldKey.toLowerCase());
  if (reserved === undefined) {
    return [];
  }

  return [
    createResourceLintFinding(
      file,
      'miscased-reserved-field-key',
      'warning',
      `fieldKey "${fieldKey}" does not match the reserved Info Item field "${reserved}"; unless a custom DDM field is really named "${fieldKey}", the mapping silently fails to resolve — use "${reserved}"`,
      `${jsonPath}.fieldKey`,
    ),
  ];
}

function checkCollectionItemCap(file: string, value: unknown, jsonPath: string): ResourceLintFinding[] {
  if (!isRecord(value)) {
    return [];
  }

  const numberOfItems = value.numberOfItems;
  const numberOfItemsPerPage = value.numberOfItemsPerPage;
  if (typeof numberOfItems !== 'number' || typeof numberOfItemsPerPage !== 'number') {
    return [];
  }

  if (numberOfItems >= numberOfItemsPerPage) {
    return [];
  }

  return [
    createResourceLintFinding(
      file,
      'collection-number-of-items-cap',
      'warning',
      `numberOfItems (${numberOfItems}) is lower than numberOfItemsPerPage (${numberOfItemsPerPage}); numberOfItems is a hard cap on the total result count, so the Collection Display silently shows at most ${numberOfItems} item(s)`,
      `${jsonPath}.numberOfItems`,
    ),
  ];
}

function walkJson(value: unknown, jsonPath: string, visit: (value: unknown, jsonPath: string) => void): void {
  visit(value, jsonPath);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkJson(item, `${jsonPath}[${index}]`, visit);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkJson(child, `${jsonPath}.${key}`, visit);
    }
  }
}

// ── ddm-structures/*.xml rule ─────────────────────────────────────────────────

const DYNAMIC_ELEMENT_PATTERN = /<dynamic-element\b[^>]*>/g;
const NAME_ATTRIBUTE_PATTERN = /\bname\s*=\s*"([^"]*)"/;

async function lintDdmStructureXmlFile(file: string): Promise<ResourceLintFinding[]> {
  const raw = await fs.readFile(file, 'utf8');
  const findings: ResourceLintFinding[] = [];

  for (const match of raw.matchAll(DYNAMIC_ELEMENT_PATTERN)) {
    const name = NAME_ATTRIBUTE_PATTERN.exec(match[0])?.[1];
    if (name === undefined || !RESERVED_FIELD_NAMES.has(name)) {
      continue;
    }

    findings.push(
      createResourceLintFinding(
        file,
        'reserved-info-item-field-name',
        'warning',
        `DDM structure field "${name}" collides with a reserved JournalArticle Info Item field; the custom field is silently shadowed in CollectionItem/DisplayPageItem mappings — rename it`,
        `line ${lineNumberAt(raw, match.index)}`,
      ),
    );
  }

  return findings;
}

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index && position < content.length; position += 1) {
    if (content.charCodeAt(position) === 10) {
      line += 1;
    }
  }

  return line;
}
