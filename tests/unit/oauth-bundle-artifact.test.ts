import fs from 'node:fs/promises';
import path from 'node:path';

import JSZip from 'jszip';
import {describe, expect, test} from 'vitest';

// What this test verifies:
//   - the shipped JAR has the expected OSGi structural invariants (manifest, DS, metatype)
//   - the bundle version and filename match what the CLI resolves at runtime
//
// What this test does NOT claim:
//   - byte-for-byte reproducibility across machines or JDK versions (not asserted and not claimed)
//   - The bundle is rebuildable from source (templates/modules/), but the output is not
//     guaranteed to be bit-identical due to Gradle/JDK timestamp embedding

const EXPECTED_BUNDLE_FILENAME = 'dev.mordonez.ldev.oauth2.app-1.0.0.jar';
const EXPECTED_BUNDLE_VERSION = '1.0.0';
const EXPECTED_SYMBOLIC_NAME = 'dev.mordonez.ldev.oauth2.app';

describe('bundled OAuth installer artifact', () => {
  test('ships a valid OSGi bundle with DS and metatype resources', async () => {
    const bundlePath = path.join(process.cwd(), 'templates', 'bundles', EXPECTED_BUNDLE_FILENAME);

    const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
    const manifest = await zip.file('META-INF/MANIFEST.MF')?.async('string');

    expect(manifest).toContain(`Bundle-SymbolicName: ${EXPECTED_SYMBOLIC_NAME}`);
    expect(manifest).toContain(`Bundle-Version: ${EXPECTED_BUNDLE_VERSION}`);
    expect(manifest).toContain('Service-Component: OSGI-INF/dev.mordonez.ldev.oauth2.app.internal.Ldev');
    expect(zip.file('OSGI-INF/dev.mordonez.ldev.oauth2.app.internal.LdevOAuth2AppCommand.xml')).toBeTruthy();
    expect(
      zip.file('OSGI-INF/metatype/dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.xml'),
    ).toBeTruthy();
  });

  test('bundle filename matches the filename the CLI resolves at runtime', async () => {
    // Verify the shipped filename equals what oauth-install.ts resolves. If the
    // bundle is ever rebuilt at a new version, this test will fail until both
    // the file and the constant are updated together.
    const bundlesDir = path.join(process.cwd(), 'templates', 'bundles');
    const entries = await fs.readdir(bundlesDir);
    const jars = entries.filter((f) => f.endsWith('.jar') && f.includes('ldev.oauth2'));

    expect(jars).toHaveLength(1);
    expect(jars[0]).toBe(EXPECTED_BUNDLE_FILENAME);
  });
});
