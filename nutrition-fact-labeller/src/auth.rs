use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::convert::Infallible;
use warp::http::StatusCode;
use warp::{reject, Filter, Rejection};

const DEFAULT_AUDIENCE: &str = "https://direct-satyr-14.hasura.app/v1/graphql";

#[derive(Deserialize)]
struct JwtSecretConfig {
    key: String,
}

#[derive(Debug)]
struct Unauthorized;
impl reject::Reject for Unauthorized {}

// Mirrors mcp-server's src/auth.ts: HASURA_GRAPHQL_JWT_SECRET's "key" field is
// used as a raw HMAC-SHA256 secret (not parsed as a PEM/certificate, despite
// its "type" field saying RS512 - that field describes what Hasura itself
// expects from Auth0 tokens, not the scheme used for these internal tokens).
fn validate_jwt(token: &str) -> Result<(), String> {
    let secret = std::env::var("HASURA_GRAPHQL_JWT_SECRET")
        .map_err(|_| "HASURA_GRAPHQL_JWT_SECRET is not set".to_string())?;
    let cfg: JwtSecretConfig = serde_json::from_str(&secret)
        .map_err(|e| format!("invalid HASURA_GRAPHQL_JWT_SECRET: {e}"))?;
    let audience =
        std::env::var("AUTH0_AUDIENCE").unwrap_or_else(|_| DEFAULT_AUDIENCE.to_string());

    let decoding_key = DecodingKey::from_secret(cfg.key.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[audience]);

    decode::<serde_json::Value>(token, &decoding_key, &validation)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn require_auth() -> impl Filter<Extract = (), Error = Rejection> + Clone {
    warp::header::optional::<String>("authorization")
        .and_then(|auth: Option<String>| async move {
            let token = auth
                .as_deref()
                .and_then(|h| h.strip_prefix("Bearer "))
                .ok_or(())
                .map_err(|_| reject::custom(Unauthorized))?;
            validate_jwt(token).map_err(|e| {
                log::warn!("JWT validation failed: {e}");
                reject::custom(Unauthorized)
            })?;
            Ok::<(), Rejection>(())
        })
        .untuple_one()
}

pub async fn handle_rejection(err: Rejection) -> Result<impl warp::Reply, Infallible> {
    if err.find::<Unauthorized>().is_some() {
        let reply = warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "unauthorized"})),
            StatusCode::UNAUTHORIZED,
        );
        Ok(warp::reply::with_header(reply, "WWW-Authenticate", "Bearer"))
    } else {
        let reply = warp::reply::with_status(
            warp::reply::json(&serde_json::json!({"error": "not found"})),
            StatusCode::NOT_FOUND,
        );
        Ok(warp::reply::with_header(reply, "WWW-Authenticate", ""))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde_json::json;
    use std::sync::Mutex;

    const SECRET: &str = "test-secret-key";
    const AUDIENCE: &str = "https://direct-satyr-14.hasura.app/v1/graphql";

    // std::env is process-global; serialize tests that touch it.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn set_env(secret_type: &str, secret_key: &str, audience: Option<&str>) {
        unsafe {
            std::env::set_var(
                "HASURA_GRAPHQL_JWT_SECRET",
                json!({"type": secret_type, "key": secret_key}).to_string(),
            );
            match audience {
                Some(a) => std::env::set_var("AUTH0_AUDIENCE", a),
                None => std::env::remove_var("AUTH0_AUDIENCE"),
            }
        }
    }

    fn clear_env() {
        unsafe {
            std::env::remove_var("HASURA_GRAPHQL_JWT_SECRET");
            std::env::remove_var("AUTH0_AUDIENCE");
        }
    }

    fn make_token(secret: &str, audience: &str, exp_offset_secs: i64) -> String {
        let now = jsonwebtoken::get_current_timestamp() as i64;
        let claims = json!({
            "sub": "user-123",
            "aud": audience,
            "exp": now + exp_offset_secs,
        });
        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn accepts_a_valid_token() {
        let _g = ENV_LOCK.lock().unwrap();
        set_env("RS512", SECRET, Some(AUDIENCE));
        let token = make_token(SECRET, AUDIENCE, 3600);
        assert!(validate_jwt(&token).is_ok());
        clear_env();
    }

    #[test]
    fn rejects_when_secret_env_var_missing() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        let token = make_token(SECRET, AUDIENCE, 3600);
        let err = validate_jwt(&token).unwrap_err();
        assert!(err.contains("HASURA_GRAPHQL_JWT_SECRET is not set"));
    }

    #[test]
    fn rejects_wrong_signing_key() {
        let _g = ENV_LOCK.lock().unwrap();
        set_env("RS512", SECRET, Some(AUDIENCE));
        let token = make_token("wrong-secret", AUDIENCE, 3600);
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn rejects_wrong_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        set_env("RS512", SECRET, Some(AUDIENCE));
        let token = make_token(SECRET, "https://wrong.example.com", 3600);
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn rejects_expired_token() {
        let _g = ENV_LOCK.lock().unwrap();
        set_env("RS512", SECRET, Some(AUDIENCE));
        let token = make_token(SECRET, AUDIENCE, -3600);
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn falls_back_to_default_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        set_env("RS512", SECRET, None);
        let token = make_token(SECRET, DEFAULT_AUDIENCE, 3600);
        assert!(validate_jwt(&token).is_ok());
        clear_env();
    }
}
