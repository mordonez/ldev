import fs from 'fs-extra';
import path from 'node:path';

export async function writeLiferayResourceFile(
  payload: unknown,
  outputPath: string,
  options?: {pretty?: boolean; payloadNormalizer?: (payload: unknown) => unknown},
): Promise<string> {
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.ensureDir(path.dirname(resolvedOutputPath));
  const normalizedPayload = options?.payloadNormalizer ? options.payloadNormalizer(payload) : payload;
  const serialized =
    options?.pretty === false ? JSON.stringify(normalizedPayload) : JSON.stringify(normalizedPayload, null, 2);
  await fs.writeFile(resolvedOutputPath, `${serialized}\n`);
  return resolvedOutputPath;
}
