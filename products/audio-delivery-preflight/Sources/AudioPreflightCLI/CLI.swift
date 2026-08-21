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

    public struct Environment: Sendable {
        public var presets: [Preset]
        public var resolvePreset: @Sendable (Preset) throws -> ResolvedPreset
        public var scan: @Sendable (ScanRequest) async throws -> ScanResult
        public var folderExists: @Sendable (URL) -> Bool
        public var writeAtomically: @Sendable (Data, URL) throws -> Void
        public var writeStandardOutput: @Sendable (String) -> Void
        public var writeStandardError: @Sendable (String) -> Void
        public var applicationVersion: String
        public var engineVersion: String

        public init(
            presets: [Preset] = BuiltInPresets.all,
            resolvePreset: @escaping @Sendable (Preset) throws -> ResolvedPreset = { try PresetResolver().resolve($0) },
            scan: @escaping @Sendable (ScanRequest) async throws -> ScanResult = { request in
                await ScanService().scan(request)
            },
            folderExists: @escaping @Sendable (URL) -> Bool = { url in
                var isDirectory: ObjCBool = false
                return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
            },
            writeAtomically: @escaping @Sendable (Data, URL) throws -> Void = { data, url in
                try data.write(to: url, options: .atomic)
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
            self.scan = scan
            self.folderExists = folderExists
            self.writeAtomically = writeAtomically
            self.writeStandardOutput = writeStandardOutput
            self.writeStandardError = writeStandardError
            self.applicationVersion = applicationVersion
            self.engineVersion = engineVersion
        }
    }

    private enum Command {
        case scan(folder: String, presetID: String, reports: Reports)
        case presets
        case presetShow(identifier: String)
        case version
    }

    private struct Reports {
        var html: String?
        var json: String?
        var checksums: String?

        var urls: [URL] {
            [html, json, checksums].compactMap { $0 }.map { URL(fileURLWithPath: $0) }
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
                    return invalidConfiguration(environment)
                }
                let resolved = try environment.resolvePreset(preset)
                printRequirements(resolved, environment: environment)
                return ExitCode.ready.rawValue
            case .scan(let folder, let presetID, let reports):
                return await runScan(folder: folder, presetID: presetID, reports: reports, environment: environment)
            }
        } catch {
            return invalidConfiguration(environment)
        }
    }

    private func runScan(folder: String, presetID: String, reports: Reports, environment: Environment) async -> Int32 {
        guard let preset = environment.presets.first(where: { $0.identifier == presetID }) else {
            return invalidConfiguration(environment)
        }

        let folderURL = URL(fileURLWithPath: folder, isDirectory: true).standardizedFileURL
        guard environment.folderExists(folderURL) else {
            environment.writeStandardError("Scan could not start: the selected folder is unavailable.")
            return ExitCode.scanCouldNotStart.rawValue
        }

        let resolved: ResolvedPreset
        do {
            resolved = try environment.resolvePreset(preset)
        } catch {
            return invalidConfiguration(environment)
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
        guard let folder = arguments.first, !folder.hasPrefix("--") else { throw RuntimeError.unexpected }
        var presetID = "general-audio"
        var reports = Reports()
        var seen: Set<String> = []
        var index = 1
        while index < arguments.count {
            let option = arguments[index]
            guard ["--preset", "--report-html", "--report-json", "--checksums"].contains(option), !seen.contains(option), index + 1 < arguments.count else {
                throw RuntimeError.unexpected
            }
            let value = arguments[index + 1]
            guard !value.isEmpty, !value.hasPrefix("--") else { throw RuntimeError.unexpected }
            seen.insert(option)
            switch option {
            case "--preset": presetID = value
            case "--report-html": reports.html = value
            case "--report-json": reports.json = value
            case "--checksums": reports.checksums = value
            default: throw RuntimeError.unexpected
            }
            index += 2
        }
        return .scan(folder: folder, presetID: presetID, reports: reports)
    }

    private func printRequirements(_ preset: ResolvedPreset, environment: Environment) {
        environment.writeStandardOutput("Resolved requirements for \(preset.name) (\(preset.identifier)):")
        for requirement in preset.requirements {
            environment.writeStandardOutput("- [\(requirement.severity.rawValue)] \(requirement.description)")
        }
    }

    private func printSummary(_ result: ScanResult, environment: Environment) {
        let errors = result.findings.filter { $0.severity == .error }.count
        let warnings = result.findings.filter { $0.severity == .warning }.count
        environment.writeStandardOutput("Scan summary:")
        environment.writeStandardOutput("Status: \(result.overallStatus.rawValue)")
        environment.writeStandardOutput("Files: \(result.inventory.count)")
        environment.writeStandardOutput("Errors: \(errors)")
        environment.writeStandardOutput("Warnings: \(warnings)")
        for entry in result.inventory {
            environment.writeStandardOutput("- \(entry.relativePath.value)")
        }
        environment.writeStandardOutput("Technical checks only: this is not artistic approval or distributor acceptance.")
    }

    private func writeReports(_ reports: Reports, for result: ScanResult, environment: Environment) throws {
        if let path = reports.html {
            try environment.writeAtomically(Data(HTMLReportWriter().html(for: result).utf8), URL(fileURLWithPath: path))
            environment.writeStandardOutput("HTML report written.")
        }
        if let path = reports.json {
            try environment.writeAtomically(try JSONReportWriter().data(for: result), URL(fileURLWithPath: path))
            environment.writeStandardOutput("JSON report written.")
        }
        if let path = reports.checksums {
            try environment.writeAtomically(Data(ChecksumManifestWriter().text(for: result).utf8), URL(fileURLWithPath: path))
            environment.writeStandardOutput("Checksum manifest written.")
        }
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
        environment.writeStandardError("Invalid command or configuration. Use: audio-preflight scan <folder> [--preset <id>] [--report-html <path>] [--report-json <path>] [--checksums <path>]")
        return ExitCode.invalidCommand.rawValue
    }
}
