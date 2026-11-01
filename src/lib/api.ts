export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "https://maegler-ai-api.ai-beregner.dk";
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.endsWith(".ai-beregner.dk")) {
    const apiHostname = hostname.replace(/^maegler-ai\./, "maegler-ai-api.");
    return `https://${apiHostname}`;
  }

  if (hostname.startsWith("maegler-ai.") && hostname.endsWith(".sslip.io")) {
    const apiHostname = hostname.replace(/^maegler-ai\./, "maegler-ai-api.");
    return `${protocol}//${apiHostname}${port ? `:${port}` : ""}`;
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}
