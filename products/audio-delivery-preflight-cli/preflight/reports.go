package preflight

import (
	"encoding/json"
	"fmt"
	"html"
	"sort"
	"strings"
)

// JSONReport serializes a report using a stable v1 schema and never includes a
// selected absolute source path.
func JSONReport(report Report) ([]byte, error) {
	if report.SchemaVersion != SchemaVersion || !safeDisplayComponent(report.FolderName) {
		return nil, fmt.Errorf("cannot export an unsafe report")
	}
	copy := report
	copy.Findings = append([]Finding(nil), report.Findings...)
	copy.RoleAssignments = append([]RoleAssignment(nil), report.RoleAssignments...)
	sortFindings(copy.Findings)
	sort.Slice(copy.RoleAssignments, func(i, j int) bool { return copy.RoleAssignments[i].ID < copy.RoleAssignments[j].ID })
	data, err := json.MarshalIndent(copy, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode JSON report: %w", err)
	}
	return append(data, '\n'), nil
}

// HTMLReport makes one self-contained document with semantic landmarks, textual
// severity labels, and escaped dynamic content.
func HTMLReport(report Report) string {
	var findings strings.Builder
	for _, finding := range report.Findings {
		fmt.Fprintf(&findings, `<article class="finding %s"><h3>%s</h3><p><strong>Severity:</strong> %s</p><p>%s</p><dl><dt>Rule</dt><dd>%s</dd><dt>Affected paths</dt><dd>%s</dd><dt>Expected</dt><dd>%s</dd><dt>Suggested action</dt><dd>%s</dd></dl></article>`, html.EscapeString(string(finding.Severity)), html.EscapeString(finding.Title), html.EscapeString(string(finding.Severity)), html.EscapeString(finding.Explanation), html.EscapeString(finding.ID), html.EscapeString(pathsText(finding.Paths)), html.EscapeString(finding.Expected), html.EscapeString(finding.SuggestedAction))
	}
	if findings.Len() == 0 {
		findings.WriteString("<p>No technical findings.</p>")
	}
	var inventory strings.Builder
	for _, entry := range report.Inventory.Entries {
		fmt.Fprintf(&inventory, "<tr><td>%s</td><td>%s</td><td>%s</td><td>%d</td><td>%s</td></tr>", html.EscapeString(entry.Path), html.EscapeString(string(entry.Kind)), html.EscapeString(string(entry.ServiceClass)), entry.Size, html.EscapeString(entry.SHA256))
	}
	if inventory.Len() == 0 {
		inventory.WriteString("<tr><td colspan=\"5\">No inventory entries.</td></tr>")
	}
	return fmt.Sprintf(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Audio Delivery Preflight Report</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:2rem;max-width:72rem;color:#171717}table{border-collapse:collapse;width:100%%}th,td{border:1px solid #666;padding:.5rem;text-align:left;vertical-align:top}.finding{border-left:4px solid #1d4ed8;padding-left:1rem;margin:1rem 0}.finding.warning{border-color:#9a6700}.finding.error{border-color:#b42318}dt{font-weight:700}dd{margin:0 0 .6rem}</style></head><body><header><h1>Audio Delivery Preflight Report</h1><p>Folder: %s</p></header><main><section aria-labelledby="summary"><h2 id="summary">Summary</h2><dl><dt>Status</dt><dd>%s</dd><dt>Preset</dt><dd>%s</dd><dt>Engine version</dt><dd>%s</dd></dl></section><section aria-labelledby="findings"><h2 id="findings">Findings</h2>%s</section><section aria-labelledby="inventory"><h2 id="inventory">Inventory</h2><table><thead><tr><th>Relative path</th><th>Kind</th><th>Class</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>%s</tbody></table></section></main><footer><p>Source files were not intentionally modified by this scan. This report contains technical checks only; it does not assess artistic quality, replace professional listening, or guarantee distributor acceptance.</p></footer></body></html>`, html.EscapeString(report.FolderName), html.EscapeString(string(report.Status)), html.EscapeString(report.Preset.Name), html.EscapeString(report.EngineVersion), findings.String(), inventory.String())
}

// ChecksumManifest returns stable portable SHA-256 lines for regular files only.
func ChecksumManifest(report Report) (string, error) {
	entries := make([]Entry, 0)
	for _, entry := range report.Inventory.Entries {
		if entry.Kind == EntryFile {
			if len(entry.SHA256) != 64 || !safeManifestPath(entry.Path) {
				return "", fmt.Errorf("inventory entry cannot be represented in checksum manifest")
			}
			entries = append(entries, entry)
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	var output strings.Builder
	for _, entry := range entries {
		fmt.Fprintf(&output, "%s  %s\n", strings.ToLower(entry.SHA256), entry.Path)
	}
	return output.String(), nil
}

type ReportDestinations struct {
	HTML      string
	JSON      string
	Checksums string
}

// WriteReports writes only explicit, distinct, previously absent paths. The
// platform implementation opens each parent without following symbolic links.
func WriteReports(report Report, destinations ReportDestinations) error {
	values := []struct {
		path string
		data func() ([]byte, error)
	}{
		{destinations.HTML, func() ([]byte, error) { return []byte(HTMLReport(report)), nil }},
		{destinations.JSON, func() ([]byte, error) { return JSONReport(report) }},
		{destinations.Checksums, func() ([]byte, error) { text, err := ChecksumManifest(report); return []byte(text), err }},
	}
	seen := make(map[string]bool)
	selected := make([]struct {
		path string
		data []byte
	}, 0, 3)
	for _, value := range values {
		if value.path == "" {
			continue
		}
		clean, err := canonicalReportDestination(value.path)
		if err != nil {
			return err
		}
		if seen[clean] {
			return fmt.Errorf("report destinations must be distinct")
		}
		seen[clean] = true
		data, err := value.data()
		if err != nil {
			return err
		}
		selected = append(selected, struct {
			path string
			data []byte
		}{clean, data})
	}
	for _, value := range selected {
		if err := reportDestinationAbsent(value.path); err != nil {
			return err
		}
	}
	for _, value := range selected {
		if err := writeNewReport(value.path, value.data); err != nil {
			return err
		}
	}
	return nil
}

func pathsText(paths []string) string {
	if len(paths) == 0 {
		return "None"
	}
	return strings.Join(paths, ", ")
}

func safeManifestPath(path string) bool {
	return path != "" && !strings.HasPrefix(path, "/") && !strings.ContainsAny(path, "\\\x00\r\n") && !strings.Contains(path, "../") && path != ".."
}
