import Foundation

/// The subset of standard OIDC claims the Profile screen displays (PRD §4.7).
/// Decoded directly from the id_token — no `userinfo` round-trip needed for v1.
struct JWTProfileClaims: Equatable, Sendable {
    var name: String?
    var email: String?
    var picture: URL?
}

/// Decodes claims from a JWT payload without verifying the signature — Hasura
/// is the verifier (PRD §6.5); the app only needs `exp` for refresh timing and
/// a handful of profile claims for display.
enum JWT {
    static func expiry(of token: String) -> Date? {
        guard let json = payload(of: token) else { return nil }
        guard let exp = json["exp"] as? TimeInterval else { return nil }
        return Date(timeIntervalSince1970: exp)
    }

    static func profileClaims(of token: String) -> JWTProfileClaims? {
        guard let json = payload(of: token) else { return nil }
        let picture = (json["picture"] as? String).flatMap(URL.init(string:))
        return JWTProfileClaims(
            name: json["name"] as? String,
            email: json["email"] as? String,
            picture: picture
        )
    }

    private static func payload(of token: String) -> [String: Any]? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        guard let payloadData = base64URLDecode(String(parts[1])) else { return nil }
        return try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any]
    }

    static func base64URLDecode(_ value: String) -> Data? {
        var base64 = value
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder > 0 {
            base64.append(String(repeating: "=", count: 4 - remainder))
        }
        return Data(base64Encoded: base64)
    }
}
