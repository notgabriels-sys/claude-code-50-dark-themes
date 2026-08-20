import Foundation

public protocol RuleEvaluating: Sendable {
    func evaluate(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [Finding]
}

public struct RuleEngine: RuleEvaluating {
    public init() {}

    public func evaluate(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [Finding] {
        var findings = snapshot.findings
        findings.append(contentsOf: readability(in: snapshot.entries, engineVersion: engineVersion))
        findings.append(contentsOf: audioRequirements(in: snapshot.entries, requirement: preset.definition.audio, engineVersion: engineVersion))
        findings.append(contentsOf: audioConsistency(in: snapshot.entries, requirement: preset.definition.audio, engineVersion: engineVersion))
        findings.append(contentsOf: filenameHygiene(in: snapshot.entries, requirement: preset.definition.filename, engineVersion: engineVersion))
        findings.append(contentsOf: roleMatching(in: snapshot.entries, preset: preset, engineVersion: engineVersion))
        findings.append(contentsOf: artworkRequirements(in: snapshot.entries, requirement: preset.definition.artwork, engineVersion: engineVersion))
        findings.append(contentsOf: serviceFiles(in: snapshot.entries, severity: preset.definition.serviceFileSeverity, engineVersion: engineVersion))
        findings.append(contentsOf: symbolicLinks(in: snapshot.entries, severity: preset.definition.symbolicLinkSeverity, engineVersion: engineVersion))
        findings.append(contentsOf: exactDuplicates(in: snapshot.entries, severity: preset.definition.exactDuplicateSeverity, engineVersion: engineVersion))
        return findings.sorted(by: findingLessThan)
    }

    private func readability(in entries: [InventoryEntry], engineVersion: String) -> [Finding] {
        entries.compactMap { entry in
            guard entry.kind == .regular else { return nil }
            switch entry.category {
            case .audio where entry.audioProperties?.isReadable == false || entry.inspectionStatus == .failed:
                return finding(
                    ruleID: "inspection.audio-unreadable",
                    severity: .warning,
                    title: "Audio file was not readable during inspection",
                    explanation: "The audio inspector could not read this file.",
                    paths: [entry.relativePath],
                    evidence: entry.evidence,
                    expected: "A readable audio file.",
                    suggestedAction: "Re-export or replace the file, then inspect it again.",
                    origin: .engine,
                    engineVersion: engineVersion
                )
            case .artwork where entry.imageProperties?.isReadable == false || entry.inspectionStatus == .failed:
                return finding(
                    ruleID: "inspection.artwork-unreadable",
                    severity: .warning,
                    title: "Artwork file was not readable during inspection",
                    explanation: "The artwork inspector could not read this file.",
                    paths: [entry.relativePath],
                    evidence: entry.evidence,
                    expected: "A readable artwork file.",
                    suggestedAction: "Re-export or replace the file, then inspect it again.",
                    origin: .engine,
                    engineVersion: engineVersion
                )
            default:
                return nil
            }
        }
    }

    private func audioRequirements(
        in entries: [InventoryEntry],
        requirement: AudioRequirement,
        engineVersion: String
    ) -> [Finding] {
        entries.filter { $0.kind == .regular && $0.category == .audio }.flatMap { entry in
            var findings: [Finding] = []
            if let extensions = requirement.allowedExtensions, !extensions.contains(entry.normalizedExtension) {
                findings.append(finding(
                    ruleID: "audio.disallowed-format",
                    severity: requirement.severity,
                    title: "Audio format is not allowed by the preset",
                    explanation: "The file extension is not in the preset's allowed audio formats.",
                    paths: [entry.relativePath],
                    evidence: [Evidence(label: "extension", value: .string(entry.normalizedExtension))],
                    expected: "One of: \(extensions.joined(separator: ", ")).",
                    suggestedAction: "Supply an audio file using one of the configured formats.",
                    origin: .preset,
                    engineVersion: engineVersion
                ))
            }
            if let constraint = requirement.sampleRate, let value = entry.audioProperties?.sampleRate, !matches(value, constraint) {
                findings.append(numericFinding(
                    ruleID: "audio.sample-rate",
                    title: "Audio sample rate is outside the preset range",
                    path: entry.relativePath,
                    value: value,
                    label: "sampleRate",
                    constraint: constraint,
                    severity: requirement.severity,
                    engineVersion: engineVersion
                ))
            }
            if let constraint = requirement.bitDepth, let value = entry.audioProperties?.pcmBitDepth.map(Double.init), !matches(value, constraint) {
                findings.append(numericFinding(
                    ruleID: "audio.bit-depth",
                    title: "Audio bit depth is outside the preset range",
                    path: entry.relativePath,
                    value: value,
                    label: "bitDepth",
                    constraint: constraint,
                    severity: requirement.severity,
                    engineVersion: engineVersion
                ))
            }
            return findings
        }
    }

    private func audioConsistency(
        in entries: [InventoryEntry],
        requirement: AudioRequirement,
        engineVersion: String
    ) -> [Finding] {
        guard requirement.requireConsistentSampleRate else { return [] }
        let sampleRates = Set(entries.compactMap { entry -> Double? in
            guard entry.kind == .regular, entry.category == .audio else { return nil }
            return entry.audioProperties?.sampleRate
        })
        guard sampleRates.count > 1 else { return [] }
        let paths = entries.filter { $0.kind == .regular && $0.category == .audio && $0.audioProperties?.sampleRate != nil }
            .map(\.relativePath)
            .sorted(by: relativePathLessThan)
        return [finding(
            ruleID: "audio.mixed-sample-rate",
            severity: requirement.severity,
            title: "Audio files have mixed sample rates",
            explanation: "The inspected audio files do not all report the same sample rate.",
            paths: paths,
            evidence: sampleRates.sorted().map { Evidence(label: "sampleRate", value: .number($0)) },
            expected: "Audio files must use one inspected sample rate.",
            suggestedAction: "Review the measured sample rates and provide files that meet this preset requirement.",
            origin: .preset,
            engineVersion: engineVersion
        )]
    }

    private func filenameHygiene(
        in entries: [InventoryEntry],
        requirement: FilenameRequirement,
        engineVersion: String
    ) -> [Finding] {
        var findings: [Finding] = []
        if let pattern = requirement.ambiguousVersionPattern, let expression = try? NSRegularExpression(pattern: pattern) {
            for entry in entries where entry.kind == .regular {
                let range = NSRange(entry.relativePath.value.startIndex..., in: entry.relativePath.value)
                if expression.firstMatch(in: entry.relativePath.value, range: range) != nil {
                    findings.append(finding(
                        ruleID: "filename.ambiguous-version",
                        severity: requirement.ambiguousVersionSeverity,
                        title: "Filename has an ambiguous version marker",
                        explanation: "The filename matches the preset's ambiguous version-marker pattern.",
                        paths: [entry.relativePath],
                        evidence: [Evidence(label: "pattern", value: .string(pattern))],
                        expected: "A filename that does not match the configured ambiguous version-marker pattern.",
                        suggestedAction: "Rename the file using the agreed delivery naming convention.",
                        origin: .preset,
                        engineVersion: engineVersion
                    ))
                }
            }
        }

        let collisions = Dictionary(grouping: entries.filter { $0.kind == .regular }, by: { $0.relativePath.value.lowercased() })
        for matchingEntries in collisions.values where matchingEntries.count > 1 {
            let paths = matchingEntries.map(\.relativePath).sorted(by: relativePathLessThan)
            findings.append(finding(
                ruleID: "filename.case-insensitive-collision",
                severity: .warning,
                title: "Files collide on case-insensitive filesystems",
                explanation: "More than one file has the same relative path when case is ignored.",
                paths: paths,
                evidence: [],
                expected: "Distinct relative filenames after case is ignored.",
                suggestedAction: "Rename one or more files so their relative paths remain distinct on case-insensitive filesystems.",
                origin: .engine,
                engineVersion: engineVersion
            ))
        }
        return findings
    }

    private func roleMatching(in entries: [InventoryEntry], preset: ResolvedPreset, engineVersion: String) -> [Finding] {
        preset.compiledRoles.flatMap { compiledRole in
            let role = compiledRole.role
            let matchingEntries = entries.filter { entry in
                guard entry.kind == .regular, categoryMatches(entry, role: role), extensionMatches(entry, role: role) else { return false }
                let range = NSRange(entry.relativePath.value.startIndex..., in: entry.relativePath.value)
                return compiledRole.pattern.firstMatch(in: entry.relativePath.value, range: range) != nil
            }
            let paths = matchingEntries.map(\.relativePath).sorted(by: relativePathLessThan)
            if paths.isEmpty, role.required {
                return [finding(
                    ruleID: "role.missing.\(role.identifier)",
                    severity: role.severity,
                    title: "Required delivery role is missing",
                    explanation: "No inventory entry matches the configured \(role.name) role.",
                    paths: [],
                    evidence: [Evidence(label: "role", value: .string(role.identifier))],
                    expected: "One file matching the configured \(role.name) role.",
                    suggestedAction: "Add the required delivery file or adjust the visible role pattern if it is incorrect.",
                    origin: .preset,
                    engineVersion: engineVersion
                )]
            }
            if paths.count > 1 {
                return [finding(
                    ruleID: "role.ambiguous.\(role.identifier)",
                    severity: role.ambiguitySeverity,
                    title: "Delivery role matches multiple files",
                    explanation: "Multiple inventory entries match the configured \(role.name) role; no file was selected automatically.",
                    paths: paths,
                    evidence: [Evidence(label: "role", value: .string(role.identifier)), Evidence(label: "matchCount", value: .integer(paths.count))],
                    expected: "Exactly one file matching the configured \(role.name) role.",
                    suggestedAction: "Rename, remove, or refine files so this role has one unambiguous match.",
                    origin: .preset,
                    engineVersion: engineVersion
                )]
            }
            guard let entry = matchingEntries.first else { return [] }
            return rolePropertyFindings(for: entry, role: role, engineVersion: engineVersion)
        }
    }

    private func rolePropertyFindings(for entry: InventoryEntry, role: DeliveryRole, engineVersion: String) -> [Finding] {
        var findings: [Finding] = []
        if role.category == .audio, entry.audioProperties?.isReadable != true {
            findings.append(finding(
                ruleID: "role.unreadable.\(role.identifier)",
                severity: role.readability,
                title: "Delivery role file is not readable",
                explanation: "The matching audio file was not confirmed readable by inspection.",
                paths: [entry.relativePath],
                evidence: [Evidence(label: "role", value: .string(role.identifier))],
                expected: "A readable file for the configured \(role.name) role.",
                suggestedAction: "Re-export or replace the matching file, then inspect it again.",
                origin: .preset,
                engineVersion: engineVersion
            ))
        }
        if role.category == .artwork, entry.imageProperties?.isReadable != true {
            findings.append(finding(
                ruleID: "role.unreadable.\(role.identifier)",
                severity: role.readability,
                title: "Delivery role file is not readable",
                explanation: "The matching artwork file was not confirmed readable by inspection.",
                paths: [entry.relativePath],
                evidence: [Evidence(label: "role", value: .string(role.identifier))],
                expected: "A readable file for the configured \(role.name) role.",
                suggestedAction: "Re-export or replace the matching file, then inspect it again.",
                origin: .preset,
                engineVersion: engineVersion
            ))
        }
        if let constraint = role.channelCount, let value = entry.audioProperties?.channelCount.map(Double.init), !matches(value, constraint) {
            findings.append(numericFinding(ruleID: "role.channel-count.\(role.identifier)", title: "Delivery role channel count is outside the preset range", path: entry.relativePath, value: value, label: "channelCount", constraint: constraint, severity: role.severity, engineVersion: engineVersion))
        }
        if let constraint = role.sampleRate, let value = entry.audioProperties?.sampleRate, !matches(value, constraint) {
            findings.append(numericFinding(ruleID: "role.sample-rate.\(role.identifier)", title: "Delivery role sample rate is outside the preset range", path: entry.relativePath, value: value, label: "sampleRate", constraint: constraint, severity: role.severity, engineVersion: engineVersion))
        }
        if let constraint = role.bitDepth, let value = entry.audioProperties?.pcmBitDepth.map(Double.init), !matches(value, constraint) {
            findings.append(numericFinding(ruleID: "role.bit-depth.\(role.identifier)", title: "Delivery role bit depth is outside the preset range", path: entry.relativePath, value: value, label: "bitDepth", constraint: constraint, severity: role.severity, engineVersion: engineVersion))
        }
        return findings
    }

    private func artworkRequirements(in entries: [InventoryEntry], requirement: ArtworkRequirement?, engineVersion: String) -> [Finding] {
        guard let requirement else { return [] }
        return entries.filter { $0.kind == .regular && $0.category == .artwork }.flatMap { entry in
            guard let width = entry.imageProperties?.pixelWidth, let height = entry.imageProperties?.pixelHeight else { return [Finding]() }
            var findings: [Finding] = []
            if requirement.requiresSquare, width != height {
                findings.append(finding(
                    ruleID: "artwork.not-square",
                    severity: requirement.severity,
                    title: "Artwork is not square",
                    explanation: "The inspected artwork dimensions have different width and height.",
                    paths: [entry.relativePath],
                    evidence: [Evidence(label: "pixelWidth", value: .integer(width)), Evidence(label: "pixelHeight", value: .integer(height))],
                    expected: "Square artwork as required by the preset.",
                    suggestedAction: "Provide artwork whose inspected width and height are equal.",
                    origin: .preset,
                    engineVersion: engineVersion
                ))
            }
            if let minimumWidth = requirement.minimumWidth, width < minimumWidth {
                findings.append(undersizedArtworkFinding(entry: entry, width: width, height: height, requirement: requirement, engineVersion: engineVersion))
            } else if let minimumHeight = requirement.minimumHeight, height < minimumHeight {
                findings.append(undersizedArtworkFinding(entry: entry, width: width, height: height, requirement: requirement, engineVersion: engineVersion))
            }
            return findings
        }
    }

    private func undersizedArtworkFinding(entry: InventoryEntry, width: Int, height: Int, requirement: ArtworkRequirement, engineVersion: String) -> Finding {
        finding(
            ruleID: "artwork.undersized",
            severity: requirement.severity,
            title: "Artwork is smaller than the preset minimum",
            explanation: "The inspected artwork dimensions are below at least one configured minimum.",
            paths: [entry.relativePath],
            evidence: [Evidence(label: "pixelWidth", value: .integer(width)), Evidence(label: "pixelHeight", value: .integer(height))],
            expected: "Artwork at least \(requirement.minimumWidth.map(String.init) ?? "any") px wide and \(requirement.minimumHeight.map(String.init) ?? "any") px high.",
            suggestedAction: "Provide artwork that meets the configured minimum dimensions.",
            origin: .preset,
            engineVersion: engineVersion
        )
    }

    private func serviceFiles(in entries: [InventoryEntry], severity: FindingSeverity, engineVersion: String) -> [Finding] {
        entries.filter { $0.kind == .regular && $0.category == .serviceFile }.map { entry in
            finding(
                ruleID: "filesystem.service-file",
                severity: severity,
                title: "Service file is included in the inventory",
                explanation: "This file is classified as a service file rather than a delivery asset.",
                paths: [entry.relativePath],
                evidence: [],
                expected: "Delivery assets without service files.",
                suggestedAction: "Remove the service file from the delivery folder if it is not intended for delivery.",
                origin: .preset,
                engineVersion: engineVersion
            )
        }
    }

    private func symbolicLinks(in entries: [InventoryEntry], severity: FindingSeverity, engineVersion: String) -> [Finding] {
        entries.filter { $0.kind == .symbolicLink }.map { entry in
            finding(
                ruleID: "filesystem.symbolic-link",
                severity: severity,
                title: "Symbolic link is included in the inventory",
                explanation: "Symbolic-link destinations are not inspected as delivery content.",
                paths: [entry.relativePath],
                evidence: [],
                expected: "Regular delivery files inside the selected folder.",
                suggestedAction: "Replace the symbolic link with the intended regular file if it belongs in the delivery.",
                origin: .preset,
                engineVersion: engineVersion
            )
        }
    }

    private func exactDuplicates(in entries: [InventoryEntry], severity: FindingSeverity, engineVersion: String) -> [Finding] {
        let entriesByPath = Dictionary(uniqueKeysWithValues: entries.map { ($0.relativePath, $0) })
        return ChecksumService().duplicateGroups(entries: entries).map { group in
            let matchingEntries = group.paths.compactMap { entriesByPath[$0] }
            let paths = group.paths.sorted(by: relativePathLessThan)
            var evidence = [Evidence(label: "sha256", value: .string(group.sha256))]
            let sizes = matchingEntries.compactMap(\.byteSize)
            if sizes.count == matchingEntries.count, let smallest = sizes.min() {
                evidence.append(Evidence(label: "duplicateByteTotal", value: .integer(Int(sizes.reduce(0, +) - smallest))))
            }
            return finding(
                ruleID: "duplicate.exact",
                severity: severity,
                title: "Exact duplicate files were found",
                explanation: "The listed files have the same calculated SHA-256 digest.",
                paths: paths,
                evidence: evidence,
                expected: "One copy of each intended delivery file.",
                suggestedAction: "Review the duplicate files and remove or rename unintended copies.",
                origin: .preset,
                engineVersion: engineVersion
            )
        }
    }

    private func numericFinding(
        ruleID: String,
        title: String,
        path: RelativePath,
        value: Double,
        label: String,
        constraint: NumericConstraint,
        severity: FindingSeverity,
        engineVersion: String
    ) -> Finding {
        finding(
            ruleID: ruleID,
            severity: severity,
            title: title,
            explanation: "The inspected value is outside the configured preset range.",
            paths: [path],
            evidence: [Evidence(label: label, value: .number(value))],
            expected: numericExpectation(constraint),
            suggestedAction: "Provide a file whose inspected value meets the configured preset range.",
            origin: .preset,
            engineVersion: engineVersion
        )
    }

    private func categoryMatches(_ entry: InventoryEntry, role: DeliveryRole) -> Bool {
        role.category == nil || role.category == entry.category
    }

    private func extensionMatches(_ entry: InventoryEntry, role: DeliveryRole) -> Bool {
        role.allowedExtensions == nil || role.allowedExtensions?.contains(entry.normalizedExtension) == true
    }

    private func matches(_ value: Double, _ constraint: NumericConstraint) -> Bool {
        (constraint.minimum == nil || value >= constraint.minimum!) && (constraint.maximum == nil || value <= constraint.maximum!)
    }

    private func numericExpectation(_ constraint: NumericConstraint) -> String {
        switch (constraint.minimum, constraint.maximum) {
        case let (.some(minimum), .some(maximum)) where minimum == maximum:
            return "Exactly \(minimum)."
        case let (.some(minimum), .some(maximum)):
            return "Between \(minimum) and \(maximum)."
        case let (.some(minimum), .none):
            return "At least \(minimum)."
        case let (.none, .some(maximum)):
            return "At most \(maximum)."
        case (.none, .none):
            return "No numeric bound is configured."
        }
    }

    private func finding(
        ruleID: String,
        severity: FindingSeverity,
        title: String,
        explanation: String,
        paths: [RelativePath],
        evidence: [Evidence],
        expected: String,
        suggestedAction: String,
        origin: RuleOrigin,
        engineVersion: String
    ) -> Finding {
        Finding(
            ruleID: ruleID,
            severity: severity,
            title: title,
            explanation: explanation,
            affectedPaths: paths,
            evidence: evidence,
            expected: expected,
            suggestedAction: suggestedAction,
            origin: origin,
            engineVersion: engineVersion
        )
    }

    private func findingLessThan(_ left: Finding, _ right: Finding) -> Bool {
        let leftRank = severityRank(left.severity)
        let rightRank = severityRank(right.severity)
        if leftRank != rightRank { return leftRank < rightRank }
        if left.ruleID != right.ruleID { return unicodeScalarLessThan(left.ruleID, right.ruleID) }
        let leftPath = left.affectedPaths.first?.value ?? ""
        let rightPath = right.affectedPaths.first?.value ?? ""
        return unicodeScalarLessThan(leftPath, rightPath)
    }

    private func severityRank(_ severity: FindingSeverity) -> Int {
        switch severity {
        case .error: return 0
        case .warning: return 1
        case .information: return 2
        case .pass: return 3
        }
    }

    private func relativePathLessThan(_ left: RelativePath, _ right: RelativePath) -> Bool {
        unicodeScalarLessThan(left.value, right.value)
    }

    private func unicodeScalarLessThan(_ left: String, _ right: String) -> Bool {
        left.unicodeScalars.lexicographicallyPrecedes(right.unicodeScalars)
    }
}
