import SwiftUI
import UniformTypeIdentifiers
import PreflightCore

struct StartView: View {
    let model: AppModel
    @State private var showingFolderImporter = false
    @State private var isDropTargeted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Audio Delivery Preflight")
                    .font(.largeTitle.bold())
                Text("Review the technical completeness and consistency of one delivery folder before it leaves this Mac.")
                    .foregroundStyle(.secondary)
                Text("Processed locally. Nothing is uploaded.")
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("local-processing-statement")
            }

            Picker("Preset", selection: Binding(
                get: { model.selectedPresetID },
                set: { model.choosePreset($0) }
            )) {
                ForEach(model.availablePresets, id: \.identifier) { preset in
                    Text(preset.name).tag(preset.identifier)
                }
            }
            .accessibilityLabel("Delivery preset")
            .accessibilityIdentifier("preset-selector")

            if model.isCustomPresetSelected {
                CustomPresetEditorView(model: model)
            }

            Button {
                showingFolderImporter = true
            } label: {
                Label("Choose Folder", systemImage: "folder.badge.plus")
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("choose-folder-button")
            .fileImporter(
                isPresented: $showingFolderImporter,
                allowedContentTypes: [.folder],
                allowsMultipleSelection: false
            ) { result in
                guard case let .success(urls) = result, let url = urls.first else { return }
                _ = model.selectFolder(url)
            }

            VStack(spacing: 10) {
                Image(systemName: "arrow.down.doc")
                    .font(.system(size: 34))
                Text("Drop one delivery folder here")
                    .font(.headline)
                Text("Selecting a folder displays requirements first. It never starts a scan automatically.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 180)
            .padding()
            .background(isDropTargeted ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(isDropTargeted ? Color.accentColor : .secondary.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [7]))
            }
            .onDrop(of: [UTType.fileURL.identifier], isTargeted: $isDropTargeted) { providers in
                guard let provider = providers.first else { return false }
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    guard let url = DroppedFolderURLDecoder.decode(item) else { return }
                    Task { @MainActor in _ = model.acceptDroppedFolder(url) }
                }
                return true
            }
            .accessibilityLabel("Delivery folder drop zone")
            .accessibilityIdentifier("delivery-folder-drop-zone")

            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("start-error-message")
            }

            }
            .frame(maxWidth: 760, alignment: .leading)
        }
        .accessibilityIdentifier("start-view")
    }
}

enum DroppedFolderURLDecoder {
    static func decode(_ item: NSSecureCoding?) -> URL? {
        if let url = item as? NSURL {
            let decoded = url as URL
            return decoded.isFileURL ? decoded : nil
        }
        if let data = item as? NSData,
           let decoded = URL(dataRepresentation: data as Data, relativeTo: nil),
           decoded.isFileURL
        {
            return decoded
        }
        return nil
    }
}
