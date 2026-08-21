package preflight

import (
	"encoding/json"
	"fmt"
	"html"
	"sort"
	"strings"
	"time"
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
	var requirements strings.Builder
	for _, requirement := range report.Preset.Requirements {
		fmt.Fprintf(&requirements, "<li>%s</li>", html.EscapeString(requirement))
	}
	if requirements.Len() == 0 {
		requirements.WriteString("<li>No resolved requirements.</li>")
	}
	var assignments strings.Builder
	for _, assignment := range report.RoleAssignments {
		fmt.Fprintf(&assignments, "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>", html.EscapeString(assignment.ID), html.EscapeString(assignment.Name), html.EscapeString(assignment.Path), html.EscapeString(assignment.Evidence))
	}
	if assignments.Len() == 0 {
		assignments.WriteString("<tr><td colspan=\"4\">No role assignments.</td></tr>")
	}
	var findings strings.Builder
	for _, finding := range report.Findings {
		fmt.Fprintf(&findings, `<article class="finding %s"><h3>%s</h3><p><strong>Severity:</strong> %s</p><p>%s</p><dl><dt>Rule</dt><dd>%s</dd><dt>Affected paths</dt><dd>%s</dd><dt>Expected</dt><dd>%s</dd><dt>Suggested action</dt><dd>%s</dd></dl></article>`, html.EscapeString(string(finding.Severity)), html.EscapeString(finding.Title), html.EscapeString(string(finding.Severity)), html.EscapeString(finding.Explanation), html.EscapeString(finding.ID), html.EscapeString(pathsText(finding.Paths)), html.EscapeString(finding.Expected), html.EscapeString(finding.SuggestedAction))
	}
	if findings.Len() == 0 {
		findings.WriteString("<p>No technical findings.</p>")
	}
	var inventory strings.Builder
	for _, entry := range report.Inventory.Entries {
		fmt.Fprintf(&inventory, "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%d</td><td>%s</td></tr>", html.EscapeString(entry.Path), html.EscapeString(string(entry.Kind)), html.EscapeString(string(entry.ServiceClass)), html.EscapeString(entry.LinkTarget), html.EscapeString(mediaEvidenceText(entry.Media)), html.EscapeString(mediaUnavailableText(entry.Media)), entry.Size, html.EscapeString(entry.SHA256))
	}
	if inventory.Len() == 0 {
		inventory.WriteString("<tr><td colspan=\"8\">No inventory entries.</td></tr>")
	}
	return fmt.Sprintf(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Audio Delivery Preflight Report</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:2rem;max-width:72rem;color:#171717}table{border-collapse:collapse;width:100%%}th,td{border:1px solid #666;padding:.5rem;text-align:left;vertical-align:top}.finding{border-left:4px solid #1d4ed8;padding-left:1rem;margin:1rem 0}.finding.warning{border-color:#9a6700}.finding.error{border-color:#b42318}dt{font-weight:700}dd{margin:0 0 .6rem}</style></head><body><header><h1>Audio Delivery Preflight Report</h1><p>Folder: %s</p></header><main><section aria-labelledby="summary"><h2 id="summary">Summary</h2><dl><dt>Status</dt><dd>%s</dd><dt>Preset</dt><dd>%s</dd><dt>Schema version</dt><dd>%s</dd><dt>Engine version</dt><dd>%s</dd><dt>Started</dt><dd>%s</dd><dt>Completed</dt><dd>%s</dd></dl></section><section aria-labelledby="requirements"><h2 id="requirements">Resolved requirements</h2><ul>%s</ul></section><section aria-labelledby="assignments"><h2 id="assignments">Role assignments</h2><table><thead><tr><th>Role identifier</th><th>Role name</th><th>Relative path</th><th>Accepted evidence</th></tr></thead><tbody>%s</tbody></table></section><section aria-labelledby="findings"><h2 id="findings">Findings</h2>%s</section><section aria-labelledby="inventory"><h2 id="inventory">Inventory</h2><table><thead><tr><th>Relative path</th><th>Kind</th><th>Class</th><th>Source target</th><th>Media evidence</th><th>Unavailable reason</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>%s</tbody></table></section></main><footer><p>Source files were not intentionally modified by this scan. This report contains technical checks only; it does not assess artistic quality, replace professional listening, or guarantee distributor acceptance.</p></footer></body></html>`, html.EscapeString(report.FolderName), html.EscapeString(string(report.Status)), html.EscapeString(report.Preset.Name), html.EscapeString(report.SchemaVersion), html.EscapeString(report.EngineVersion), html.EscapeString(report.StartedAt.UTC().Format(time.RFC3339Nano)), html.EscapeString(report.CompletedAt.UTC().Format(time.RFC3339Nano)), requirements.String(), assignments.String(), findings.String(), inventory.String())
}

func mediaEvidenceText(media *MediaEvidence) string {
	if media == nil {
		return "No media evidence."
	}
	values := []string{"Supported: " + boolText(media.Supported), "Readable: " + measurementBoolText(media.Readable)}
	appendMeasurement := func(label string, value string, available bool) {
		if available {
			values = append(values, label+": "+value)
		}
	}
	appendMeasurement("Format", media.Format, media.Format != "")
	appendMeasurement("Container", media.Container, media.Container != "")
	appendMeasurement("Encoding", media.Encoding.Value, media.Encoding.Available)
	appendMeasurement("Channels", fmt.Sprintf("%d", media.Channels.Value), media.Channels.Available)
	appendMeasurement("Sample rate", fmt.Sprintf("%d Hz", media.SampleRate.Value), media.SampleRate.Available)
	appendMeasurement("Bit depth", fmt.Sprintf("%d", media.BitDepth.Value), media.BitDepth.Available)
	appendMeasurement("Duration", fmt.Sprintf("%g seconds", media.Duration.Value), media.Duration.Available)
	appendMeasurement("Width", fmt.Sprintf("%d px", media.Width.Value), media.Width.Available)
	appendMeasurement("Height", fmt.Sprintf("%d px", media.Height.Value), media.Height.Available)
	appendMeasurement("Aspect ratio", fmt.Sprintf("%g", media.AspectRatio.Value), media.AspectRatio.Available)
	appendMeasurement("Alpha", boolText(media.HasAlpha.Value), media.HasAlpha.Available)
	appendMeasurement("Color model", media.ColorModel.Value, media.ColorModel.Available)
	return strings.Join(values, "; ")
}

func mediaUnavailableText(media *MediaEvidence) string {
	if media == nil || media.Unavailable == "" {
		return "None"
	}
	return media.Unavailable
}

func boolText(value bool) string {
	if value {
		return "Yes"
	}
	return "No"
}

func measurementBoolText(value Measurement[bool]) string {
	if !value.Available {
		return "Unavailable"
	}
	return boolText(value.Value)
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

// WriteReports is a convenience wrapper for callers that do not need to keep a
// prepared transaction across another operation. CLI scans use preparation
// before root access so deterministic destination errors remain configuration
// errors.
func WriteReports(report Report, destinations ReportDestinations) error {
	prepared, err := PrepareReportDestinations("", destinations)
	if err != nil {
		return err
	}
	defer prepared.Close()
	return prepared.Write(report)
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
