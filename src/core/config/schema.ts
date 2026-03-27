import {z} from 'zod';

export const appConfigSchema = z.object({
  cwd: z.string(),
  repoRoot: z.string().nullable(),
  dockerDir: z.string().nullable(),
  liferayDir: z.string().nullable(),
  files: z.object({
    dockerEnv: z.string().nullable(),
    liferayProfile: z.string().nullable(),
  }),
  liferay: z.object({
    url: z.string(),
    oauth2ClientId: z.string(),
    oauth2ClientSecret: z.string(),
    scopeAliases: z.string(),
    timeoutSeconds: z.number().int().positive(),
  }),
  paths: z.object({
    structures: z.string(),
    templates: z.string(),
    adts: z.string(),
    fragments: z.string(),
    migrations: z.string().optional(),
  }).optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
