import Foundation

/// Abstracts token retrieval for `SidecarClient` so it doesn't depend on the
/// concrete `@MainActor` `AuthService` (mirrors `TokenProviding` in
/// `GraphQLClient.swift`, kept separate since the sidecars are unrelated to
/// GraphQL and a future change to one shouldn't ripple into the other).
protocol SidecarTokenProviding {
    func currentToken() async throws -> String
}

extension AuthService: SidecarTokenProviding {}

/// Error surfaced by `SidecarClient`: a human-readable message mirroring the
/// web's `Error(message)` thrown by `lookupNutritionWithLLM` /
/// `CameraModal.uploadImage` (`web/src/Api.ts:894-953`,
/// `web/src/CameraModal.tsx:232-312`).
struct SidecarError: Error, Equatable {
    let message: String
}

/// Abstracts the two autofill calls so `ItemFormViewModel` can be unit-tested
/// with a fake instead of real networking. `SidecarClient` conforms below.
protocol NutritionAutofillClient {
    func lookupNutrition(description: String) async throws -> NutritionItemInput
    func uploadLabel(imageData: Data) async throws -> NutritionItemInput
}

/// REST (non-GraphQL) client for the two capture-autofill sidecars (PRD §11,
/// `ios/plans/phase-3-native-capture.md` §1): `/llm/lookup` (text -> macros)
/// and `/labeller/upload` (label photo -> macros). Both live behind the same
/// ingress as the GraphQL endpoint, so they share `baseURL`. Unlike the web
/// (which calls `/llm/lookup` same-origin, without an auth header), the
/// native client sends `Authorization: Bearer <token>` on both calls per the
/// plan's explicit instruction.
struct SidecarClient: NutritionAutofillClient {
    let baseURL: URL
    let tokenProvider: SidecarTokenProviding
    let session: URLSession

    init(baseURL: URL, tokenProvider: SidecarTokenProviding, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    /// `POST /llm/lookup` `{ "description": String }` -> `{ "item": {...} }`.
    /// Field-by-field coercion ported from `lookupNutritionWithLLM`
    /// (`web/src/Api.ts:894-953`): every macro defaults to 0 if missing or
    /// non-numeric; `description` defaults to `""`.
    func lookupNutrition(description: String) async throws -> NutritionItemInput {
        let token = try await tokenProvider.currentToken()

        var request = URLRequest(url: baseURL.appendingPathComponent("llm/lookup"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["description": description])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SidecarError(message: "No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw SidecarError(message: errorMessage(from: data, statusCode: http.statusCode))
        }

        let envelope = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? nil
        let item = (envelope?["item"] as? [String: Any]) ?? [:]
        return NutritionJSONMapping.parse(item)
    }

    /// `POST /labeller/upload` multipart `{ image: <jpeg> }` ->
    /// `{ "image": {...abbreviated macro keys...} }`. Field names are
    /// deliberately different/abbreviated from the LLM response — ported
    /// verbatim from `CameraModal.uploadImage`'s `getNumericValue` calls
    /// (`web/src/CameraModal.tsx:285-301`). Retries up to 3 times on any
    /// throw (network error or non-2xx), mirroring the web's `retry` helper
    /// (`web/src/CameraModal.tsx:244-267`).
    func uploadLabel(imageData: Data) async throws -> NutritionItemInput {
        let token = try await tokenProvider.currentToken()

        var lastError: Error = SidecarError(message: "Too many retries.")
        for _ in 0..<3 {
            do {
                return try await performUpload(imageData: imageData, token: token)
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    private func performUpload(imageData: Data, token: String) async throws -> NutritionItemInput {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: baseURL.appendingPathComponent("labeller/upload"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(boundary: boundary, imageData: imageData)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SidecarError(message: "No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let statusText = HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw SidecarError(message: "Upload failed: \(statusText) (\(http.statusCode))")
        }

        let envelope = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? nil
        let image = (envelope?["image"] as? [String: Any]) ?? [:]
        return NutritionItemInput(
            description: JSONFieldCoercion.string(image, "description"),
            calories: JSONFieldCoercion.number(image, "calories"),
            totalFatGrams: JSONFieldCoercion.number(image, "total_fat_grams"),
            saturatedFatGrams: 0,
            transFatGrams: 0,
            polyunsaturatedFatGrams: 0,
            monounsaturatedFatGrams: 0,
            cholesterolMilligrams: JSONFieldCoercion.number(image, "cholesterol_mg"),
            sodiumMilligrams: JSONFieldCoercion.number(image, "sodium_mg"),
            totalCarbohydrateGrams: JSONFieldCoercion.number(image, "total_carbohydrates_g"),
            dietaryFiberGrams: JSONFieldCoercion.number(image, "dietary_fiber_g"),
            totalSugarsGrams: JSONFieldCoercion.number(image, "total_sugars_g"),
            addedSugarsGrams: JSONFieldCoercion.number(image, "added_sugars_g"),
            proteinGrams: JSONFieldCoercion.number(image, "protein_g"))
    }

    private func multipartBody(boundary: String, imageData: Data) -> Data {
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"image\"; filename=\"capture.jpg\"\r\n".utf8))
        body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(imageData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    /// `body.error ?? statusText`-equivalent (`web/src/Api.ts:901-909`).
    private func errorMessage(from data: Data, statusCode: Int) -> String {
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = json["error"] as? String, !error.isEmpty {
            return error
        }
        return "HTTP \(statusCode) \(HTTPURLResponse.localizedString(forStatusCode: statusCode))"
    }
}
