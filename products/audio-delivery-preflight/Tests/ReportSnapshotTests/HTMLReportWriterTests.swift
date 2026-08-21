import XCTest
@testable import PreflightCore

final class HTMLReportWriterTests: XCTestCase {
    func testHTMLIsAccessibleEscapedAndPrivate() throws {
        let result = try ReportFixture.result(relativePath: "Audio/<script>&\"'é.wav")
        let html = HTMLReportWriter().html(for: result)

        XCTAssertTrue(html.contains("<html lang=\"en\">"))
        XCTAssertTrue(html.contains("<meta charset=\"utf-8\">"))
        XCTAssertTrue(html.contains("<main"))
        XCTAssertTrue(html.contains("Overall status"))
        XCTAssertTrue(html.contains("Needs review"))
        XCTAssertTrue(html.contains("<h2 id=\"findings\">Findings</h2>"))
        XCTAssertTrue(html.contains("<ul"))
        XCTAssertTrue(html.contains("Audio/&lt;script&gt;&amp;&quot;&#39;é.wav"))
        XCTAssertFalse(html.contains("Audio/<script>"))
        XCTAssertFalse(html.contains("/Users/example/private-delivery"))
        XCTAssertTrue(html.contains("technical checks only"))
        XCTAssertTrue(html.contains("artistic quality"))
    }

    func testHTMLEscapesAllFiveSpecialCharacters() {
        XCTAssertEqual(HTMLReportWriter.escape("<&>\"'"), "&lt;&amp;&gt;&quot;&#39;")
    }
}
