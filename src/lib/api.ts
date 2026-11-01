export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3011";
  }

  const { protocol, hostname, port } = window.location;

  // Dynamic sslip.io resolution for Coolify (127.0.0.1, 192.168.86.30, 100.100.55.20, etc.)
  if (hostname.startsWith("maegler-ai.") && hostname.endsWith(".sslip.io")) {
    const apiHostname = hostname.replace(/^maegler-ai\./, "maegler-ai-api.");
    return `${protocol}//${apiHostname}${port ? `:${port}` : ""}`;
  }

  if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("onrender.com")) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ""}`;
}
