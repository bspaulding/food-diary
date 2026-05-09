const ENDPOINT = process.env.HASURA_ENDPOINT ?? 'http://localhost:8080/v1/graphql';
const ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? 'testadminsecret';

interface GQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

export class GraphQLError extends Error {
  errors: GQLError[];
  constructor(errors: GQLError[]) {
    super(errors[0]?.message ?? 'GraphQL error');
    this.errors = errors;
    this.name = 'GraphQLError';
  }
}

async function gql<T = Record<string, unknown>>(
  headers: Record<string, string>,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: GQLError[] };
  if (json.errors && json.errors.length > 0) {
    throw new GraphQLError(json.errors);
  }
  return json.data!;
}

function makeClient(headers: Record<string, string>) {
  return {
    request<T = Record<string, unknown>>(
      query: string,
      variables?: Record<string, unknown>,
    ): Promise<T> {
      return gql<T>(headers, query, variables);
    },
  };
}

export function adminClient() {
  return makeClient({ 'X-Hasura-Admin-Secret': ADMIN_SECRET });
}

export function userClient(userId: string) {
  return makeClient({
    'X-Hasura-Admin-Secret': ADMIN_SECRET,
    'X-Hasura-Role': 'user',
    'X-Hasura-User-Id': userId,
  });
}
