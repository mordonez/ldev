import fs from 'fs-extra';
import path from 'node:path';

import type {ResourceLintFinding, ResourceLintResult} from '../../../core/contracts/index.js';
import {parseJsonRecord} from '../../../core/utils/json.js';
import {LiferayErrors} from '../errors/index.js';
import {buildResourceLintResult, createResourceLintFinding} from './liferay-resource-lint-shared.js';

/**
 * Static linter for fragment HTML files.
 *
 * Detects structurally invalid editable markup that Liferay accepts silently:
 * - `data-lfr-editable-*` (or `<lfr-editable>`) elements nested inside another
 *   editable — inner editables are invisible to field mapping with no error
 * - editable elements missing the id or type attribute
 * - unknown editable types
 * - duplicate editable ids within one fragment
 */

export type LiferayResourceLintFragmentsOptions = {
  file?: string;
  dir?: string;
};

const KNOWN_EDITABLE_TYPES = new Set(['text', 'rich-text', 'image', 'link', 'html', 'date']);
const TEXT_LIKE_EDITABLE_TYPES = new Set(['text', 'rich-text']);
const SCAN_IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.gradle', 'build', 'dist', 'bundles']);
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

export async function runLiferayResourceLintFragments(
  options: LiferayResourceLintFragmentsOptions,
): Promise<ResourceLintResult> {
  const {target, htmlFiles} = await resolveFragmentHtmlTargets(options);
  const findings: ResourceLintFinding[] = [];

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    findings.push(...lintFragmentHtml(file, html));
  }

  return buildResourceLintResult(target, htmlFiles.length, findings);
}

// ── Target resolution ─────────────────────────────────────────────────────────

async function resolveFragmentHtmlTargets(
  options: LiferayResourceLintFragmentsOptions,
): Promise<{target: string; htmlFiles: string[]}> {
  if (options.file !== undefined && options.file.trim() !== '') {
    const file = path.resolve(options.file);
    if (!(await fs.pathExists(file))) {
      throw LiferayErrors.resourceError(`File not found: ${file}`);
    }

    return {target: file, htmlFiles: [file]};
  }

  const dir = path.resolve(options.dir ?? '.');
  if (!(await fs.pathExists(dir))) {
    throw LiferayErrors.resourceError(`Directory not found: ${dir}`);
  }

  const htmlFiles: string[] = [];
  await collectFragmentHtmlFiles(dir, htmlFiles);
  htmlFiles.sort((left, right) => left.localeCompare(right));

  if (htmlFiles.length === 0) {
    throw LiferayErrors.resourceError(`No fragment HTML files (fragment.json + html) found under ${dir}`);
  }

  return {target: dir, htmlFiles};
}

async function collectFragmentHtmlFiles(dir: string, htmlFiles: string[]): Promise<void> {
  const entries = await fs.readdir(dir, {withFileTypes: true});

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SCAN_IGNORED_DIRECTORIES.has(entry.name)) {
        await collectFragmentHtmlFiles(entryPath, htmlFiles);
      }
      continue;
    }

    if (!entry.isFile() || entry.name !== 'fragment.json') {
      continue;
    }

    const fragmentJson = parseJsonRecord(await fs.readFile(entryPath, 'utf8'));
    const htmlPath = typeof fragmentJson?.htmlPath === 'string' ? fragmentJson.htmlPath : 'index.html';
    const htmlFile = path.join(dir, htmlPath);
    if (await fs.pathExists(htmlFile)) {
      htmlFiles.push(htmlFile);
    }
  }
}

// ── Fragment HTML lint ────────────────────────────────────────────────────────

type EditableInfo = {
  id: string | undefined;
  type: string | undefined;
};

type OpenElement = {
  tagName: string;
  editable: EditableInfo | undefined;
};

export function lintFragmentHtml(file: string, html: string): ResourceLintFinding[] {
  const findings: ResourceLintFinding[] = [];
  const stack: OpenElement[] = [];
  const seenEditableIds = new Map<string, number>();
  let rawTextUntil: string | undefined;

  const tagPattern = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^\s/>]*(?:"[^"]*"|'[^']*'|[^"'>])*>/g;

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    if (tag.startsWith('<!--')) {
      continue;
    }

    const line = lineNumberAt(html, match.index);

    if (tag.startsWith('</')) {
      const tagName = parseTagName(tag.slice(2));
      if (tagName === undefined) {
        continue;
      }

      if (rawTextUntil !== undefined) {
        if (tagName !== rawTextUntil) {
          continue;
        }
        rawTextUntil = undefined;
      }

      popUntil(stack, tagName);
      continue;
    }

    if (rawTextUntil !== undefined) {
      continue;
    }

    const tagName = parseTagName(tag.slice(1));
    if (tagName === undefined) {
      continue;
    }

    const attributes = parseAttributes(tag);
    const editable = readEditableInfo(tagName, attributes);

    if (editable !== undefined) {
      findings.push(...checkEditableElement(file, editable, stack, seenEditableIds, line));
    }

    const selfClosing = /\/\s*>$/.test(tag);
    if (!selfClosing && !VOID_ELEMENTS.has(tagName)) {
      stack.push({tagName, editable});
      if (RAW_TEXT_ELEMENTS.has(tagName)) {
        rawTextUntil = tagName;
      }
    }
  }

  return findings;
}

