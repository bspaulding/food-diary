import Testing
import Foundation
@testable import FoodDiary

private final class FakeModelDownloading: ModelDownloading, @unchecked Sendable {
    enum Behavior {
        case succeed(contents: Data)
        case fail(message: String, resumeData: Data?)
    }

    var behavior: Behavior = .succeed(contents: Data("model-bytes".utf8))
    private(set) var lastResumeData: Data?
    private(set) var callCount = 0

    func download(
        from url: URL, resumeData: Data?,
        onProgress: @escaping @Sendable (Int64, Int64) -> Void
    ) async throws -> URL {
        callCount += 1
        lastResumeData = resumeData
        onProgress(50, 100)
        switch behavior {
        case .succeed(let contents):
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try contents.write(to: tempURL)
            onProgress(100, 100)
            return tempURL
        case .fail(let message, let resumeData):
            throw ResumableDownloadError(message: message, resumeData: resumeData)
        }
    }
}

private func makeTempDirectory() -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    return dir
}

@MainActor
struct OnDeviceModelManagerTests {
    @Test func startsNotDownloadedWhenNoFileExists() {
        let manager = OnDeviceModelManager(downloader: FakeModelDownloading(), destinationDirectory: makeTempDirectory())
        #expect(manager.state == .notDownloaded)
    }

    @Test func detectsExistingFileAsReadyOnInit() throws {
        let dir = makeTempDirectory()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let modelPath = dir.appendingPathComponent("model.litertlm")
        try Data("already-here".utf8).write(to: modelPath)

        let manager = OnDeviceModelManager(downloader: FakeModelDownloading(), destinationDirectory: dir)

        #expect(manager.state == .ready(path: modelPath))
    }

    @Test func downloadSucceedsMovesFileAndSetsReady() async throws {
        let dir = makeTempDirectory()
        let fake = FakeModelDownloading()
        let manager = OnDeviceModelManager(downloader: fake, destinationDirectory: dir)

        await manager.download()

        #expect(manager.state == .ready(path: manager.modelDestinationURL))
        #expect(FileManager.default.fileExists(atPath: manager.modelDestinationURL.path))
    }

    @Test func downloadFailureSetsFailedStateAndPersistsResumeData() async throws {
        let dir = makeTempDirectory()
        let fake = FakeModelDownloading()
        fake.behavior = .fail(message: "connection lost", resumeData: Data("resume-me".utf8))
        let manager = OnDeviceModelManager(downloader: fake, destinationDirectory: dir)

        await manager.download()

        #expect(manager.state == .failed("connection lost"))
        #expect(!FileManager.default.fileExists(atPath: manager.modelDestinationURL.path))
    }

    @Test func retryAfterFailurePassesPersistedResumeData() async throws {
        let dir = makeTempDirectory()
        let fake = FakeModelDownloading()
        fake.behavior = .fail(message: "connection lost", resumeData: Data("resume-me".utf8))
        let manager = OnDeviceModelManager(downloader: fake, destinationDirectory: dir)
        await manager.download()

        fake.behavior = .succeed(contents: Data("model-bytes".utf8))
        await manager.download()

        #expect(fake.lastResumeData == Data("resume-me".utf8))
        #expect(manager.state == .ready(path: manager.modelDestinationURL))
    }

    @Test func deleteModelRemovesFileAndResetsState() async throws {
        let dir = makeTempDirectory()
        let fake = FakeModelDownloading()
        let manager = OnDeviceModelManager(downloader: fake, destinationDirectory: dir)
        await manager.download()

        manager.deleteModel()

        #expect(manager.state == .notDownloaded)
        #expect(!FileManager.default.fileExists(atPath: manager.modelDestinationURL.path))
    }

    @Test func downloadIsNoOpWhileAlreadyDownloadingOrReady() async throws {
        let dir = makeTempDirectory()
        let fake = FakeModelDownloading()
        let manager = OnDeviceModelManager(downloader: fake, destinationDirectory: dir)
        await manager.download()
        #expect(fake.callCount == 1)

        await manager.download()

        #expect(fake.callCount == 1)
    }
}
