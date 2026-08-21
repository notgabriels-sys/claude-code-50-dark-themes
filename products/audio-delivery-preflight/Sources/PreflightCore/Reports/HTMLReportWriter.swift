import Foundation

/// Creates a self-contained, accessible HTML report without exporting source-root paths.
public struct HTMLReportWriter: Sendable {
    public init() {}

    public func html(for result: ScanResult) -> String {
        let escape = Self.escape
        let selectedFolderName = ReportDisplayName.safeComponent(result.selectedFolderName) ?? "Selected folder"
        let requirements = result.preset.requirements.map { requirement in
            "<li><strong>\(escape(requirement.severity.rawValue.capitalized)):</strong> \(escape(requirement.description))</li>"
        }.joined()
        let inventory = result.inventory.map { entry in
            "<tr><td>\(escape(entry.relativePath.value))</td><td>\(escape(entry.category.rawValue))</td><td>\(escape(entry.kind.rawValue))</td><td>\(escape(entry.sha256 ?? "Unknown"))</td></tr>"
        }.joined()
        let findings = result.findings.map { finding in
            let paths = finding.affectedPaths.map(\.value).map(escape).joined(separator: ", ")
            let evidence = finding.evidence.map { "\(escape($0.label)): \(escape(evidenceText($0.value)))" }.joined(separator: "; ")
            return "<article class=\"finding \(escape(finding.severity.rawValue))\"><h3>\(escape(finding.title))</h3><p><span class=\"severity\">Severity: \(escape(finding.severity.rawValue.capitalized))</span></p><p>\(escape(finding.explanation))</p><ul><li><strong>Rule:</strong> \(escape(finding.ruleID))</li><li><strong>Affected paths:</strong> \(paths.isEmpty ? "None" : paths)</li><li><strong>Evidence:</strong> \(evidence.isEmpty ? "None" : evidence)</li><li><strong>Expected:</strong> \(escape(finding.expected))</li><li><strong>Suggested action:</strong> \(escape(finding.suggestedAction))</li></ul></article>"
        }.joined()

        return """
        <!doctype html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Audio Delivery Preflight Report</title>
        <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;margin:2rem;max-width:72rem;color:#1b1b1b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #767676;padding:.5rem;text-align:left;vertical-align:top}.severity{font-weight:700}.error{border-left:4px solid #a12622;padding-left:1rem}.warning{border-left:4px solid #8a5a00;padding-left:1rem}.information,.pass{border-left:4px solid #245a8d;padding-left:1rem}footer{margin-top:2rem;border-top:1px solid #767676;padding-top:1rem}</style>
        </head>
        <body>
        <header><h1>Audio Delivery Preflight Report</h1><p>Folder: \(escape(selectedFolderName))</p></header>
        <main>
        <section aria-labelledby="summary"><h2 id="summary">Summary</h2><table><tbody><tr><th scope="row">Overall status</th><td><strong>\(escape(statusText(result.overallStatus)))</strong></td></tr><tr><th scope="row">Preset</th><td>\(escape(result.preset.name))</td></tr><tr><th scope="row">Engine version</th><td>\(escape(result.engineVersion))</td></tr><tr><th scope="row">Scan started</th><td>\(escape(dateText(result.startedAt)))</td></tr><tr><th scope="row">Scan completed</th><td>\(escape(result.completedAt.map { dateText($0) } ?? "Not completed"))</td></tr></tbody></table></section>
        <section aria-labelledby="requirements"><h2 id="requirements">Resolved requirements</h2><ul>\(requirements)</ul></section>
        <section aria-labelledby="inventory"><h2 id="inventory">Inventory</h2><table><thead><tr><th>Relative path</th><th>Category</th><th>Kind</th><th>SHA-256</th></tr></thead><tbody>\(inventory)</tbody></table></section>
        <section aria-labelledby="findings"><h2 id="findings">Findings</h2>\(findings.isEmpty ? "<p>No findings.</p>" : findings)</section>
        </main>
        <footer><p>Source files were not intentionally modified by this scan. This report contains technical checks only; it does not assess artistic quality, replace professional listening, or guarantee distributor acceptance.</p></footer>
        </body>
        </html>
        """
    }

    public static func escape(_ value: String) -> String {
        value.reduce(into: "") { output, character in
            switch character {
            case "&": output += "&amp;"
            case "<": output += "&lt;"
            case ">": output += "&gt;"
            case "\"": output += "&quot;"
            case "'": output += "&#39;"
            default: output.append(character)
            }
        }
    }

    private func statusText(_ status: OverallStatus) -> String {
        switch status { case .ready: "Ready"; case .needsReview: "Needs review"; case .requirementsNotMet: "Requirements not met"; case .incomplete: "Incomplete" }
    }

    private func evidenceText(_ value: EvidenceValue) -> String {
        switch value { case .string(let value): value; case .number(let value): String(value); case .integer(let value): String(value); case .boolean(let value): String(value); case .unknown: "Unknown" }
    }

    private func dateText(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
