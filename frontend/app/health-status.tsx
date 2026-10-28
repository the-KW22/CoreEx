import { api } from "@/lib/api/client";

export async function HealthStatus() {
  const { data, error } = await api.GET("/api/health").catch(() => ({
    data: undefined,
    error: "Could not reach the API.",
  }));

  if (error || !data) {
    return <p role="alert">API unavailable. Is the backend running?</p>;
  }
  return <p>API status: {data.status}</p>;
}
