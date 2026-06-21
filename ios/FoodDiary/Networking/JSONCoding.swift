import Foundation

/// Single decoding rule for everything that comes from Hasura: snake_case keys,
/// `timestamptz` strings with or without fractional seconds. Used by
/// `GraphQLClient` and by tests feeding fixture JSON directly to the decoder.
enum JSONCoding {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom(decodeISO8601Date)
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .custom(encodeISO8601Date)
        return encoder
    }()

    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// For building GraphQL variable dictionaries directly (repositories pass
    /// dates as `timestamptz` strings, not as a `Date` property on an
    /// `Encodable`, so the dedicated encoder path above isn't used).
    static func isoString(_ date: Date) -> String {
        fractionalFormatter.string(from: date)
    }

    /// Parses a `timestamptz`-shaped string (with or without fractional
    /// seconds) outside of the `Decoder` path, e.g. from a CSV cell.
    static func isoString8601(from string: String) -> Date? {
        fractionalFormatter.date(from: string) ?? formatter.date(from: string)
    }

    private static func decodeISO8601Date(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let string = try container.decode(String.self)
        if let date = fractionalFormatter.date(from: string) {
            return date
        }
        if let date = formatter.date(from: string) {
            return date
        }
        throw DecodingError.dataCorruptedError(
            in: container, debugDescription: "Invalid ISO8601 date: \(string)")
    }

    private static func encodeISO8601Date(_ date: Date, encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(fractionalFormatter.string(from: date))
    }
}
