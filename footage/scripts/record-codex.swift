import Foundation
import AppKit
import CoreGraphics
import ScreenCaptureKit
import AVFoundation

// Records the real VS Code/Codex window; no desktop, microphone or synthetic UI.
final class WindowRecorder: NSObject, SCStreamOutput, @unchecked Sendable {
    let writer: AVAssetWriter
    let input: AVAssetWriterInput
    let queue = DispatchQueue(label: "modmap.codex.recording")
    var started = false
    var frames = 0
    init(url: URL, width: Int, height: Int) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 8_000_000]
        ])
        input.expectsMediaDataInRealTime = true
        super.init()
        guard writer.canAdd(input) else { throw NSError(domain: "ModMap", code: 1) }
        writer.add(input)
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[.status] as? Int,
              status == SCFrameStatus.complete.rawValue else { return }
        if !started {
            guard writer.startWriting() else { return }
            writer.startSession(atSourceTime: sampleBuffer.presentationTimeStamp)
            started = true
        }
        if input.isReadyForMoreMediaData, input.append(sampleBuffer) { frames += 1 }
    }
    func finish() async throws {
        queue.sync { if started { input.markAsFinished() } }
        guard started else { throw NSError(domain: "No screen frames captured", code: 2) }
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? NSError(domain: "Video write failed", code: 3) }
    }
}

@main struct CaptureCodex {
    static func main() async {
        do {
            guard CGPreflightScreenCaptureAccess() else {
                print("SCREEN_RECORDING_PERMISSION_REQUIRED: Enable the host app in System Settings > Privacy & Security > Screen & System Audio Recording, then rerun.")
                exit(2)
            }
            let args = CommandLine.arguments
            let output = URL(fileURLWithPath: args.count > 1 ? args[1] : "codex-real.mov")
            let seconds = args.count > 2 ? (Double(args[2]) ?? 45) : 45
            guard seconds >= 3 && seconds <= 180 else { throw NSError(domain: "Duration must be 3–180 seconds", code: 4) }
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            let window = content.windows.filter {
                let name = $0.owningApplication?.applicationName.lowercased() ?? ""
                return (name == "code" || name.contains("visual studio code") || name == "codex") && $0.frame.width > 600 && $0.frame.height > 400
            }.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
            guard let window else { throw NSError(domain: "Open VS Code or Codex and leave its conversation visible", code: 5) }
            guard !FileManager.default.fileExists(atPath: output.path) else { throw NSError(domain: "Output already exists; choose a new filename", code: 6) }
            let width = Int(window.frame.width * 2) / 2 * 2
            let height = Int(window.frame.height * 2) / 2 * 2
            let recorder = try WindowRecorder(url: output, width: width, height: height)
            let config = SCStreamConfiguration()
            config.width = width; config.height = height
            config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
            config.queueDepth = 5; config.showsCursor = true
            config.capturesAudio = false
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let stream = SCStream(filter: filter, configuration: config, delegate: nil)
            try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: recorder.queue)
            try await stream.startCapture()
            print("RECORDING: real \(window.owningApplication?.applicationName ?? "Codex") window for \(seconds)s. Keep Codex visible.")
            fflush(stdout)
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            try await stream.stopCapture()
            try await recorder.finish()
            print("SAVED: \(output.path) (\(recorder.frames) real screen frames)")
        } catch { print("Recording failed: \(error.localizedDescription)"); exit(1) }
    }
}
