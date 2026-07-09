import Foundation
import Observation

/// Download/lifecycle state for the on-device model file
/// (`ios/plans/phase-6-on-device-llm.md` §3).
enum ModelDownloadState: Equatable {
    case notDownloaded
    case downloading(progress: Double)
    case ready(path: URL)
    case failed(String)
}

/// Abstracts the actual network transfer so `OnDeviceModelManager`'s state
/// machine is unit-testable without a real 2.6 GB download (plan §9).
protocol ModelDownloading: Sendable {
    /// Downloads `url` to a temporary location, resuming from `resumeData` if
    /// given. `onProgress` is called with (bytesWritten, totalBytesExpected).
    /// On failure, throws `ResumableDownloadError` carrying resume data (if
    /// the underlying transport produced any) so the caller can retry later.
    func download(
        from url: URL,
        resumeData: Data?,
        onProgress: @escaping @Sendable (Int64, Int64) -> Void
    ) async throws -> URL
}

struct ResumableDownloadError: Error {
    let message: String
    let resumeData: Data?
}

/// Owns the on-device model file: download with progress, resume after
/// interruption, and deletion to reclaim storage. Not gated/authenticated —
/// `model.litertlm` is served directly from Hugging Face under Apache-2.0
/// (plan §0/§3).
@MainActor @Observable
final class OnDeviceModelManager {
    static let modelURL = URL(
        string: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/model.litertlm")!

    private(set) var state: ModelDownloadState
    private let downloader: ModelDownloading
    private let destinationDirectory: URL
    private let resumeDataURL: URL
    private var resumeData: Data?

    var modelDestinationURL: URL {
        destinationDirectory.appendingPathComponent("model.litertlm")
    }

    init(
        downloader: ModelDownloading = URLSessionModelDownloader(),
        destinationDirectory: URL = OnDeviceModelManager.defaultDestinationDirectory()
    ) {
        self.downloader = downloader
        self.destinationDirectory = destinationDirectory
        self.resumeDataURL = destinationDirectory.appendingPathComponent("model.download-resume")
        try? FileManager.default.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)

        let modelPath = destinationDirectory.appendingPathComponent("model.litertlm")
        if FileManager.default.fileExists(atPath: modelPath.path) {
            self.state = .ready(path: modelPath)
        } else {
            self.state = .notDownloaded
            self.resumeData = try? Data(contentsOf: resumeDataURL)
        }
    }

    static func defaultDestinationDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("OnDeviceLLM", isDirectory: true)
    }

    func download() async {
        switch state {
        case .downloading, .ready: return
        case .notDownloaded, .failed: break
        }
        state = .downloading(progress: 0)
        do {
            let tempURL = try await downloader.download(from: Self.modelURL, resumeData: resumeData) { [weak self] written, expected in
                guard expected > 0 else { return }
                Task { @MainActor in
                    self?.updateProgress(Double(written) / Double(expected))
                }
            }
            try? FileManager.default.removeItem(at: modelDestinationURL)
            try FileManager.default.moveItem(at: tempURL, to: modelDestinationURL)
            try excludeFromBackup(modelDestinationURL)
            resumeData = nil
            try? FileManager.default.removeItem(at: resumeDataURL)
            state = .ready(path: modelDestinationURL)
        } catch let error as ResumableDownloadError {
            resumeData = error.resumeData
            if let resumeData {
                try? resumeData.write(to: resumeDataURL)
            }
            state = .failed(error.message)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func deleteModel() {
        try? FileManager.default.removeItem(at: modelDestinationURL)
        try? FileManager.default.removeItem(at: resumeDataURL)
        resumeData = nil
        state = .notDownloaded
    }

    private func updateProgress(_ progress: Double) {
        guard case .downloading = state else { return }
        state = .downloading(progress: progress)
    }

    private func excludeFromBackup(_ fileURL: URL) throws {
        var fileURL = fileURL
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try fileURL.setResourceValues(resourceValues)
    }
}

/// Real `ModelDownloading` using `URLSessionDownloadTask` so the OS handles
/// efficient large-file writes and resume-data on interruption (plan §3).
struct URLSessionModelDownloader: ModelDownloading {
    func download(
        from url: URL,
        resumeData: Data?,
        onProgress: @escaping @Sendable (Int64, Int64) -> Void
    ) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let coordinator = DownloadCoordinator(onProgress: onProgress, continuation: continuation)
            let session = URLSession(configuration: .default, delegate: coordinator, delegateQueue: nil)
            coordinator.session = session
            let task = resumeData.map(session.downloadTask(withResumeData:)) ?? session.downloadTask(with: url)
            task.resume()
        }
    }
}

/// Bridges `URLSessionDownloadDelegate` callbacks to the async `download`
/// call above; retains the session for the task's lifetime.
private final class DownloadCoordinator: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Int64, Int64) -> Void
    private var continuation: CheckedContinuation<URL, Error>?
    var session: URLSession?

    init(onProgress: @escaping @Sendable (Int64, Int64) -> Void, continuation: CheckedContinuation<URL, Error>) {
        self.onProgress = onProgress
        self.continuation = continuation
    }

    func urlSession(
        _ session: URLSession, downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
    ) {
        onProgress(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        do {
            try FileManager.default.moveItem(at: location, to: destination)
            continuation?.resume(returning: destination)
            continuation = nil
        } catch {
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard let error else { return }
        let nsError = error as NSError
        let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        continuation?.resume(throwing: ResumableDownloadError(message: error.localizedDescription, resumeData: resumeData))
        continuation = nil
        self.session?.finishTasksAndInvalidate()
    }
}
