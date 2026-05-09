pub const auth0_domain = "motingo.auth0.com"

pub const auth0_client_id = "NAk5igfLGjmTOsHjWPGDTens9FWbstN9"

pub fn auth0_redirect_uri() -> String {
  js_get_location_protocol()
  <> "//"
  <> js_get_location_host()
  <> "/auth/callback"
}

pub const auth0_audience = "https://direct-satyr-14.hasura.app/v1/graphql"

@external(javascript, "./app.ffi.mjs", "getLocationProtocol")
fn js_get_location_protocol() -> String

@external(javascript, "./app.ffi.mjs", "getLocationHost")
fn js_get_location_host() -> String
