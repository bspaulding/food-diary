import Testing
import Foundation
@testable import FoodDiary

struct JWTTests {
    private func makeToken(payload: [String: Any]) -> String {
        let header = ["alg": "HS256", "typ": "JWT"]
        let headerData = try! JSONSerialization.data(withJSONObject: header)
        let payloadData = try! JSONSerialization.data(withJSONObject: payload)
        let headerB64 = PKCE.base64URLEncode(headerData)
        let payloadB64 = PKCE.base64URLEncode(payloadData)
        return "\(headerB64).\(payloadB64).signature"
    }

    private func makeToken(exp: TimeInterval) -> String {
        makeToken(payload: ["exp": exp, "sub": "user|123"])
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

    @Test func decodesProfileClaims() {
        let token = makeToken(payload: [
            "exp": 1_700_000_000,
            "name": "Brad Spaulding",
            "email": "brad@example.com",
            "picture": "https://example.com/avatar.png",
        ])
        let claims = JWT.profileClaims(of: token)
        #expect(claims?.name == "Brad Spaulding")
        #expect(claims?.email == "brad@example.com")
        #expect(claims?.picture == URL(string: "https://example.com/avatar.png"))
    }

    @Test func profileClaimsToleratesMissingFields() {
        let token = makeToken(payload: ["exp": 1_700_000_000, "sub": "user|123"])
        let claims = JWT.profileClaims(of: token)
        #expect(claims?.name == nil)
        #expect(claims?.email == nil)
        #expect(claims?.picture == nil)
    }

    @Test func profileClaimsNilForMalformedToken() {
        #expect(JWT.profileClaims(of: "not-a-jwt") == nil)
    }
}
