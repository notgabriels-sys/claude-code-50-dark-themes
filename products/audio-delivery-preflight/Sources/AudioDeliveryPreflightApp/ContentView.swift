import SwiftUI
import PreflightCore

struct ContentView: View {
    @State private var model = AppModel()

    var body: some View {
        Group {
            switch model.phase {
            case .start:
                StartView(model: model)
            case .requirements:
                RequirementsView(model: model)
            case .scanning:
                ScanningView(model: model)
            case .results:
                ResultsView(model: model)
            case .export:
                ExportView(model: model)
            }
        }
        .animation(.default, value: model.phase)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

func statusText(_ status: OverallStatus) -> String {
    switch status {
    case .ready: "Ready"
    case .needsReview: "Needs review"
    case .requirementsNotMet: "Requirements not met"
    case .incomplete: "Incomplete"
    }
}

func statusSymbol(_ status: OverallStatus) -> String {
    switch status {
    case .ready: "checkmark.circle.fill"
    case .needsReview: "exclamationmark.circle.fill"
    case .requirementsNotMet: "xmark.octagon.fill"
    case .incomplete: "pause.circle.fill"
    }
}

func severityText(_ severity: FindingSeverity) -> String {
    switch severity {
    case .error: "Error"
    case .warning: "Warning"
    case .information: "Information"
    case .pass: "Pass"
    }
}

func severitySymbol(_ severity: FindingSeverity) -> String {
    switch severity {
    case .error: "xmark.octagon.fill"
    case .warning: "exclamationmark.triangle.fill"
    case .information: "info.circle.fill"
    case .pass: "checkmark.circle.fill"
    }
}

func evidenceText(_ value: EvidenceValue) -> String {
    switch value {
    case let .string(value): value
    case let .number(value): value.formatted()
    case let .integer(value): String(value)
    case let .boolean(value): value ? "Yes" : "No"
    case .unknown: "Unknown"
    }
}
