import Foundation

public enum PreflightError: Error, Sendable, Codable, Equatable {
    case invalidScanRequest(reason: String)
    case invalidPreset(field: String, reason: String)
    case inventoryFailed(path: String, reason: String)
    case inspectionFailed(path: String, reason: String)
    case exportFailed(reason: String)
    case cancelled

    private enum CodingKeys: String, CodingKey {
        case type
        case field
        case path
        case reason
    }

    private enum Kind: String, Codable {
        case invalidScanRequest
        case invalidPreset
        case inventoryFailed
        case inspectionFailed
        case exportFailed
        case cancelled
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .type) {
        case .invalidScanRequest:
            self = .invalidScanRequest(reason: try container.decode(String.self, forKey: .reason))
        case .invalidPreset:
            self = .invalidPreset(
                field: try container.decode(String.self, forKey: .field),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .inventoryFailed:
            self = .inventoryFailed(
                path: try container.decode(String.self, forKey: .path),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .inspectionFailed:
            self = .inspectionFailed(
                path: try container.decode(String.self, forKey: .path),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case .exportFailed:
            self = .exportFailed(reason: try container.decode(String.self, forKey: .reason))
        case .cancelled:
            self = .cancelled
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .invalidScanRequest(let reason):
            try container.encode(Kind.invalidScanRequest, forKey: .type)
            try container.encode(reason, forKey: .reason)
        case .invalidPreset(let field, let reason):
            try container.encode(Kind.invalidPreset, forKey: .type)
            try container.encode(field, forKey: .field)
            try container.encode(reason, forKey: .reason)
        case .inventoryFailed(let path, let reason):
            try container.encode(Kind.inventoryFailed, forKey: .type)
            try container.encode(path, forKey: .path)
            try container.encode(reason, forKey: .reason)
        case .inspectionFailed(let path, let reason):
            try container.encode(Kind.inspectionFailed, forKey: .type)
            try container.encode(path, forKey: .path)
            try container.encode(reason, forKey: .reason)
        case .exportFailed(let reason):
            try container.encode(Kind.exportFailed, forKey: .type)
            try container.encode(reason, forKey: .reason)
        case .cancelled:
            try container.encode(Kind.cancelled, forKey: .type)
        }
    }
}
