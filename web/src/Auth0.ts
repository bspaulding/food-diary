import { createSignal, createResource } from "solid-js";
import createAuth0Client from "@auth0/auth0-spa-js";
import { useNavigate } from "@solidjs/router";

async function configureAuth0Client() {
  return await createAuth0Client({
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    client_id: import.meta.env.VITE_AUTH0_CLIENT_ID,
    audience: "https://direct-satyr-14.hasura.app/v1/graphql",
    redirect_uri: `${location.protocol}//${location.host}/auth/callback`,
    cacheLocation: "localstorage",
  });
}

export function useAuth() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [user, setUser] = createSignal<object>();
  const [accessToken, setAccessToken] = createSignal<string>("");
  const [auth0] = createResource(async function () {
    const client = await configureAuth0Client();
    const params = new URLSearchParams(location.search);
    if (params.has("code") && params.has("state")) {
      await client.handleRedirectCallback(location.href);
      navigate("/", { replace: true });
    }
    if (setIsAuthenticated(await client.isAuthenticated())) {
      setUser(await client.getUser());
      setAccessToken(await client.getTokenSilently());
    }
    return client;
  });

  return [{ isAuthenticated, auth0, user, accessToken }];
}
