import Foundation

/// Abstracts token retrieval + sign-out so `GraphQLClient` doesn't depend on the
/// concrete `@MainActor` `AuthService` (keeps the client a plain `Sendable`
/// value type, testable with a fake).
protocol TokenProviding {
    func currentToken() async throws -> String
    func signOut() async
}

struct GraphQLRequestBody: Encodable {
    var query: String
    var variables: [String: AnyEncodable]?
}

/// Type-erased `Encodable` for GraphQL variables, which are heterogeneous.
struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init<T: Encodable>(_ wrapped: T) {
        encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

private struct GraphQLEnvelope<T: Decodable>: Decodable {
    var data: T?
    var errors: [GraphQLError]?
}

/// Performs the POST, injects the bearer token, decodes the GraphQL envelope,
/// and maps errors per PRD §6.1, §8: 401/403 -> sign out + `.unauthorized`;
/// non-empty `errors` -> `.graphQL`; other non-2xx -> `.transport`.
struct GraphQLClient {
    let baseURL: URL
    let tokenProvider: TokenProviding
    let session: URLSession

    init(baseURL: URL, tokenProvider: TokenProviding, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    func execute<T: Decodable>(
        query: String, variables: [String: AnyEncodable]? = nil, as type: T.Type
    ) async throws -> T {
        let token = try await tokenProvider.currentToken()

        var request = URLRequest(url: baseURL.appendingPathComponent("api/v1/graphql"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONCoding.encoder.encode(
            GraphQLRequestBody(query: query, variables: variables))

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport("No HTTP response")
        }

        let envelope = try? JSONCoding.decoder.decode(GraphQLEnvelope<T>.self, from: data)

        if let mapped = APIError.from(httpStatus: http.statusCode, graphQLErrors: envelope?.errors ?? []) {
            if case .unauthorized = mapped {
                await tokenProvider.signOut()
            }
            throw mapped
        }

        guard let data = envelope?.data else {
            throw APIError.decoding("Missing data in GraphQL response")
        }
        return data
    }
}

extension AuthService: TokenProviding {
    func signOut() async {
        await logout()
    }
}
