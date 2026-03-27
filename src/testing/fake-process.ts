export function makeFakeProcessEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return {...values};
}
