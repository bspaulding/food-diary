const HASURA_URL =
  process.env.HASURA_GRAPHQL_URL ?? "https://direct-satyr-14.hasura.app/v1/graphql";

export async function gql<T>(
  jwt: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(HASURA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as { data: T; errors?: { message: string }[] };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  return json.data;
}
