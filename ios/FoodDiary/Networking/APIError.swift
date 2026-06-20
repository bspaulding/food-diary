import Foundation

struct GraphQLError: Codable, Hashable, Sendable {
    var message: String
}

enum APIError: Error, Equatable {
    case unauthorized
    case graphQL([GraphQLError])
    case transport(String)
    case decoding(String)

    static func == (lhs: APIError, rhs: APIError) -> Bool {
        switch (lhs, rhs) {
        case (.unauthorized, .unauthorized):
            return true
        case (.graphQL(let a), .graphQL(let b)):
            return a == b
        case (.transport(let a), .transport(let b)):
            return a == b
        case (.decoding(let a), .decoding(let b)):
            return a == b
        default:
            return false
        }
    }

    /// Maps an HTTP response (status + decoded GraphQL envelope) to a typed error,
    /// mirroring `web/src/Api.ts`: 401/403 -> unauthorized; non-empty GraphQL
    /// `errors` -> .graphQL; any other non-2xx -> .transport.
    static func from(httpStatus: Int, graphQLErrors: [GraphQLError]) -> APIError? {
        if httpStatus == 401 || httpStatus == 403 {
            return .unauthorized
        }
        if !graphQLErrors.isEmpty {
            return .graphQL(graphQLErrors)
        }
        if !(200..<300).contains(httpStatus) {
            return .transport("HTTP \(httpStatus)")
        }
        return nil
    }
}
