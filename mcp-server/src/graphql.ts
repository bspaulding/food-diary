import { logger } from "./logger.js";

export async function gql<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const url =
    process.env.HASURA_GRAPHQL_URL ?? "https://direct-satyr-14.hasura.app/v1/graphql";

  const start = Date.now();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    logger.error("hasura http error", { url, status: response.status });
    throw new Error(`Hasura request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data: T; errors?: { message: string }[] };

  if (json.errors?.length) {
    const errors = json.errors.map((e) => e.message);
    logger.error("hasura graphql error", { url, errors });
    throw new Error(errors.join(", "));
  }

  logger.info("hasura ok", { url, duration_ms: Date.now() - start });
  return json.data;
}
