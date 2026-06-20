import Foundation

struct AuthenticatedUser: Equatable, Sendable {
    var name: String?
    var email: String?
    var picture: URL?
}

enum AuthState: Equatable {
    case signedOut
    case signingIn
    case signedIn(AuthenticatedUser)
}
