import Darwin
import Foundation
import PreflightCore

public struct CLI: Sendable {
    public enum ExitCode: Int32, Sendable {
        case ready = 0
        case warnings = 1
        case requirementsNotMet = 2
        case invalidCommand = 3
        case scanCouldNotStart = 4
        case internalFailure = 5
    }

    public enum RuntimeError: Error, Sendable {
        case scanCouldNotStart
        case unexpected
    }

    public enum ReportDestinationState: Sendable, Equatable {
        case absent
        case existingItem
        case symbolicLinkInPath
        case unsafe
    }

    public struct Environment: Sendable {
        public var presets: [Preset]
        public var resolvePreset: @Sendable (Preset) throws -> ResolvedPreset
        public var loadPresetFile: @Sendable (URL) throws -> Preset
        public var scan: @Sendable (ScanRequest) async throws -> ScanResult
        public var folderExists: @Sendable (URL) -> Bool
        public var inspectReportDestination: @Sendable (URL) -> ReportDestinationState
        public var writeAtomically: @Sendable (Data, URL) throws -> Void
        public var writeStandardOutput: @Sendable (String) -> Void
        public var writeStandardError: @Sendable (String) -> Void
        public var applicationVersion: String
        public var engineVersion: String

        public init(
            presets: [Preset] = BuiltInPresets.all,
            resolvePreset: @escaping @Sendable (Preset) throws -> ResolvedPreset = { try PresetResolver().resolve($0) },
            loadPresetFile: @escaping @Sendable (URL) throws -> Preset = { try PresetFileLoader().load(from: $0) },
            scan: @escaping @Sendable (ScanRequest) async throws -> ScanResult = { request in
                await ScanService().scan(request)
            },
            folderExists: @escaping @Sendable (URL) -> Bool = { url in
                var isDirectory: ObjCBool = false
                return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
            },
            inspectReportDestination: @escaping @Sendable (URL) -> ReportDestinationState = { destination in
                CLI.reportDestinationState(at: destination)
            },
            writeAtomically: @escaping @Sendable (Data, URL) throws -> Void = { data, url in
                try CLI.writeReportAtomically(data, to: url, allowReplacingExisting: false)
            },
            writeStandardOutput: @escaping @Sendable (String) -> Void = { print($0) },
            writeStandardError: @escaping @Sendable (String) -> Void = { message in
                FileHandle.standardError.write(Data((message + "\n").utf8))
            },
            applicationVersion: String = "0.1.0",
            engineVersion: String = "0.1.0"
        ) {
            self.presets = presets
            self.resolvePreset = resolvePreset
            self.loadPresetFile = loadPresetFile
            self.scan = scan
            self.folderExists = folderExists
            self.inspectReportDestination = inspectReportDestination
            self.writeAtomically = writeAtomically
            self.writeStandardOutput = writeStandardOutput
            self.writeStandardError = writeStandardError
            self.applicationVersion = applicationVersion
            self.engineVersion = engineVersion
        }
    }

    private enum Command {
        case scan(folder: String, presetSource: PresetSource, reports: Reports)
        case presets
        case presetShow(identifier: String)
        case version
    }

    private enum PresetSource {
        case builtIn(identifier: String)
        case file(URL)
    }

    private struct Reports {
        var html: URL?
        var json: URL?
        var checksums: URL?

        var urls: [URL] {
            [html, json, checksums].compactMap { $0 }
        }

        var hasDistinctDestinations: Bool {
            Set(urls.map { PortablePathIdentity.key($0.path) }).count == urls.count
        }
    }

    public init() {}

    public func run(arguments: [String], environment: Environment = Environment()) async -> Int32 {
        do {
            switch try parse(arguments) {
            case .version:
                environment.writeStandardOutput("Audio Delivery Preflight \(environment.applicationVersion)")
                return ExitCode.ready.rawValue
            case .presets:
                for preset in environment.presets {
                    environment.writeStandardOutput("\(preset.identifier)\t\(preset.name)")
                }
                return ExitCode.ready.rawValue
            case .presetShow(let identifier):
                guard let preset = environment.presets.first(where: { $0.identifier == identifier }) else {
                    return unknownPreset(for: "preset show", environment: environment)
                }
                let resolved = try environment.resolvePreset(preset)
                printRequirements(resolved, environment: environment)
                return ExitCode.ready.rawValue
            case .scan(let folder, let presetSource, let reports):
                return await runScan(folder: folder, presetSource: presetSource, reports: reports, environment: environment)
            }
        } catch {
            return invalidConfiguration(environment)
        }
    }

