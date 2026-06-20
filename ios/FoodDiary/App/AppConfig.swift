import Foundation
import Observation

/// Typed access to the values surfaced from `Config/*.xcconfig` via `Info.plist`.
/// Audience and redirect URI are NOT read from here — they contain "://" which
/// xcconfig treats as a comment, so they're assembled as Swift constants instead
/// (see `OIDCClient`).
struct AppConfig {
    let auth0Domain: String
    let auth0ClientID: String
    let auth0Scheme: String
    let bundleID: String

    static let shared = AppConfig(bundle: .main)

    init(bundle: Bundle) {
        func value(_ key: String) -> String {
            bundle.object(forInfoDictionaryKey: key) as? String ?? ""
        }
        auth0Domain = value("AUTH0_DOMAIN")
        auth0ClientID = value("AUTH0_CLIENT_ID")
        auth0Scheme = value("AUTH0_SCHEME")
        bundleID = bundle.bundleIdentifier ?? "com.motingo.food-diary"
    }
}

enum BackendEnvironment {
    case production
    case custom(URL)

    var graphQLBaseURL: URL {
        switch self {
        case .production:
            return URL(string: "https://food-diary.motingo.com")!
        case .custom(let url):
            return url
        }
    }
}

/// Resolves the backend base URL from build configuration (PRD §10, decision #16).
/// Release always targets production. Debug defaults to production too, with an
/// in-app Developer override (Phase 1 Profile screen) able to replace it at runtime.
@Observable
final class AppEnvironmentConfig {
    var backend: BackendEnvironment

    init() {
        #if DEBUG
        backend = .production
        #else
        backend = .production
        #endif
    }
}
