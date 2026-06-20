import Testing
@testable import FoodDiary

struct PKCETests {
    /// RFC 7636 Appendix B known vector.
    @Test func codeChallengeMatchesRFC7636Vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let challenge = PKCE.codeChallenge(for: verifier)
        #expect(challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test func codeVerifierIsURLSafe() {
        let verifier = PKCE.generateCodeVerifier()
        #expect(!verifier.contains("+"))
        #expect(!verifier.contains("/"))
        #expect(!verifier.contains("="))
        #expect(!verifier.isEmpty)
    }

    @Test func stateIsRandomPerCall() {
        let a = PKCE.generateState()
        let b = PKCE.generateState()
        #expect(a != b)
    }
}
