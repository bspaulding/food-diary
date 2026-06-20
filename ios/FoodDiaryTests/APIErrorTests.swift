import Testing
@testable import FoodDiary

struct APIErrorTests {
    @Test func unauthorizedOn401() {
        #expect(APIError.from(httpStatus: 401, graphQLErrors: []) == .unauthorized)
    }

    @Test func unauthorizedOn403() {
        #expect(APIError.from(httpStatus: 403, graphQLErrors: []) == .unauthorized)
    }

    @Test func graphQLErrorsMapToGraphQLCase() {
        let errors = [GraphQLError(message: "field not found")]
        #expect(APIError.from(httpStatus: 200, graphQLErrors: errors) == .graphQL(errors))
    }

    @Test func otherNon2xxMapsToTransport() {
        #expect(APIError.from(httpStatus: 500, graphQLErrors: []) == .transport("HTTP 500"))
    }

    @Test func successWithNoErrorsMapsToNil() {
        #expect(APIError.from(httpStatus: 200, graphQLErrors: []) == nil)
    }
}
