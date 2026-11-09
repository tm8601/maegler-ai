export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "https://maegler.ai-beregner.dk";
  }

  const { protocol, hostname, port } = window.location;

  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}
