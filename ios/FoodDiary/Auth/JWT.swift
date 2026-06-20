import Foundation

/// Decodes the `exp` claim from a JWT payload without verifying the signature —
/// Hasura is the verifier (PRD §6.5); the app only needs `exp` for refresh timing.
enum JWT {
    static func expiry(of token: String) -> Date? {
        let parts = token.split(separator: ".")
        guard parts.count >= 2 else { return nil }
        guard let payloadData = base64URLDecode(String(parts[1])) else { return nil }
        guard
            let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any]
        else { return nil }
        guard let exp = json["exp"] as? TimeInterval else { return nil }
        return Date(timeIntervalSince1970: exp)
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
