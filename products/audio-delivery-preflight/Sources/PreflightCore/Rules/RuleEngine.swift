import Foundation

public protocol RuleEvaluating: Sendable {
    func evaluate(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [Finding]
    func roleAssignments(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [RoleAssignment]
}

public extension RuleEvaluating {
    func roleAssignments(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [RoleAssignment] {
        []
    }
}

public struct RuleEngine: RuleEvaluating {
    public init() {}

    public func evaluate(snapshot: InventorySnapshot, preset: ResolvedPreset, engineVersion: String) -> [Finding] {
        var findings = snapshot.findings
        findings.append(contentsOf: audioRequirements(in: snapshot.entries, requirement: preset.definition.audio, engineVersion: engineVersion))
        findings.append(contentsOf: audioConsistency(in: snapshot.entries, requirement: preset.definition.audio, engineVersion: engineVersion))
        findings.append(contentsOf: filenameHygiene(in: snapshot.entries, requirement: preset.definition.filename, engineVersion: engineVersion))
        findings.append(contentsOf: roleMatching(in: snapshot.entries, preset: preset, engineVersion: engineVersion).findings)
        findings.append(contentsOf: artworkRequirements(in: snapshot.entries, requirement: preset.definition.artwork, engineVersion: engineVersion))
        findings.append(contentsOf: serviceFiles(in: snapshot.entries, severity: preset.definition.serviceFileSeverity, engineVersion: engineVersion))
        findings.append(contentsOf: symbolicLinks(in: snapshot.entries, severity: preset.definition.symbolicLinkSeverity, engineVersion: engineVersion))
        findings.append(contentsOf: exactDuplicates(in: snapshot.entries, severity: preset.definition.exactDuplicateSeverity, engineVersion: engineVersion))
        return findings.sorted(by: findingLessThan)
    }

    public func roleAssignments(
        snapshot: InventorySnapshot,
        preset: ResolvedPreset,
        engineVersion: String
    ) -> [RoleAssignment] {
        roleMatching(in: snapshot.entries, preset: preset, engineVersion: engineVersion).assignments
    }

    private func audioRequirements(
        in entries: [InventoryEntry],
        requirement: AudioRequirement,
        engineVersion: String
    ) -> [Finding] {
        entries.filter { $0.kind == .regular && $0.category == .audio }.flatMap { entry in
            var findings: [Finding] = []
            if let expectedContainer = Self.containerExpected(forExtension: entry.normalizedExtension),
               let measuredContainer = entry.audioProperties?.container,
               !Self.equalIgnoringCase(expectedContainer, measuredContainer)
            {
                findings.append(finding(
                    ruleID: "audio.filename-content-mismatch",
                    severity: .warning,
                    title: "Audio filename extension does not match inspected content",
                    explanation: "The inspected audio container does not match the filename extension.",
                    paths: [entry.relativePath],
                    evidence: [
                        Evidence(label: "extension", value: .string(entry.normalizedExtension)),
                        Evidence(label: "container", value: .string(measuredContainer)),
                    ],
                    expected: "A filename extension consistent with the inspected audio container.",
                    suggestedAction: "Re-export the file in the intended format or correct its filename before delivery.",
                    origin: .engine,
                    engineVersion: engineVersion
                ))
            }
            if let extensions = requirement.allowedExtensions,
               !extensions.contains(where: { Self.equalIgnoringCase($0, entry.normalizedExtension) })
            {
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
            if let encodings = requirement.allowedEncodings {
                findings.append(contentsOf: allowedEncodingFindings(
                    entry: entry,
                    allowedEncodings: encodings,
                    ruleIDPrefix: "audio",
                    severity: requirement.severity,
                    engineVersion: engineVersion
                ))
            }
            if let constraint = requirement.sampleRate {
                findings.append(contentsOf: requiredNumericFindings(
                    ruleID: "audio.sample-rate",
                    title: "Audio sample rate is outside the preset range",
                    path: entry.relativePath,
                    value: entry.audioProperties?.sampleRate,
                    label: "sampleRate",
                    constraint: constraint,
                    severity: requirement.severity,
                    engineVersion: engineVersion
                ))
            }
            if let constraint = requirement.bitDepth {
                findings.append(contentsOf: requiredNumericFindings(
                    ruleID: "audio.bit-depth",
                    title: "Audio bit depth is outside the preset range",
                    path: entry.relativePath,
                    value: entry.audioProperties?.pcmBitDepth.map(Double.init),
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
        let readableAudio = entries.filter {
            $0.kind == .regular && $0.category == .audio && $0.audioProperties?.isReadable == true
        }
        guard !readableAudio.isEmpty else { return [] }

        var findings: [Finding] = []
        if requirement.requireConsistentSampleRate {
            findings.append(contentsOf: consistencyFindings(
                entries: readableAudio,
                value: { $0.audioProperties?.sampleRate },
                unavailableRuleID: "audio.consistent-sample-rate-unavailable",
                mixedRuleID: "audio.mixed-sample-rate",
                unavailableTitle: "Audio sample-rate consistency could not be established",
                mixedTitle: "Audio files have mixed sample rates",
                label: "sampleRate",
                expected: "Audio files must use one inspected sample rate.",
                severity: requirement.severity,
                engineVersion: engineVersion
            ))
        }
        if requirement.requireConsistentChannelCount {
            findings.append(contentsOf: consistencyFindings(
                entries: readableAudio,
                value: { $0.audioProperties?.channelCount.map(Double.init) },
                unavailableRuleID: "audio.consistent-channel-count-unavailable",
                mixedRuleID: "audio.mixed-channel-count",
                unavailableTitle: "Audio channel-count consistency could not be established",
                mixedTitle: "Audio files have mixed channel counts",
                label: "channelCount",
                expected: "Audio files must use one inspected channel count.",
                severity: requirement.severity,
                engineVersion: engineVersion
            ))
        }
        if requirement.requireConsistentBitDepth {
            let pcmOrUnknown = readableAudio.filter {
                $0.audioProperties?.encoding == nil || Self.equalIgnoringCase($0.audioProperties?.encoding ?? "", "Linear PCM")
            }
            if !pcmOrUnknown.isEmpty {
                findings.append(contentsOf: consistencyFindings(
                    entries: pcmOrUnknown,
                    value: { $0.audioProperties?.pcmBitDepth.map(Double.init) },
                    unavailableRuleID: "audio.consistent-bit-depth-unavailable",
                    mixedRuleID: "audio.mixed-bit-depth",
                    unavailableTitle: "PCM bit-depth consistency could not be established",
                    mixedTitle: "Linear PCM files have mixed bit depths",
                    label: "bitDepth",
                    expected: "Linear PCM audio files must use one inspected PCM bit depth.",
                    severity: requirement.severity,
                    engineVersion: engineVersion
                ))
            }
        }
        return findings
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

        let collisions = Dictionary(
            grouping: entries.filter { $0.kind == .regular },
            by: { PortablePathIdentity.key($0.relativePath.value) }
        )
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

    private struct RoleMatchingOutcome {
        var findings: [Finding] = []
        var assignments: [RoleAssignment] = []
    }

    private func roleMatching(
        in entries: [InventoryEntry],
        preset: ResolvedPreset,
        engineVersion: String
    ) -> RoleMatchingOutcome {
        var outcome = RoleMatchingOutcome()
        for compiledRole in preset.compiledRoles {
            let role = compiledRole.role
            let matchingEntries = entries.filter { entry in
                guard entry.kind == .regular, categoryMatches(entry, role: role), extensionMatches(entry, role: role) else { return false }
                let range = NSRange(entry.relativePath.value.startIndex..., in: entry.relativePath.value)
                return compiledRole.pattern.firstMatch(in: entry.relativePath.value, range: range) != nil
            }
            let paths = matchingEntries.map(\.relativePath).sorted(by: relativePathLessThan)
            if paths.isEmpty, role.required {
                outcome.findings.append(finding(
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
                ))
                continue
            }
            if paths.count > 1 {
                let ambiguity = finding(
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
                )
                outcome.findings.append(ambiguity)
                outcome.findings.append(contentsOf: matchingEntries.flatMap {
                    rolePropertyFindings(for: $0, role: role, engineVersion: engineVersion)
                })
                continue
            }
            guard let entry = matchingEntries.first else { continue }
            let propertyFindings = rolePropertyFindings(for: entry, role: role, engineVersion: engineVersion)
            outcome.findings.append(contentsOf: propertyFindings)
            if propertyFindings.isEmpty {
                outcome.assignments.append(RoleAssignment(
                    roleIdentifier: role.identifier,
                    roleName: role.name,
                    pattern: role.pattern,
                    matchedPath: entry.relativePath,
                    category: entry.category,
                    acceptedEvidence: acceptedRoleEvidence(for: entry, role: role)
                ))
            }
        }
        return outcome
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
        if role.category == .audio, let encodings = role.allowedEncodings {
            findings.append(contentsOf: allowedEncodingFindings(
                entry: entry,
                allowedEncodings: encodings,
                ruleIDPrefix: "role",
                roleIdentifier: role.identifier,
                severity: role.severity,
                engineVersion: engineVersion
            ))
        }
        if let constraint = role.channelCount {
            findings.append(contentsOf: requiredNumericFindings(
                ruleID: "role.channel-count.\(role.identifier)",
                title: "Delivery role channel count is outside the preset range",
                path: entry.relativePath,
                value: entry.audioProperties?.channelCount.map(Double.init),
                label: "channelCount",
                constraint: constraint,
                severity: role.severity,
                engineVersion: engineVersion
            ))
        }
        if let constraint = role.sampleRate {
            findings.append(contentsOf: requiredNumericFindings(
                ruleID: "role.sample-rate.\(role.identifier)",
                title: "Delivery role sample rate is outside the preset range",
                path: entry.relativePath,
                value: entry.audioProperties?.sampleRate,
                label: "sampleRate",
                constraint: constraint,
                severity: role.severity,
                engineVersion: engineVersion
            ))
        }
        if let constraint = role.bitDepth {
            findings.append(contentsOf: requiredNumericFindings(
                ruleID: "role.bit-depth.\(role.identifier)",
                title: "Delivery role bit depth is outside the preset range",
                path: entry.relativePath,
                value: entry.audioProperties?.pcmBitDepth.map(Double.init),
                label: "bitDepth",
                constraint: constraint,
                severity: role.severity,
                engineVersion: engineVersion
            ))
        }
        return findings
    }

    private func acceptedRoleEvidence(for entry: InventoryEntry, role: DeliveryRole) -> [Evidence] {
        var evidence: [Evidence] = []
        if role.allowedExtensions != nil {
            evidence.append(Evidence(label: "extension", value: .string(entry.normalizedExtension)))
        }
        if role.category == .audio || role.category == .artwork {
            evidence.append(Evidence(label: "isReadable", value: .boolean(true)))
        }
        if role.category == .audio, role.allowedEncodings != nil {
            if let container = entry.audioProperties?.container {
                evidence.append(Evidence(label: "container", value: .string(container)))
            }
            if let encoding = entry.audioProperties?.encoding {
                evidence.append(Evidence(label: "encoding", value: .string(encoding)))
            }
        }
        if role.channelCount != nil, let value = entry.audioProperties?.channelCount {
            evidence.append(Evidence(label: "channelCount", value: .integer(value)))
        }
        if role.sampleRate != nil, let value = entry.audioProperties?.sampleRate {
            evidence.append(Evidence(label: "sampleRate", value: .number(value)))
        }
        if role.bitDepth != nil, let value = entry.audioProperties?.pcmBitDepth {
            evidence.append(Evidence(label: "bitDepth", value: .integer(value)))
        }
        return evidence
    }

    private func artworkRequirements(in entries: [InventoryEntry], requirement: ArtworkRequirement?, engineVersion: String) -> [Finding] {
        guard let requirement else { return [] }
        return entries.filter { $0.kind == .regular && $0.category == .artwork }.flatMap { entry in
            guard let width = entry.imageProperties?.pixelWidth, let height = entry.imageProperties?.pixelHeight else {
                return [finding(
                    ruleID: "artwork.dimensions-unavailable",
                    severity: requirement.severity,
                    title: "Artwork dimensions could not be measured",
                    explanation: "The configured artwork requirement cannot pass because width or height is unavailable.",
                    paths: [entry.relativePath],
                    evidence: [
                        Evidence(label: "pixelWidth", value: entry.imageProperties?.pixelWidth.map { .integer($0) } ?? .unknown),
                        Evidence(label: "pixelHeight", value: entry.imageProperties?.pixelHeight.map { .integer($0) } ?? .unknown),
                    ],
                    expected: artworkExpectation(requirement),
                    suggestedAction: "Provide readable artwork with measurable dimensions, then run the preflight again.",
                    origin: .preset,
                    engineVersion: engineVersion
                )]
            }
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

    private func allowedEncodingFindings(
        entry: InventoryEntry,
        allowedEncodings: [String],
        ruleIDPrefix: String,
        roleIdentifier: String? = nil,
        severity: FindingSeverity,
        engineVersion: String
    ) -> [Finding] {
        let suffix = roleIdentifier.map { ".\($0)" } ?? ""
        let evidence = [
            Evidence(label: "extension", value: .string(entry.normalizedExtension)),
            Evidence(label: "container", value: entry.audioProperties?.container.map { .string($0) } ?? .unknown),
            Evidence(label: "encoding", value: entry.audioProperties?.encoding.map { .string($0) } ?? .unknown),
        ]
        guard let encoding = entry.audioProperties?.encoding else {
            return [finding(
                ruleID: "\(ruleIDPrefix).encoding-unavailable\(suffix)",
                severity: severity,
                title: "Required audio encoding could not be established",
                explanation: "The configured encoding requirement cannot pass because the inspected encoding is unavailable.",
                paths: [entry.relativePath],
                evidence: evidence,
                expected: "One of the inspected encodings: \(allowedEncodings.joined(separator: ", ")).",
                suggestedAction: "Provide a file whose encoding can be inspected and meets the configured requirement.",
                origin: .preset,
                engineVersion: engineVersion
            )]
        }
        guard !allowedEncodings.contains(where: { Self.equalIgnoringCase($0, encoding) }) else { return [] }
        return [finding(
            ruleID: "\(ruleIDPrefix).disallowed-encoding\(suffix)",
            severity: severity,
            title: "Audio encoding is not allowed by the preset",
            explanation: "The inspected audio encoding is outside the configured accepted encodings.",
            paths: [entry.relativePath],
            evidence: evidence,
            expected: "One of the inspected encodings: \(allowedEncodings.joined(separator: ", ")).",
            suggestedAction: "Supply a file whose inspected encoding meets the visible preset requirement.",
            origin: .preset,
            engineVersion: engineVersion
        )]
    }

    private func requiredNumericFindings(
        ruleID: String,
        title: String,
        path: RelativePath,
        value: Double?,
        label: String,
        constraint: NumericConstraint,
        severity: FindingSeverity,
        engineVersion: String
    ) -> [Finding] {
        guard let value else {
            return [finding(
                ruleID: unavailableRuleID(for: ruleID),
                severity: severity,
                title: "Required \(label) measurement is unavailable",
                explanation: "The configured numeric requirement cannot pass because the inspected measurement is unavailable.",
                paths: [path],
                evidence: [Evidence(label: "measured", value: .unknown)],
                expected: numericExpectation(constraint),
                suggestedAction: "Provide a readable file with a measurable value, then run the preflight again.",
                origin: .preset,
                engineVersion: engineVersion
            )]
        }
        guard !matches(value, constraint) else { return [] }
        return [numericFinding(
            ruleID: ruleID,
            title: title,
            path: path,
            value: value,
            label: label,
            constraint: constraint,
            severity: severity,
            engineVersion: engineVersion
        )]
    }

    private func consistencyFindings(
        entries: [InventoryEntry],
        value: (InventoryEntry) -> Double?,
        unavailableRuleID: String,
        mixedRuleID: String,
        unavailableTitle: String,
        mixedTitle: String,
        label: String,
        expected: String,
        severity: FindingSeverity,
        engineVersion: String
    ) -> [Finding] {
        let missingPaths = entries.filter { value($0) == nil }.map(\.relativePath).sorted(by: relativePathLessThan)
        let measured = entries.compactMap(value)
        var findings: [Finding] = []
        if !missingPaths.isEmpty {
            findings.append(finding(
                ruleID: unavailableRuleID,
                severity: severity,
                title: unavailableTitle,
                explanation: "Consistency cannot be established because at least one required inspected value is unavailable.",
                paths: missingPaths,
                evidence: [Evidence(label: label, value: .unknown)],
                expected: expected,
                suggestedAction: "Provide files with measurable properties, then run the preflight again.",
                origin: .preset,
                engineVersion: engineVersion
            ))
        }
        let values = Set(measured)
        if values.count > 1 {
            let measuredPaths = entries.filter { value($0) != nil }.map(\.relativePath).sorted(by: relativePathLessThan)
            findings.append(finding(
                ruleID: mixedRuleID,
                severity: severity,
                title: mixedTitle,
                explanation: "The inspected audio files do not all report the same configured property.",
                paths: measuredPaths,
                evidence: values.sorted().map { Evidence(label: label, value: .number($0)) },
                expected: expected,
                suggestedAction: "Review the measured values and provide files that meet this preset requirement.",
                origin: .preset,
                engineVersion: engineVersion
            ))
        }
        return findings
    }

    private func unavailableRuleID(for ruleID: String) -> String {
        let components = ruleID.split(separator: ".", omittingEmptySubsequences: false)
        guard components.first == "role", components.count >= 3 else {
            return "\(ruleID)-unavailable"
        }
        return "role.\(components[1])-unavailable.\(components.dropFirst(2).joined(separator: "."))"
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
        role.allowedExtensions == nil
            || role.allowedExtensions?.contains(where: { Self.equalIgnoringCase($0, entry.normalizedExtension) }) == true
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

    private func artworkExpectation(_ requirement: ArtworkRequirement) -> String {
        var parts: [String] = []
        if requirement.requiresSquare { parts.append("square") }
        if let minimumWidth = requirement.minimumWidth { parts.append("at least \(minimumWidth) px wide") }
        if let minimumHeight = requirement.minimumHeight { parts.append("at least \(minimumHeight) px high") }
        return parts.isEmpty ? "Measurable artwork dimensions." : "Artwork that is \(parts.joined(separator: ", "))."
    }

    private static func containerExpected(forExtension extensionName: String) -> String? {
        switch extensionName.lowercased() {
        case "wav": "WAV"
        case "aif", "aiff": "AIFF"
        case "flac": "FLAC"
        case "mp3": "MP3"
        case "m4a": "M4A"
        default: nil
        }
    }

    private static func equalIgnoringCase(_ left: String, _ right: String) -> Bool {
        left.compare(right, options: [.caseInsensitive], locale: Locale(identifier: "en_US_POSIX")) == .orderedSame
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
