import type { ResourceOptions, ResourceReturn, ResourceSource } from "solid-js";
import { createResource } from "solid-js";
import { useAuth } from "./Auth0";
import { AuthorizationError } from "./Api";

/**
 * Type for the fetcher function used in createAuthorizedResource.
 * The fetcher receives an access token and the source value, and returns the resource data.
 */
export type AuthorizedResourceFetcher<S, T> = (
  accessToken: string,
  source: S,
) => T | Promise<T>;

/**
 * Creates a resource with automatic authentication token injection.
 * Similar to SolidJS's createResource, but automatically passes the access token as the first parameter to the fetcher.
 *
 * Usage patterns:
 * - Single parameter: createAuthorizedResource(fetcher)
 * - Two parameters with fetcher and options: createAuthorizedResource(fetcher, options)
 * - Two parameters with source and fetcher: createAuthorizedResource(source, fetcher)
 * - Three parameters: createAuthorizedResource(source, fetcher, options)
 */
function createAuthorizedResource<T, R = unknown>(
  fetcher: AuthorizedResourceFetcher<true, T>,
  options?: ResourceOptions<T, true>,
): ResourceReturn<T, R>;
function createAuthorizedResource<T, S, R = unknown>(
  source: ResourceSource<S>,
  fetcher: AuthorizedResourceFetcher<S, T>,
  options?: ResourceOptions<T, S>,
): ResourceReturn<T, R>;
function createAuthorizedResource<S = true, T = unknown, R = unknown>(
  source?: AuthorizedResourceFetcher<true, T> | ResourceSource<S>,
  fetcher?: AuthorizedResourceFetcher<S, T> | ResourceOptions<T, true>,
  options: Record<string, unknown> = {},
): ResourceReturn<T, R> {
  let finalSource: ResourceSource<S> | true = true;
  let finalFetcher: AuthorizedResourceFetcher<S, T>;
  let finalOptions: ResourceOptions<T, S> = options as ResourceOptions<T, S>;

  if (arguments.length === 2) {
    if (typeof fetcher === "object") {
      finalOptions = fetcher as unknown as ResourceOptions<T, S>;
      finalFetcher = source as unknown as AuthorizedResourceFetcher<S, T>;
      finalSource = true as unknown as ResourceSource<S>;
    } else {
      finalSource = source as ResourceSource<S>;
      finalFetcher = fetcher as AuthorizedResourceFetcher<S, T>;
    }
  } else if (arguments.length === 1) {
    finalFetcher = source as unknown as AuthorizedResourceFetcher<S, T>;
    finalSource = true as unknown as ResourceSource<S>;
  } else {
    finalSource = source as ResourceSource<S>;
    finalFetcher = fetcher as AuthorizedResourceFetcher<S, T>;
  }
  const [{ accessToken, auth0 }] = useAuth();
  const tokenizedSource: () => {
    accessToken: string;
    source: S | true;
  } = () => ({
    accessToken: accessToken(),
    source: finalSource === true ? (true as true) : (finalSource as () => S)(),
  });
  return createResource(
    tokenizedSource,
    async ({
      accessToken,
      source,
    }: {
      accessToken: string;
      source: S | true;
    }) => {
      try {
        return await finalFetcher(accessToken, source as S);
      } catch (error) {
        // If we get an authorization error, log out the user
        if (error instanceof AuthorizationError) {
          const client = auth0();
          if (client) {
            await client.logout({
              returnTo: window.location.origin,
            });
          }
        }
        // Re-throw the error so the resource can handle it
        throw error;
      }
    },
    finalOptions as unknown as ResourceOptions<
      T,
      { accessToken: string; source: S | true }
    >,
  ) as ResourceReturn<T, R>;
}

export default createAuthorizedResource;
