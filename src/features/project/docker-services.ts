export const DOCKER_SERVICES = ['postgres', 'elasticsearch', 'webserver'] as const;

export type DockerService = (typeof DOCKER_SERVICES)[number];

export function parseDockerServices(raw: string | undefined): DockerService[] {
  if (!raw) return [];

  return raw
    .split(',')
    .map((service) => service.trim().toLowerCase())
    .filter((service): service is DockerService => DOCKER_SERVICES.includes(service as DockerService));
}