function checkEditableElement(
  file: string,
  editable: EditableInfo,
  stack: OpenElement[],
  seenEditableIds: Map<string, number>,
  line: number,
): ResourceLintFinding[] {
  const findings: ResourceLintFinding[] = [];
  const location = `line ${line}`;
  const label = editable.id === undefined ? '(missing id)' : `"${editable.id}"`;

  if (editable.id === undefined || editable.type === undefined) {
    const missing = editable.id === undefined ? 'id' : 'type';
    findings.push(
      createResourceLintFinding(
        file,
        'incomplete-editable',
        'error',
        `Editable ${label} is missing its ${missing} attribute; Liferay ignores incomplete editables silently`,
        location,
      ),
    );
  }

  if (editable.type !== undefined && !KNOWN_EDITABLE_TYPES.has(editable.type)) {
    findings.push(
      createResourceLintFinding(
        file,
        'unknown-editable-type',
        'error',
        `Editable ${label} declares unknown type "${editable.type}"; expected one of: ${[...KNOWN_EDITABLE_TYPES].join(', ')}`,
        location,
      ),
    );
  }

  if (editable.id !== undefined) {
    const firstLine = seenEditableIds.get(editable.id);
    if (firstLine === undefined) {
      seenEditableIds.set(editable.id, line);
    } else {
      findings.push(
        createResourceLintFinding(
          file,
          'duplicate-editable-id',
          'error',
          `Editable id "${editable.id}" is declared more than once (first seen at line ${firstLine}); ids must be unique within a fragment`,
          location,
        ),
      );
    }
  }

  const ancestor = findNearestEditableAncestor(stack);
  if (ancestor !== undefined) {
    findings.push(buildNestedEditableFinding(file, editable, ancestor, location));
  }

  return findings;
}

function buildNestedEditableFinding(
  file: string,
  editable: EditableInfo,
  ancestor: EditableInfo,
  location: string,
): ResourceLintFinding {
  const innerLabel = editable.id === undefined ? 'editable' : `Editable "${editable.id}"`;
  const outerLabel = ancestor.id === undefined ? 'another editable' : `editable "${ancestor.id}"`;
  const base =
    `${innerLabel} is nested inside ${outerLabel}; nested editables are invisible to Liferay field mapping ` +
    'and their fragmentFields mappings are accepted at deploy time but do nothing at render time.';

  if (ancestor.type === 'link' && editable.type !== undefined && TEXT_LIKE_EDITABLE_TYPES.has(editable.type)) {
    return createResourceLintFinding(
      file,
      'nested-editable',
      'warning',
      `${base} Fix by mapping "text" and "fragmentLink" together on the outer link editable id and dropping the inner id from fragmentFields`,
      location,
    );
  }

  if (ancestor.type === 'link' && editable.type === 'image') {
    return createResourceLintFinding(
      file,
      'nested-editable',
      'error',
      `${base} An image nested in a link cannot be fixed via mapping (link editables do not accept fragmentImage); remove the wrapping link element so the image becomes a top-level editable`,
      location,
    );
  }

  return createResourceLintFinding(
    file,
    'nested-editable',
    'error',
    `${base} Restructure the HTML so editables do not nest`,
    location,
  );
}

function findNearestEditableAncestor(stack: OpenElement[]): EditableInfo | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const editable = stack[index].editable;
    if (editable !== undefined) {
      return editable;
    }
  }

  return undefined;
}

// ── HTML tokenizer helpers ────────────────────────────────────────────────────

function parseTagName(afterAngle: string): string | undefined {
  const match = /^([a-zA-Z][-a-zA-Z0-9_:]*)/.exec(afterAngle);
  return match?.[1]?.toLowerCase();
}

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([a-zA-Z_:@][-a-zA-Z0-9_:.@]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<\/?[a-zA-Z][^\s/>]*/, '').replace(/\/?>$/, '');

  for (const match of body.matchAll(attributePattern)) {
    const groups = match as unknown as Array<string | undefined>;
    attributes.set(match[1].toLowerCase(), groups[2] ?? groups[3] ?? groups[4] ?? '');
  }

  return attributes;
}

function readEditableInfo(tagName: string, attributes: Map<string, string>): EditableInfo | undefined {
  if (tagName === 'lfr-editable') {
    return {
      id: normalizeAttribute(attributes.get('id')),
      type: normalizeAttribute(attributes.get('type')),
    };
  }

  const hasEditableAttribute = [...attributes.keys()].some((name) => name.startsWith('data-lfr-editable-'));
  if (!hasEditableAttribute) {
    return undefined;
  }

  return {
    id: normalizeAttribute(attributes.get('data-lfr-editable-id')),
    type: normalizeAttribute(attributes.get('data-lfr-editable-type')),
  };
}

function normalizeAttribute(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function popUntil(stack: OpenElement[], tagName: string): void {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].tagName === tagName) {
      stack.length = index;
      return;
    }
  }
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
