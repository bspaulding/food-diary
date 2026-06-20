import Testing
import Foundation
@testable import FoodDiary

struct JWTTests {
    private func makeToken(exp: TimeInterval) -> String {
        let header = ["alg": "HS256", "typ": "JWT"]
        let payload: [String: Any] = ["exp": exp, "sub": "user|123"]
        let headerData = try! JSONSerialization.data(withJSONObject: header)
        let payloadData = try! JSONSerialization.data(withJSONObject: payload)
        let headerB64 = PKCE.base64URLEncode(headerData)
        let payloadB64 = PKCE.base64URLEncode(payloadData)
        return "\(headerB64).\(payloadB64).signature"
    }

    @Test func decodesExpClaim() {
        let exp: TimeInterval = 1_700_000_000
        let token = makeToken(exp: exp)
        let decoded = JWT.expiry(of: token)
        #expect(decoded == Date(timeIntervalSince1970: exp))
    }

    @Test func malformedTokenReturnsNil() {
        #expect(JWT.expiry(of: "not-a-jwt") == nil)
        #expect(JWT.expiry(of: "only.two") == nil)
    }
}
