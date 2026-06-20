import Testing
import Foundation
@testable import FoodDiary

struct OIDCClientTests {
    private func makeClient() -> OIDCClient {
        OIDCClient(
            domain: "example.us.auth0.com",
            clientID: "abc123",
            scheme: "com.bspaulding.fooddiary",
            bundleID: "com.bspaulding.fooddiary"
        )
    }

    @Test func authorizeURLContainsAllRequiredParams() {
        let client = makeClient()
        let url = client.authorizeURL(codeChallenge: "challenge-value", state: "state-value")
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let items = Dictionary(uniqueKeysWithValues: components.queryItems!.map { ($0.name, $0.value) })

        #expect(items["response_type"] == "code")
        #expect(items["client_id"] == "abc123")
        #expect(items["redirect_uri"] == client.redirectURI)
        #expect(items["scope"] == "openid profile email offline_access")
        #expect(items["audience"] == "https://direct-satyr-14.hasura.app/v1/graphql")
        #expect(items["code_challenge"] == "challenge-value")
        #expect(items["code_challenge_method"] == "S256")
        #expect(items["state"] == "state-value")
    }

    @Test func redirectURIUsesSchemeDomainAndBundleID() {
        let client = makeClient()
        #expect(
            client.redirectURI
                == "com.bspaulding.fooddiary://example.us.auth0.com/ios/com.bspaulding.fooddiary/callback"
        )
    }
}
