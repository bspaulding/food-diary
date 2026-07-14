use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use openssl::hash::MessageDigest;
use openssl::sign::Verifier;
use openssl::x509::X509;
use serde::Deserialize;
use serde_json::Value;
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

fn b64url_decode(s: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD.decode(s).map_err(|e| e.to_string())
}

fn aud_matches(payload: &Value, expected: &str) -> bool {
    match payload.get("aud") {
        Some(Value::String(s)) => s == expected,
        Some(Value::Array(items)) => items.iter().any(|v| v.as_str() == Some(expected)),
        _ => false,
    }
}

// The frontend sends Auth0's actual ID token (the same one forwarded to
// Hasura's graphql-engine) rather than an internally-minted token: RS256,
// signed by Auth0, verified here against the public key embedded in
// HASURA_GRAPHQL_JWT_SECRET's "key" field (an X.509 certificate, not a bare
// PEM public key - Auth0's standard JWKS x5c format). "aud" is an array
// (Hasura audience + Auth0 userinfo audience); it's a match if it contains
// AUTH0_AUDIENCE. This is a different token/scheme than mcp-server's
// internally-minted HS256 session token - don't unify the two.
fn validate_jwt(token: &str) -> Result<(), String> {
    let secret = std::env::var("HASURA_GRAPHQL_JWT_SECRET")
        .map_err(|_| "HASURA_GRAPHQL_JWT_SECRET is not set".to_string())?;
    let cfg: JwtSecretConfig = serde_json::from_str(&secret)
        .map_err(|e| format!("invalid HASURA_GRAPHQL_JWT_SECRET: {e}"))?;
    let audience =
        std::env::var("AUTH0_AUDIENCE").unwrap_or_else(|_| DEFAULT_AUDIENCE.to_string());

    let cert =
        X509::from_pem(cfg.key.as_bytes()).map_err(|e| format!("invalid certificate: {e}"))?;
    let public_key = cert
        .public_key()
        .map_err(|e| format!("invalid public key: {e}"))?;

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("malformed token".to_string());
    }

    let header: Value = serde_json::from_slice(&b64url_decode(parts[0])?)
        .map_err(|e| format!("invalid header: {e}"))?;
    if header.get("alg").and_then(Value::as_str) != Some("RS256") {
        return Err("unexpected algorithm".to_string());
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let signature = b64url_decode(parts[2])?;

    let mut verifier = Verifier::new(MessageDigest::sha256(), &public_key)
        .map_err(|e| format!("verifier init failed: {e}"))?;
    verifier
        .update(signing_input.as_bytes())
        .map_err(|e| e.to_string())?;
    if !verifier.verify(&signature).unwrap_or(false) {
        return Err("signature verification failed".to_string());
    }

    let payload: Value = serde_json::from_slice(&b64url_decode(parts[1])?)
        .map_err(|e| format!("invalid payload: {e}"))?;

    if let Some(exp) = payload.get("exp").and_then(Value::as_i64) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        if exp < now {
            return Err("token expired".to_string());
        }
    }

    if !aud_matches(&payload, &audience) {
        return Err("audience mismatch".to_string());
    }

    Ok(())
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
    use openssl::asn1::Asn1Time;
    use openssl::pkey::PKey;
    use openssl::rsa::Rsa;
    use openssl::sign::Signer;
    use openssl::x509::X509Builder;
    use serde_json::json;
    use std::sync::Mutex;

    const AUDIENCE: &str = "https://direct-satyr-14.hasura.app/v1/graphql";

    // std::env is process-global; serialize tests that touch it.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    struct TestKey {
        private_pem: Vec<u8>,
        cert_pem: Vec<u8>,
    }

    fn make_test_key() -> TestKey {
        let rsa = Rsa::generate(2048).unwrap();
        let pkey = PKey::from_rsa(rsa).unwrap();

        let mut builder = X509Builder::new().unwrap();
        builder.set_pubkey(&pkey).unwrap();
        builder
            .set_not_before(&Asn1Time::days_from_now(0).unwrap())
            .unwrap();
        builder
            .set_not_after(&Asn1Time::days_from_now(365).unwrap())
            .unwrap();
        let mut serial = openssl::bn::BigNum::new().unwrap();
        serial.pseudo_rand(64, openssl::bn::MsbOption::MAYBE_ZERO, false).unwrap();
        builder
            .set_serial_number(&serial.to_asn1_integer().unwrap())
            .unwrap();
        builder.sign(&pkey, MessageDigest::sha256()).unwrap();
        let cert = builder.build();

        TestKey {
            private_pem: pkey.private_key_to_pem_pkcs8().unwrap(),
            cert_pem: cert.to_pem().unwrap(),
        }
    }

    fn set_env(cert_pem: &[u8], audience: Option<&str>) {
        unsafe {
            std::env::set_var(
                "HASURA_GRAPHQL_JWT_SECRET",
                json!({"type": "RS512", "key": String::from_utf8_lossy(cert_pem)}).to_string(),
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

    fn make_token(private_pem: &[u8], aud: Value, exp_offset_secs: i64, alg: &str) -> String {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let header = json!({"alg": alg, "typ": "JWT"});
        let payload = json!({"sub": "auth0|user-123", "aud": aud, "exp": now + exp_offset_secs});
        let header_b64 = URL_SAFE_NO_PAD.encode(header.to_string());
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signing_input = format!("{header_b64}.{payload_b64}");

        let pkey = PKey::private_key_from_pem(private_pem).unwrap();
        let mut signer = Signer::new(MessageDigest::sha256(), &pkey).unwrap();
        signer.update(signing_input.as_bytes()).unwrap();
        let signature = signer.sign_to_vec().unwrap();
        let sig_b64 = URL_SAFE_NO_PAD.encode(signature);

        format!("{signing_input}.{sig_b64}")
    }

    #[test]
    fn accepts_a_valid_token_with_array_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(
            &key.private_pem,
            json!([AUDIENCE, "https://motingo.auth0.com/userinfo"]),
            3600,
            "RS256",
        );
        assert!(validate_jwt(&token).is_ok());
        clear_env();
    }

    #[test]
    fn accepts_a_valid_token_with_string_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(&key.private_pem, json!(AUDIENCE), 3600, "RS256");
        assert!(validate_jwt(&token).is_ok());
        clear_env();
    }

    #[test]
    fn rejects_when_secret_env_var_missing() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        let key = make_test_key();
        let token = make_token(&key.private_pem, json!(AUDIENCE), 3600, "RS256");
        let err = validate_jwt(&token).unwrap_err();
        assert!(err.contains("HASURA_GRAPHQL_JWT_SECRET is not set"));
    }

    #[test]
    fn rejects_wrong_algorithm() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(&key.private_pem, json!(AUDIENCE), 3600, "HS256");
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn rejects_wrong_signing_key() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        let other_key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(&other_key.private_pem, json!(AUDIENCE), 3600, "RS256");
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn rejects_wrong_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(
            &key.private_pem,
            json!(["https://wrong.example.com"]),
            3600,
            "RS256",
        );
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn rejects_expired_token() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, Some(AUDIENCE));
        let token = make_token(&key.private_pem, json!(AUDIENCE), -3600, "RS256");
        assert!(validate_jwt(&token).is_err());
        clear_env();
    }

    #[test]
    fn falls_back_to_default_audience() {
        let _g = ENV_LOCK.lock().unwrap();
        let key = make_test_key();
        set_env(&key.cert_pem, None);
        let token = make_token(&key.private_pem, json!(DEFAULT_AUDIENCE), 3600, "RS256");
        assert!(validate_jwt(&token).is_ok());
        clear_env();
    }
}
