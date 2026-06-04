export async function gql<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const url =
    process.env.HASURA_GRAPHQL_URL ?? "https://direct-satyr-14.hasura.app/v1/graphql";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Hasura request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data: T; errors?: { message: string }[] };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  return json.data;
}
