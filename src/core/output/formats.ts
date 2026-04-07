import {z} from 'zod';

export const outputFormatSchema = z.enum(['text', 'json', 'ndjson']);

export type OutputFormat = z.infer<typeof outputFormatSchema>;
