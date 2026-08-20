import Foundation

public protocol ScanServicing: Sendable {
    func scan(_ request: ScanRequest) async -> ScanResult
}

public struct ScanService: ScanServicing, Sendable {
    private let inventory: any FileInventorying
    private let checksums: any InventoryChecksumming
    private let audioInspector: any AudioInspecting
    private let imageInspector: any ImageInspecting
    private let presetResolver: any PresetResolving
    private let ruleEngine: any RuleEvaluating
    private let fingerprinting: any SourceFingerprinting
    private let now: @Sendable () -> Date

    public init() {
        self.init(
            inventory: FileInventory(),
            checksums: ChecksumService(),
            audioInspector: AudioInspector(),
            imageInspector: ImageInspector(),
            presetResolver: PresetResolver(),
            ruleEngine: RuleEngine(),
            fingerprinting: SourceFingerprint(),
            now: Date.init
        )
    }

    public init(
        inventory: any FileInventorying,
        checksums: any InventoryChecksumming,
        audioInspector: any AudioInspecting,
        imageInspector: any ImageInspecting,
        presetResolver: any PresetResolving,
        ruleEngine: any RuleEvaluating,
        fingerprinting: any SourceFingerprinting,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.inventory = inventory
        self.checksums = checksums
        self.audioInspector = audioInspector
        self.imageInspector = imageInspector
        self.presetResolver = presetResolver
        self.ruleEngine = ruleEngine
        self.fingerprinting = fingerprinting
        self.now = now
    }

    public func scan(_ request: ScanRequest) async -> ScanResult {
        let startedAt = now()
        let root = request.selectedFolderURL.standardizedFileURL

        do {
            try Task.checkCancellation()
            let preset = try presetResolver.resolve(request.preset.definition)

            try Task.checkCancellation()
            let inventoried = try await inventory.inventory(root: root)
            let before = try fingerprinting.fingerprint(root: root, entries: inventoried.entries)

            try Task.checkCancellation()
            let inspected = await inspect(entries: inventoried.entries, root: root)

            try Task.checkCancellation()
            let checksummed = try await checksums.checksummedInventory(entries: inspected.entries, root: root)

            try Task.checkCancellation()
            var findings = ruleEngine.evaluate(
                snapshot: InventorySnapshot(
                    entries: checksummed.entries,
                    findings: inventoried.findings + inspected.findings + checksummed.findings
                ),
                preset: preset,
                engineVersion: request.engineVersion
            )

            try Task.checkCancellation()
            let postInventory: InventorySnapshot
            do {
                postInventory = try await inventory.inventory(root: root)
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                return incompleteResult(
                    request: request,
                    root: root,
                    startedAt: startedAt,
                    finding: rootAccessFinding(engineVersion: request.engineVersion)
                )
            }
            try Task.checkCancellation()
            guard !postInventoryHasIncompleteEvidence(postInventory) else {
                return incompleteResult(
                    request: request,
                    root: root,
                    startedAt: startedAt,
                    finding: rootAccessFinding(engineVersion: request.engineVersion)
                )
            }
            let after = try fingerprinting.fingerprint(root: root, entries: postInventory.entries)
            if !before.matches(after) {
                findings.append(sourceChangedFinding(engineVersion: request.engineVersion))
            }
            try Task.checkCancellation()

            return ScanResult(
                selectedFolderName: selectedFolderName(for: root),
                preset: preset,
                applicationVersion: request.applicationVersion,
                engineVersion: request.engineVersion,
                startedAt: startedAt,
                completedAt: now(),
                inventory: checksummed.entries,
                findings: findings,
                overallStatus: OverallStatus.completed(findings: findings)
            )
        } catch is CancellationError {
            return incompleteResult(
                request: request,
                root: root,
                startedAt: startedAt,
                finding: cancellationFinding(engineVersion: request.engineVersion)
            )
        } catch {
            return incompleteResult(
                request: request,
                root: root,
                startedAt: startedAt,
                finding: failureFinding(for: error, engineVersion: request.engineVersion)
            )
        }
    }

    private func inspect(entries: [InventoryEntry], root: URL) async -> InventorySnapshot {
        var inspectedEntries: [InventoryEntry] = []
        var findings: [Finding] = []

        for entry in entries {
            if Task.isCancelled {
                return InventorySnapshot(entries: inspectedEntries, findings: findings)
            }

            guard entry.kind == .regular else {
                inspectedEntries.append(entry)
                continue
            }

            let source = TrustedMediaSource(root: root, relativePath: entry.relativePath)
            switch entry.category {
            case .audio:
                let outcome = await audioInspector.inspect(source: source)
                inspectedEntries.append(merging(entry, audio: outcome))
                findings.append(contentsOf: outcome.findings)
            case .artwork:
                let outcome = imageInspector.inspect(source: source)
                inspectedEntries.append(merging(entry, image: outcome))
                findings.append(contentsOf: outcome.findings)
            case .document, .serviceFile, .other:
                inspectedEntries.append(entry)
            }
        }

        return InventorySnapshot(entries: inspectedEntries, findings: findings)
    }

