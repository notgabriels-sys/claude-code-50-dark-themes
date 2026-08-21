import Darwin
import Foundation
import Observation
import PreflightCore

@MainActor
@Observable
final class AppModel {
    /// A UI-only wrapper which preserves a finding's position in the original scan
    /// result. Rule identifiers describe requirements, not individual findings.
    struct FindingPresentationRow: Identifiable {
        let originalIndex: Int
        let finding: Finding

        var id: Int { originalIndex }
    }

    enum Phase: Equatable {
        case start
        case requirements
        case scanning
        case results
        case export
    }

    enum ExportFormat: String, CaseIterable, Identifiable, Sendable {
        case html
        case json
        case checksums

        var id: String { rawValue }

        var title: String {
            switch self {
            case .html: "Accessible HTML"
            case .json: "Versioned JSON"
            case .checksums: "SHA-256 checksums"
            }
        }

        var filename: String {
            switch self {
            case .html: "audio-preflight-report.html"
            case .json: "audio-preflight-report.json"
            case .checksums: "SHA256SUMS.txt"
            }
        }
    }

    struct Environment: Sendable {
        var scan: @Sendable (ScanRequest) async -> ScanResult
        var resolvePreset: @Sendable (Preset) throws -> ResolvedPreset
        var isFolder: @Sendable (URL) -> Bool
        var writeReport: @Sendable (Data, URL) async throws -> Void
        var applicationVersion: String
        var engineVersion: String

        init(
            scan: @escaping @Sendable (ScanRequest) async -> ScanResult = { request in
                await ScanService().scan(request)
            },
            resolvePreset: @escaping @Sendable (Preset) throws -> ResolvedPreset = {
                try PresetResolver().resolve($0)
            },
            isFolder: @escaping @Sendable (URL) -> Bool = { url in
                guard url.isFileURL else { return false }
                var isDirectory: ObjCBool = false
                return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
                    && isDirectory.boolValue
            },
            writeReport: @escaping @Sendable (Data, URL) async throws -> Void = { data, destination in
                try SecureReportWriter.write(data, to: destination)
            },
            applicationVersion: String = "0.1.0",
            engineVersion: String = "0.1.0"
        ) {
            self.scan = scan
            self.resolvePreset = resolvePreset
            self.isFolder = isFolder
            self.writeReport = writeReport
            self.applicationVersion = applicationVersion
            self.engineVersion = engineVersion
        }
    }

    private(set) var phase: Phase = .start
    private(set) var selectedFolderName: String?
    private(set) var resolvedRequirements: [ResolvedRequirement] = []
    private(set) var result: ScanResult?
    private(set) var availablePresets: [Preset]
    private(set) var selectedPresetID: String
    var selectedFindingID: FindingPresentationRow.ID?
    var activeSeverities = Set(FindingSeverity.allCases)
    var lastExportedFormat: ExportFormat?
    var errorMessage: String?

    @ObservationIgnored private let environment: Environment
    @ObservationIgnored private var selectedFolderURL: URL?
    @ObservationIgnored private var resolvedPreset: ResolvedPreset?
    @ObservationIgnored private var activeScan: Task<Void, Never>?
    @ObservationIgnored private var selectionGeneration = 0

    init(
        environment: Environment = Environment(),
        presets: [Preset] = BuiltInPresets.all,
        initialPresetID: String = BuiltInPresets.generalAudio.identifier
    ) {
        self.environment = environment
        self.availablePresets = presets
        self.selectedPresetID = presets.contains(where: { $0.identifier == initialPresetID })
            ? initialPresetID
            : presets.first?.identifier ?? initialPresetID
    }

    var canStartScan: Bool {
        phase == .requirements
            && selectedFolderURL != nil
            && resolvedPreset != nil
    }

    var findingRows: [FindingPresentationRow] {
        (result?.findings ?? []).enumerated().map { index, finding in
            FindingPresentationRow(originalIndex: index, finding: finding)
        }
    }

    var filteredFindingRows: [FindingPresentationRow] {
        findingRows.filter { activeSeverities.contains($0.finding.severity) }
    }

    var selectedFindingRow: FindingPresentationRow? {
        guard let selectedFindingID else { return nil }
        return filteredFindingRows.first(where: { $0.id == selectedFindingID })
    }

    var findingForDetail: Finding? {
        selectedFindingRow?.finding ?? filteredFindingRows.first?.finding
    }

    var severityCounts: [FindingSeverity: Int] {
        Dictionary(grouping: result?.findings ?? [], by: \.severity).mapValues(\.count)
    }

