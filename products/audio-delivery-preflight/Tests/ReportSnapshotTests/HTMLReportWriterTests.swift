import XCTest
@testable import PreflightCore

final class HTMLReportWriterTests: XCTestCase {
    func testHTMLIsAccessibleEscapedAndPrivate() throws {
        let result = try ReportFixture.result(
            relativePath: "Audio/<script>&\"'é.wav",
            audioProperties: AudioProperties(
                container: "WAV",
                encoding: "Linear PCM",
                channelCount: 2,
                sampleRate: 48_000,
                isReadable: true,
                metadata: ["artist": "Artist & <Alias>"]
            )
        )
        let html = HTMLReportWriter().html(for: result)

        XCTAssertTrue(html.contains("<html lang=\"en\">"))
        XCTAssertTrue(html.contains("<meta charset=\"utf-8\">"))
        XCTAssertTrue(html.contains("<main"))
        XCTAssertTrue(html.contains("Overall status"))
        XCTAssertTrue(html.contains("Needs review"))
        XCTAssertTrue(html.contains("<h2 id=\"findings\">Findings</h2>"))
        XCTAssertTrue(html.contains("<h2 id=\"role-assignments\">Role assignments</h2>"))
        XCTAssertTrue(html.contains("No successful role assignments."))
        XCTAssertTrue(html.contains("<ul"))
        XCTAssertTrue(html.contains("Audio/&lt;script&gt;&amp;&quot;&#39;é.wav"))
        XCTAssertFalse(html.contains("Audio/<script>"))
        XCTAssertFalse(html.contains("/Users/example/private-delivery"))
        XCTAssertTrue(html.contains("technical checks only"))
        XCTAssertTrue(html.contains("artistic quality"))
        XCTAssertTrue(html.contains("Checksum status"))
        XCTAssertTrue(html.contains("succeeded"))
        XCTAssertTrue(html.contains("Measured properties"))
        XCTAssertTrue(html.contains("Encoding: Linear PCM"))
        XCTAssertTrue(html.contains("Metadata artist: Artist &amp; &lt;Alias&gt;"))
        XCTAssertFalse(html.contains("Artist & <Alias>"))
    }

    func testHTMLEscapesAllFiveSpecialCharacters() {
        XCTAssertEqual(HTMLReportWriter.escape("<&>\"'"), "&lt;&amp;&gt;&quot;&#39;")
    }

    func testHTMLDisplaysEscapedAuditableRoleAssignments() throws {
        let assignment = RoleAssignment(
            roleIdentifier: "main",
            roleName: "Main <master>",
            pattern: "(?i)<main>&\\.wav$",
            matchedPath: try RelativePath("Masters/Track.wav"),
            category: .audio,
            acceptedEvidence: [Evidence(label: "encoding", value: .string("Linear PCM"))]
        )

        let html = HTMLReportWriter().html(
            for: try ReportFixture.result(roleAssignments: [assignment])
        )

        XCTAssertTrue(html.contains("Main &lt;master&gt;"))
        XCTAssertTrue(html.contains("(?i)&lt;main&gt;&amp;\\.wav$"))
        XCTAssertTrue(html.contains("Masters/Track.wav"))
        XCTAssertTrue(html.contains("encoding: Linear PCM"))
        XCTAssertFalse(html.contains("Main <master>"))
    }

    func testHTMLSubstitutesUnsafeSelectedFolderDisplayComponentsWithoutLeakingThem() throws {
        let unsafeNames = [
            "/Users/example/html-secret",
            "D:\\Studio\\html-secret",
            "D:html-secret-drive",
            "nested/html-secret",
            "nested\\html-secret",
            "../html-secret-traversal",
            "..\\html-secret-traversal",
        ]

        for unsafeName in unsafeNames {
            let html = HTMLReportWriter().html(for: try ReportFixture.result(selectedFolderName: unsafeName))
            XCTAssertTrue(html.contains("Folder: Selected folder"), unsafeName)
            XCTAssertFalse(html.contains(unsafeName), "The HTML must not leak \(unsafeName)")
            XCTAssertFalse(html.contains(HTMLReportWriter.escape(unsafeName)), "The HTML must not leak an escaped form")
        }
    }
}
