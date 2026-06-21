import AVFoundation
import SwiftUI

/// Drives an `AVCaptureSession` for a still-image label photo (PRD §11,
/// phase-3 plan §2: "start simple: capture a still -> upload"; no on-device
/// Vision OCR pre-pass). Exposes JPEG `Data` via `onCapture`.
@MainActor
final class CameraCaptureController: NSObject, ObservableObject, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var captureContinuation: CheckedContinuation<Data, Error>?

    func configure() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let input = try? AVCaptureDeviceInput(device: device)
        else {
            throw CameraError.deviceUnavailable
        }
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
    }

    func start() {
        guard !session.isRunning else { return }
        session.startRunning()
    }

    func stop() {
        guard session.isRunning else { return }
        session.stopRunning()
    }

    func capturePhoto() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            self.captureContinuation = continuation
            let settings = AVCapturePhotoSettings()
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?
    ) {
        Task { @MainActor in
            if let error {
                captureContinuation?.resume(throwing: error)
            } else if let data = photo.fileDataRepresentation() {
                captureContinuation?.resume(returning: data)
            } else {
                captureContinuation?.resume(throwing: CameraError.captureFailed)
            }
            captureContinuation = nil
        }
    }

    enum CameraError: Error {
        case deviceUnavailable
        case captureFailed
    }
}

/// `UIViewRepresentable` preview layer for the capture session.
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.videoPreviewLayer.session = session
        view.videoPreviewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {}

    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoPreviewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

/// Sheet presented from `ItemFormView`'s "Scan Label" button: live camera
/// preview + capture button. On capture, calls `onCapture` with the JPEG
/// bytes and dismisses; the caller (view model) drives the upload + prefill.
struct CameraCaptureView: View {
    @StateObject private var controller = CameraCaptureController()
    @Environment(\.dismiss) private var dismiss
    @State private var configurationError: String?
    let onCapture: (Data) -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                if let configurationError {
                    Text(configurationError).foregroundStyle(.red).padding()
                } else {
                    CameraPreviewView(session: controller.session)
                        .ignoresSafeArea()
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .bottomBar) {
                    Button {
                        Task {
                            if let data = try? await controller.capturePhoto() {
                                onCapture(data)
                                dismiss()
                            }
                        }
                    } label: {
                        Label("Capture", systemImage: "camera.fill")
                    }
                    .disabled(configurationError != nil)
                }
            }
            .task {
                do {
                    try controller.configure()
                    controller.start()
                } catch {
                    configurationError = "Unable to access camera."
                }
            }
            .onDisappear {
                controller.stop()
            }
        }
    }
}