    var selectedPresetName: String {
        resolvedPreset?.name
            ?? availablePresets.first(where: { $0.identifier == selectedPresetID })?.name
            ?? "Selected preset"
    }

    var requiredRoles: [DeliveryRole] {
        resolvedPreset?.definition.roles.filter(\.required) ?? []
    }

    var inventory: [InventoryEntry] {
        result?.inventory ?? []
    }

    var isScanning: Bool {
        phase == .scanning
    }

    var exportConfirmationMessage: String? {
        lastExportedFormat.map { "Exported \($0.title)." }
    }

    func toggleSeverity(_ severity: FindingSeverity) {
        if activeSeverities.contains(severity) {
            activeSeverities.remove(severity)
        } else {
            activeSeverities.insert(severity)
        }
    }

    @discardableResult
    func selectFolder(_ url: URL) -> Bool {
        guard url.isFileURL, environment.isFolder(url) else {
            errorMessage = "Choose a readable folder. Scanning did not start."
            return false
        }

        activeScan?.cancel()
        activeScan = nil
        selectionGeneration += 1
        selectedFolderURL = url.standardizedFileURL
        selectedFolderName = Self.safeDisplayName(for: url)
        clearSessionStateForNewSelection()
        resolveSelectedPreset()
        phase = .requirements
        return true
    }

    @discardableResult
    func acceptDroppedFolder(_ url: URL) -> Bool {
        selectFolder(url)
    }

    func choosePreset(_ identifier: String) {
        guard phase != .scanning,
              availablePresets.contains(where: { $0.identifier == identifier })
        else { return }
        selectedPresetID = identifier
        result = nil
        selectedFindingID = nil
        lastExportedFormat = nil
        errorMessage = nil
        resolveSelectedPreset()
        phase = selectedFolderURL == nil ? .start : .requirements
    }

    func startScan() {
        guard canStartScan,
              let selectedFolderURL,
              let resolvedPreset
        else {
            if errorMessage == nil {
                errorMessage = "Resolve the selected preset requirements before starting a scan."
            }
            return
        }

        errorMessage = nil
        phase = .scanning
        let generation = selectionGeneration
        let request = ScanRequest(
            selectedFolderURL: selectedFolderURL,
            preset: resolvedPreset,
            applicationVersion: environment.applicationVersion,
            engineVersion: environment.engineVersion
        )
        let scan = environment.scan
        activeScan = Task { [weak self] in
            let scannedResult = await scan(request)
            guard let self, self.selectionGeneration == generation else { return }
            let settledResult = Task.isCancelled && scannedResult.overallStatus != .incomplete
                ? Self.cancelledResult(for: request)
                : scannedResult
            self.result = settledResult
            self.selectedFindingID = nil
            self.phase = .results
            self.activeScan = nil
        }
    }

    func cancelScan() {
        guard phase == .scanning,
              let selectedFolderURL,
              let resolvedPreset
        else { return }

        activeScan?.cancel()
        activeScan = nil
        selectionGeneration += 1
        let request = ScanRequest(
            selectedFolderURL: selectedFolderURL,
            preset: resolvedPreset,
            applicationVersion: environment.applicationVersion,
            engineVersion: environment.engineVersion
        )
        result = Self.cancelledResult(for: request)
        selectedFindingID = nil
        phase = .results
    }

    func rescan() {
        guard result != nil else { return }
        result = nil
        selectedFindingID = nil
        lastExportedFormat = nil
        errorMessage = nil
        phase = .requirements
    }

    func clearSelection() {
        guard phase != .scanning else { return }
        activeScan?.cancel()
        activeScan = nil
        selectionGeneration += 1
        selectedFolderURL = nil
        selectedFolderName = nil
        clearSessionStateForNewSelection()
        phase = .start
    }

    func showExport() {
        guard result != nil, phase == .results else { return }
        lastExportedFormat = nil
        errorMessage = nil
        phase = .export
    }

    func dismissExport() {
        guard result != nil else { return }
        phase = .results
    }

    func export(_ format: ExportFormat, to destination: URL) async {
        guard let result, destination.isFileURL else {
            errorMessage = "Choose a safe local report destination."
            phase = self.result == nil ? .start : .results
            return
        }

        do {
            let data = try reportData(format, result: result)
            try await environment.writeReport(data, destination)
            lastExportedFormat = format
            errorMessage = nil
        } catch {
            lastExportedFormat = nil
            errorMessage = "Report export failed. The scan result is unchanged."
        }
        phase = .results
    }

