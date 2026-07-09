import Foundation
import LiteRTLM

/// Abstracts `OnDeviceLLMEngine` so `OnDeviceAutofillClient`'s prompt/parse/
/// retry logic is unit-testable with a fake, without needing the real
/// LiteRT-LM runtime (plan §9).
protocol OnDeviceLLMInferring: Sendable {
    func lookupText(systemPrompt: String, prompt: String) async throws -> String
    func lookupImage(imageData: Data, systemPrompt: String, prompt: String) async throws -> String
}

/// Thin wrapper around LiteRT-LM's `Engine`/`Conversation` API
/// (`ios/plans/phase-6-on-device-llm.md` §5). An `actor` so only one prompt
/// runs at a time — the underlying engine isn't meant to be hit concurrently.
///
/// NOTE: LiteRT-LM's Swift API is very young (it superseded MediaPipe's
/// deprecated iOS LLM Inference API in early 2026); the exact shape of
/// `EngineConfig`/`Message`/`Content`/response types below is based on
/// Google's published docs as of this writing and has not been compiled
/// against the real package (no macOS/Xcode available in this environment).
/// Re-verify each call against the installed `LiteRTLM` module the first
/// time this builds on a Mac.
actor OnDeviceLLMEngine: OnDeviceLLMInferring {
    enum EngineError: Error, Equatable {
        case modelNotReady
        case inferenceFailed(String)
    }

    /// GPU is the production default; `.cpu` exists so eval tests
    /// (`OnDeviceLLMEvalTests.swift`) can run against real inference on
    /// hosts/simulators without relying on Metal-accelerated LLM inference.
    enum ComputeBackend {
        case gpu
        case cpu
    }

    private var engine: Engine?
    private let modelPath: URL
    private let computeBackend: ComputeBackend

    init(modelPath: URL, computeBackend: ComputeBackend = .gpu) {
        self.modelPath = modelPath
        self.computeBackend = computeBackend
    }

    /// Releases the loaded model (memory pressure / backgrounding, plan §6).
    /// The next call transparently reloads it.
    func unload() {
        engine = nil
    }

    func lookupText(systemPrompt: String, prompt: String) async throws -> String {
        let engine = try await ensureLoaded()
        let conversation = try await engine.createConversation(
            with: ConversationConfig(systemMessage: Message(systemPrompt)))
        return try await send(Message(prompt), on: conversation)
    }

    func lookupImage(imageData: Data, systemPrompt: String, prompt: String) async throws -> String {
        let engine = try await ensureLoaded()
        let conversation = try await engine.createConversation(
            with: ConversationConfig(systemMessage: Message(systemPrompt)))

        let imageURL = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
        try imageData.write(to: imageURL)
        defer { try? FileManager.default.removeItem(at: imageURL) }

        let message = Message(contents: [Content.imageFile(imageURL.path), Content.text(prompt)])
        return try await send(message, on: conversation)
    }

    private func send(_ message: Message, on conversation: Conversation) async throws -> String {
        do {
            let response = try await conversation.sendMessage(message)
            return response.text
        } catch {
            throw EngineError.inferenceFailed(String(describing: error))
        }
    }

    private func ensureLoaded() async throws -> Engine {
        if let engine { return engine }
        let config = try EngineConfig(
            modelPath: modelPath.path,
            backend: computeBackend == .gpu ? .gpu : .cpu(),
            visionBackend: .cpu(),
            maxNumTokens: 512,
            cacheDir: NSTemporaryDirectory())
        let newEngine = Engine(engineConfig: config)
        try await newEngine.initialize()
        engine = newEngine
        return newEngine
    }
}