    private func runScan(folder: String, presetSource: PresetSource, reports: Reports, environment: Environment) async -> Int32 {
        guard reports.hasDistinctDestinations else {
            return invalidConfiguration(environment)
        }

        let preset: Preset
        switch presetSource {
        case .builtIn(let identifier):
            guard let builtIn = environment.presets.first(where: { $0.identifier == identifier }) else {
                return unknownPreset(for: "scan --preset", environment: environment)
            }
            preset = builtIn
        case .file(let fileURL):
            do {
                preset = try environment.loadPresetFile(fileURL)
            } catch {
                return invalidConfiguration(environment)
            }
        }

        let resolved: ResolvedPreset
        do {
            resolved = try environment.resolvePreset(preset)
        } catch {
            return invalidConfiguration(environment)
        }

        let folderURL = lexicallyNormalizedFileURL(folder, isDirectory: true)
        guard reportDestinationsAreSafe(reports, root: folderURL, environment: environment) else {
            return invalidConfiguration(environment)
        }
        guard environment.folderExists(folderURL) else {
            environment.writeStandardError("Scan could not start: the selected folder is unavailable.")
            return ExitCode.scanCouldNotStart.rawValue
        }

        printRequirements(resolved, environment: environment)

        let request = ScanRequest(
            selectedFolderURL: folderURL,
            preset: resolved,
            applicationVersion: environment.applicationVersion,
            engineVersion: environment.engineVersion,
            reportOutputURLs: reports.urls
        )

        let result: ScanResult
        do {
            result = try await environment.scan(request)
        } catch RuntimeError.scanCouldNotStart {
            environment.writeStandardError("Scan could not start safely.")
            return ExitCode.scanCouldNotStart.rawValue
        } catch {
            environment.writeStandardError("Audio Delivery Preflight encountered an internal failure.")
            return ExitCode.internalFailure.rawValue
        }

        guard !reportsCollideWithInventory(reports, root: folderURL, inventory: result.inventory) else {
            return invalidConfiguration(environment)
        }
        guard reportDestinationsAreSafe(reports, root: folderURL, environment: environment) else {
            return invalidConfiguration(environment)
        }

        printSummary(result, environment: environment)

        do {
            try writeReports(reports, for: result, environment: environment)
        } catch {
            environment.writeStandardError("Report export failed. The completed scan result is unchanged.")
            return ExitCode.internalFailure.rawValue
        }

        return exitCode(for: result.overallStatus).rawValue
    }

    private func parse(_ arguments: [String]) throws -> Command {
        guard let first = arguments.first else { throw RuntimeError.unexpected }
        switch first {
        case "version" where arguments.count == 1:
            return .version
        case "presets" where arguments.count == 1:
            return .presets
        case "preset" where arguments.count == 3 && arguments[1] == "show":
            return .presetShow(identifier: arguments[2])
        case "scan":
            return try parseScan(Array(arguments.dropFirst()))
        default:
            throw RuntimeError.unexpected
        }
    }

    private func parseScan(_ arguments: [String]) throws -> Command {
        guard let folder = arguments.first, !folder.isEmpty, !folder.hasPrefix("--") else {
            throw RuntimeError.unexpected
        }
        var presetSource = PresetSource.builtIn(identifier: "general-audio")
        var reports = Reports()
        var seen: Set<String> = []
        var index = 1
        while index < arguments.count {
            let option = arguments[index]
            guard ["--preset", "--preset-file", "--report-html", "--report-json", "--checksums"].contains(option), !seen.contains(option), index + 1 < arguments.count else {
                throw RuntimeError.unexpected
            }
            let value = arguments[index + 1]
            guard !value.isEmpty, !value.hasPrefix("--") else { throw RuntimeError.unexpected }
            if (option == "--preset" && seen.contains("--preset-file"))
                || (option == "--preset-file" && seen.contains("--preset"))
            {
                throw RuntimeError.unexpected
            }
            seen.insert(option)
            switch option {
            case "--preset": presetSource = .builtIn(identifier: value)
            case "--preset-file": presetSource = .file(lexicallyNormalizedFileURL(value))
            case "--report-html": reports.html = normalizedFileURL(value)
            case "--report-json": reports.json = normalizedFileURL(value)
            case "--checksums": reports.checksums = normalizedFileURL(value)
            default: throw RuntimeError.unexpected
            }
            index += 2
        }
        return .scan(folder: folder, presetSource: presetSource, reports: reports)
    }