    private func clearSessionStateForNewSelection() {
        result = nil
        selectedFindingID = nil
        activeSeverities = Set(FindingSeverity.allCases)
        lastExportedFormat = nil
        errorMessage = nil
        resolvedPreset = nil
        resolvedRequirements = []
    }

    private func resolveSelectedPreset() {
        guard let preset = availablePresets.first(where: { $0.identifier == selectedPresetID }) else {
            errorMessage = "The selected preset is unavailable."
            return
        }
        do {
            let resolved = try environment.resolvePreset(preset)
            resolvedPreset = resolved
            resolvedRequirements = resolved.requirements
        } catch {
            resolvedPreset = nil
            resolvedRequirements = []
            errorMessage = "The selected preset requirements could not be resolved."
        }
    }

    private func reportData(_ format: ExportFormat, result: ScanResult) throws -> Data {
        switch format {
        case .html:
            Data(HTMLReportWriter().html(for: result).utf8)
        case .json:
            try JSONReportWriter().data(for: result)
        case .checksums:
            Data(ChecksumManifestWriter().text(for: result).utf8)
        }
    }

    private static func safeDisplayName(for url: URL) -> String {
        let component = url.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !component.isEmpty,
              component != ".",
              component != "..",
              !component.contains("/"),
              !component.contains("\\"),
              component.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) })
        else { return "Selected folder" }
        return component
    }

    private static func cancelledResult(for request: ScanRequest) -> ScanResult {
        ScanResult(
            selectedFolderName: safeDisplayName(for: request.selectedFolderURL),
            preset: request.preset,
            applicationVersion: request.applicationVersion,
            engineVersion: request.engineVersion,
            startedAt: Date(),
            inventory: [],
            findings: [Finding(
                ruleID: "scan.cancelled",
                severity: .information,
                title: "Scan cancelled",
                explanation: "The scan was cancelled before it could produce a complete result.",
                affectedPaths: [],
                evidence: [],
                expected: "A completed scan of an unchanged selected source.",
                suggestedAction: "Run the scan again when the selected source is ready.",
                origin: .engine,
                engineVersion: request.engineVersion
            )],
            overallStatus: .incomplete
        )
    }
}

private enum SecureReportWriter {
    static func write(_ data: Data, to destination: URL) throws {
        guard destination.isFileURL else { throw exportError() }
        let components = destination.standardizedFileURL.pathComponents
        guard components.first == "/", components.count > 1, let filename = components.last else {
            throw exportError()
        }

        var parentDescriptor = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        guard parentDescriptor >= 0 else { throw exportError() }
        defer { close(parentDescriptor) }

        for component in components.dropFirst().dropLast() {
            let nextDescriptor = component.withCString {
                openat(parentDescriptor, $0, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            }
            guard nextDescriptor >= 0 else { throw exportError() }
            close(parentDescriptor)
            parentDescriptor = nextDescriptor
        }

        let temporaryName = ".audio-preflight-\(UUID().uuidString).tmp"
        var temporaryDescriptor = temporaryName.withCString {
            openat(
                parentDescriptor,
                $0,
                O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
                S_IRUSR | S_IWUSR
            )
        }
        guard temporaryDescriptor >= 0 else { throw exportError() }
        var temporaryExists = true
        defer {
            if temporaryDescriptor >= 0 { close(temporaryDescriptor) }
            if temporaryExists {
                temporaryName.withCString { _ = unlinkat(parentDescriptor, $0, 0) }
            }
        }

        try data.withUnsafeBytes { bytes in
            guard let baseAddress = bytes.baseAddress else { return }
            var written = 0
            while written < bytes.count {
                let count = Darwin.write(
                    temporaryDescriptor,
                    baseAddress.advanced(by: written),
                    bytes.count - written
                )
                if count < 0, errno == EINTR { continue }
                guard count > 0 else { throw exportError() }
                written += count
            }
        }
        guard fsync(temporaryDescriptor) == 0 else { throw exportError() }
        let descriptorToClose = temporaryDescriptor
        temporaryDescriptor = -1
        guard close(descriptorToClose) == 0 else { throw exportError() }

        let renameStatus = temporaryName.withCString { temporaryPointer in
            filename.withCString { filenamePointer in
                renameatx_np(
                    parentDescriptor,
                    temporaryPointer,
                    parentDescriptor,
                    filenamePointer,
                    UInt32(RENAME_EXCL)
                )
            }
        }
        guard renameStatus == 0 else { throw exportError() }
        temporaryExists = false
    }

    private static func exportError() -> PreflightError {
        .exportFailed(reason: "The report destination cannot be written safely.")
    }
}