    private func merging(
        _ entry: InventoryEntry,
        audio outcome: InspectionOutcome<AudioProperties>
    ) -> InventoryEntry {
        InventoryEntry(
            relativePath: entry.relativePath,
            normalizedFilename: entry.normalizedFilename,
            normalizedExtension: entry.normalizedExtension,
            category: entry.category,
            byteSize: entry.byteSize,
            modificationDate: entry.modificationDate,
            kind: entry.kind,
            sha256: entry.sha256,
            inspectionStatus: outcome.status,
            audioProperties: outcome.value,
            imageProperties: entry.imageProperties,
            evidence: entry.evidence
        )
    }

    private func merging(
        _ entry: InventoryEntry,
        image outcome: InspectionOutcome<ImageProperties>
    ) -> InventoryEntry {
        InventoryEntry(
            relativePath: entry.relativePath,
            normalizedFilename: entry.normalizedFilename,
            normalizedExtension: entry.normalizedExtension,
            category: entry.category,
            byteSize: entry.byteSize,
            modificationDate: entry.modificationDate,
            kind: entry.kind,
            sha256: entry.sha256,
            inspectionStatus: outcome.status,
            audioProperties: entry.audioProperties,
            imageProperties: outcome.value,
            evidence: entry.evidence
        )
    }

    private func incompleteResult(
        request: ScanRequest,
        root: URL,
        startedAt: Date,
        finding: Finding
    ) -> ScanResult {
        ScanResult(
            selectedFolderName: selectedFolderName(for: root),
            preset: request.preset,
            applicationVersion: request.applicationVersion,
            engineVersion: request.engineVersion,
            startedAt: startedAt,
            inventory: [],
            findings: [finding],
            overallStatus: .incomplete
        )
    }

    private func selectedFolderName(for root: URL) -> String {
        let name = root.lastPathComponent
        return name.isEmpty ? "Selected folder" : name
    }

    private func cancellationFinding(engineVersion: String) -> Finding {
        Finding(
            ruleID: "scan.cancelled",
            severity: .information,
            title: "Scan cancelled",
            explanation: "The scan was cancelled before it could produce a complete result.",
            affectedPaths: [],
            evidence: [],
            expected: "A completed scan of an unchanged selected source.",
            suggestedAction: "Run the scan again when the selected source is ready.",
            origin: .engine,
            engineVersion: engineVersion
        )
    }

    private func sourceChangedFinding(engineVersion: String) -> Finding {
        Finding(
            ruleID: "filesystem.source-changed-during-scan",
            severity: .error,
            title: "Selected source changed during scan",
            explanation: "Source metadata changed while the scan was running, so the scan cannot prove a stable source snapshot.",
            affectedPaths: [],
            evidence: [],
            expected: "An unchanged selected source throughout the scan.",
            suggestedAction: "Stop changes to the selected source and run the scan again.",
            origin: .engine,
            engineVersion: engineVersion
        )
    }

    private func rootAccessFinding(engineVersion: String) -> Finding {
        Finding(
            ruleID: "filesystem.root-access-failed",
            severity: .error,
            title: "Selected root could not be accessed",
            explanation: "The selected source root could not be accessed safely.",
            affectedPaths: [],
            evidence: [],
            expected: "A readable selected source root throughout the scan.",
            suggestedAction: "Restore access to the selected source and run the scan again.",
            origin: .engine,
            engineVersion: engineVersion
        )
    }

    private func postInventoryHasIncompleteEvidence(_ snapshot: InventorySnapshot) -> Bool {
        snapshot.findings.contains { finding in
            switch finding.ruleID {
            case "filesystem.enumeration-failed", "filesystem.metadata-unreadable", "filesystem.invalid-relative-path":
                true
            default:
                false
            }
        }
    }

    private func failureFinding(for error: Error, engineVersion: String) -> Finding {
        let ruleID: String
        let title: String
        let explanation: String
        switch error {
        case PreflightError.invalidPreset:
            ruleID = "preset.resolution-failed"
            title = "Preset could not be resolved"
            explanation = "The selected preset could not be resolved safely."
        case PreflightError.invalidScanRequest:
            return rootAccessFinding(engineVersion: engineVersion)
        case is TrustedFileAccessError:
            return rootAccessFinding(engineVersion: engineVersion)
        case is PreflightError:
            ruleID = "scan.precondition-failed"
            title = "Scan precondition could not be verified"
            explanation = "The selected source or preset could not be verified safely."
        default:
            ruleID = "scan.phase-failed"
            title = "Scan phase could not complete"
            explanation = "A required scan phase could not complete safely."
        }
        return Finding(
            ruleID: ruleID,
            severity: .error,
            title: title,
            explanation: explanation,
            affectedPaths: [],
            evidence: [],
            expected: "A completed scan of a valid selected source and preset.",
            suggestedAction: "Review the selected source and preset, then run the scan again.",
            origin: .engine,
            engineVersion: engineVersion
        )
    }
}