    private func printRequirements(_ preset: ResolvedPreset, environment: Environment) {
        environment.writeStandardOutput("Resolved requirements for \(preset.name) (\(preset.identifier)):")
        for requirement in preset.requirements {
            environment.writeStandardOutput("- [\(requirement.severity.rawValue)] \(requirement.description)")
        }
        if !preset.definition.roles.isEmpty {
            environment.writeStandardOutput("Delivery roles:")
            for role in preset.definition.roles {
                environment.writeStandardOutput("Role \(role.identifier): \(role.name)")
                environment.writeStandardOutput("  Required: \(role.required ? "yes" : "no")")
                environment.writeStandardOutput("  Pattern: \(role.pattern)")
                environment.writeStandardOutput("  Category: \(role.category?.rawValue ?? "any")")
                environment.writeStandardOutput("  Allowed extensions: \(role.allowedExtensions?.joined(separator: ", ") ?? "any")")
                if role.category == .audio {
                    environment.writeStandardOutput("  Allowed inspected audio encodings: \(role.allowedEncodings?.joined(separator: ", ") ?? "any")")
                    environment.writeStandardOutput("  Channel count: \(constraintText(role.channelCount))")
                    environment.writeStandardOutput("  Sample rate: \(constraintText(role.sampleRate, unit: "Hz"))")
                    environment.writeStandardOutput("  PCM bit depth: \(constraintText(role.bitDepth))")
                } else {
                    environment.writeStandardOutput("  Audio-only inspected constraints: not applicable")
                }
                let readability = role.category == .audio || role.category == .artwork
                    ? role.readability.rawValue
                    : "not applicable"
                environment.writeStandardOutput("  Unreadable media severity: \(readability)")
                environment.writeStandardOutput("  Missing or constrained value severity: \(role.severity.rawValue)")
                environment.writeStandardOutput("  Multiple matches severity: \(role.ambiguitySeverity.rawValue)")
            }
        }
    }

    private func printSummary(_ result: ScanResult, environment: Environment) {
        let errors = result.findings.filter { $0.severity == .error }.count
        let warnings = result.findings.filter { $0.severity == .warning }.count
        environment.writeStandardOutput("Scan summary:")
        environment.writeStandardOutput("Status: \(result.overallStatus.rawValue)")
        environment.writeStandardOutput("Inventory entries: \(result.inventory.count)")
        environment.writeStandardOutput("Errors: \(errors)")
        environment.writeStandardOutput("Warnings: \(warnings)")
        for entry in result.inventory {
            environment.writeStandardOutput("- \(entry.relativePath.value)")
        }
        environment.writeStandardOutput("Role assignments: \(result.roleAssignments.count)")
        for assignment in result.roleAssignments {
            environment.writeStandardOutput("- \(assignment.roleIdentifier): \(assignment.matchedPath.value)")
            environment.writeStandardOutput("  Role name: \(assignment.roleName)")
            environment.writeStandardOutput("  Matched pattern: \(assignment.pattern)")
            environment.writeStandardOutput("  Category: \(assignment.category.rawValue)")
            if assignment.acceptedEvidence.isEmpty {
                environment.writeStandardOutput("  Accepted evidence: none")
            } else {
                let evidence = assignment.acceptedEvidence.map {
                    "\($0.label)=\(evidenceText($0.value))"
                }.joined(separator: ", ")
                environment.writeStandardOutput("  Accepted evidence: \(evidence)")
            }
        }
        if result.overallStatus == .incomplete {
            environment.writeStandardOutput("Requirements outcome: not determined.")
        }
        environment.writeStandardOutput("Technical checks only: this is not artistic approval or distributor acceptance.")
    }

