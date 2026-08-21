import Foundation

public struct PresetFileLoader: Sendable {
    public static let maximumByteCount = 1_048_576

    private let resolver: PresetResolver

    public init(resolver: PresetResolver = PresetResolver()) {
        self.resolver = resolver
    }

    public func load(from fileURL: URL) throws -> Preset {
        do {
            let data = try TrustedFileAccess.readBoundedRegularFile(
                at: fileURL,
                maximumByteCount: Self.maximumByteCount
            )
            try Task.checkCancellation()
            let preset = try JSONDecoder().decode(Preset.self, from: data)
            _ = try resolver.resolve(preset)
            try Task.checkCancellation()
            return preset
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw PreflightError.invalidPreset(
                field: "presetFile",
                reason: "The imported preset is unreadable, unsafe, unsupported, or invalid."
            )
        }
    }
}
