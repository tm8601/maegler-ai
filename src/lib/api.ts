export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "https://maegler-ai-api.ai-beregner.dk";
  }

  const { protocol, hostname, port } = window.location;

  // Dynamic ai-beregner.dk resolution for Coolify
  if (hostname === "maegler-ai.ai-beregner.dk") {
    return "https://maegler-ai-api.ai-beregner.dk";
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}