    private func constraintText(_ constraint: NumericConstraint?, unit: String? = nil) -> String {
        guard let constraint else { return "any" }
        let suffix = unit.map { " \($0)" } ?? ""
        switch (constraint.minimum, constraint.maximum) {
        case let (.some(minimum), .some(maximum)) where minimum == maximum:
            return "exactly \(displayNumber(minimum))\(suffix)"
        case let (.some(minimum), .some(maximum)):
            return "\(displayNumber(minimum)) to \(displayNumber(maximum))\(suffix)"
        case let (.some(minimum), .none):
            return "at least \(displayNumber(minimum))\(suffix)"
        case let (.none, .some(maximum)):
            return "at most \(displayNumber(maximum))\(suffix)"
        case (.none, .none):
            return "any"
        }
    }

    private func displayNumber(_ value: Double) -> String {
        let text = String(value)
        return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
    }

    private func evidenceText(_ value: EvidenceValue) -> String {
        switch value {
        case .string(let value): value
        case .number(let value): displayNumber(value)
        case .integer(let value): String(value)
        case .boolean(let value): value ? "true" : "false"
        case .unknown: "unknown"
        }
    }

    private func writeReports(_ reports: Reports, for result: ScanResult, environment: Environment) throws {
        if let destination = reports.html {
            try environment.writeAtomically(Data(HTMLReportWriter().html(for: result).utf8), destination)
            environment.writeStandardOutput("HTML report written.")
        }
        if let destination = reports.json {
            try environment.writeAtomically(try JSONReportWriter().data(for: result), destination)
            environment.writeStandardOutput("JSON report written.")
        }
        if let destination = reports.checksums {
            try environment.writeAtomically(Data(ChecksumManifestWriter().text(for: result).utf8), destination)
            environment.writeStandardOutput("Checksum manifest written.")
        }
    }

    private func normalizedFileURL(_ path: String) -> URL {
        lexicallyNormalizedFileURL(path)
    }

    private func lexicallyNormalizedFileURL(_ path: String, isDirectory: Bool = false) -> URL {
        let absolutePath = path.hasPrefix("/")
            ? path
            : FileManager.default.currentDirectoryPath + "/" + path
        return Self.lexicalURL(
            URL(fileURLWithPath: absolutePath, isDirectory: isDirectory),
            isDirectory: isDirectory
        )
    }

    private func reportsCollideWithInventory(_ reports: Reports, root: URL, inventory: [InventoryEntry]) -> Bool {
        let sourcePaths = Set(inventory.map { PortablePathIdentity.key($0.relativePath.value) })
        return reports.urls.contains { destination in
            guard let relativePath = lexicalRelativePath(of: destination, within: root) else { return false }
            return relativePath.isEmpty || sourcePaths.contains(PortablePathIdentity.key(relativePath))
        }
    }

    private func reportDestinationsAreSafe(_ reports: Reports, root: URL, environment: Environment) -> Bool {
        reports.urls.allSatisfy { destination in
            let state = environment.inspectReportDestination(destination)
            switch state {
            case .symbolicLinkInPath, .unsafe:
                return false
            case .existingItem:
                return false
            case .absent:
                guard let relativePath = lexicalRelativePath(of: destination, within: root) else { return true }
                return !relativePath.isEmpty
            }
        }
    }

    private func lexicalRelativePath(of destination: URL, within root: URL) -> String? {
        let rootComponents = Self.lexicalURL(root, isDirectory: true).pathComponents
        let destinationComponents = Self.lexicalURL(destination).pathComponents
        guard destinationComponents.count >= rootComponents.count,
              Array(destinationComponents.prefix(rootComponents.count)).map(PortablePathIdentity.key)
                == rootComponents.map(PortablePathIdentity.key)
        else {
            return nil
        }
        return destinationComponents.dropFirst(rootComponents.count).joined(separator: "/")
    }

    public static func reportDestinationState(at destination: URL) -> ReportDestinationState {
        guard destination.isFileURL else { return .unsafe }
        let normalized = lexicalURL(destination)
        let components = normalized.pathComponents
        guard components.first == "/", components.count > 1 else { return .unsafe }

        var currentPath = ""
        for (index, component) in components.enumerated() {
            if index == 0 {
                currentPath = "/"
                continue
            }
            currentPath = URL(fileURLWithPath: currentPath, isDirectory: true)
                .appendingPathComponent(component)
                .path

            var metadata = stat()
            let status = currentPath.withCString { lstat($0, &metadata) }
            if status == 0 {
                let fileType = metadata.st_mode & mode_t(S_IFMT)
                if fileType == mode_t(S_IFLNK) {
                    return .symbolicLinkInPath
                }
                if index < components.count - 1, fileType != mode_t(S_IFDIR) {
                    return .unsafe
                }
                if index == components.count - 1 {
                    return .existingItem
                }
            } else if errno == ENOENT {
                return .absent
            } else {
                return .unsafe
            }
        }
        return .unsafe
    }

    public static func writeReportAtomically(
        _ data: Data,
        to destination: URL,
        allowReplacingExisting: Bool
    ) throws {
        guard destination.isFileURL else { throw unsafeReportDestinationError() }
        let components = lexicalURL(destination).pathComponents
        guard components.first == "/", components.count > 1, let filename = components.last else {
            throw unsafeReportDestinationError()
        }

        var parentDescriptor = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC)
        guard parentDescriptor >= 0 else { throw unsafeReportDestinationError() }
        defer { close(parentDescriptor) }

        for component in components.dropFirst().dropLast() {
            let nextDescriptor = component.withCString {
                openat(parentDescriptor, $0, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            }
            guard nextDescriptor >= 0 else { throw unsafeReportDestinationError() }
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
        guard temporaryDescriptor >= 0 else { throw unsafeReportDestinationError() }
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
                guard count > 0 else { throw unsafeReportDestinationError() }
                written += count
            }
        }
        guard fsync(temporaryDescriptor) == 0 else { throw unsafeReportDestinationError() }
        let descriptorToClose = temporaryDescriptor
        temporaryDescriptor = -1
        guard close(descriptorToClose) == 0 else { throw unsafeReportDestinationError() }

        let renameStatus: Int32 = temporaryName.withCString { temporaryPointer in
            filename.withCString { filenamePointer in
                if allowReplacingExisting {
                    return renameat(parentDescriptor, temporaryPointer, parentDescriptor, filenamePointer)
                }
                return renameatx_np(
                    parentDescriptor,
                    temporaryPointer,
                    parentDescriptor,
                    filenamePointer,
                    UInt32(RENAME_EXCL)
                )
            }
        }
        guard renameStatus == 0 else { throw unsafeReportDestinationError() }
        temporaryExists = false
    }

    private static func unsafeReportDestinationError() -> PreflightError {
        PreflightError.exportFailed(reason: "The report destination cannot be written safely.")
    }

    private static func lexicalURL(_ url: URL, isDirectory: Bool = false) -> URL {
        var components: [Substring] = []
        for component in url.path.split(separator: "/", omittingEmptySubsequences: true) {
            switch component {
            case ".":
                continue
            case "..":
                if !components.isEmpty { components.removeLast() }
            default:
                components.append(component)
            }
        }
        return URL(
            fileURLWithPath: "/" + components.joined(separator: "/"),
            isDirectory: isDirectory
        )
    }

    private func exitCode(for status: OverallStatus) -> ExitCode {
        switch status {
        case .ready: .ready
        case .needsReview: .warnings
        case .requirementsNotMet: .requirementsNotMet
        case .incomplete: .scanCouldNotStart
        }
    }

    private func invalidConfiguration(_ environment: Environment) -> Int32 {
        environment.writeStandardError("Invalid command or configuration. Use: audio-preflight scan <folder> [--preset <id> | --preset-file <path>] [--report-html <path>] [--report-json <path>] [--checksums <path>]")
        return ExitCode.invalidCommand.rawValue
    }

    private func unknownPreset(for command: String, environment: Environment) -> Int32 {
        environment.writeStandardError("Unknown preset for \(command). Use audio-preflight presets to list valid identifiers.")
        return ExitCode.invalidCommand.rawValue
    }
}
