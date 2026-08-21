package preflight

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// These tests protect the release boundary: changing a preset's required roles,
// exposing an absolute source path, or replacing a report must fail a test.
func TestBuiltInPresetsExposeOnlyDocumentedPortableProfiles(t *testing.T) {
	got := Presets()
	if len(got) != 3 {
		t.Fatalf("preset count = %d, want 3", len(got))
	}
	want := []struct{ id, name string }{
		{"general-audio", "General Audio"},
		{"stereo-premaster", "Stereo Premaster"},
		{"digital-release", "Digital Release"},
	}
	for i, expected := range want {
		if got[i].ID != expected.id || got[i].Name != expected.name {
			t.Fatalf("preset[%d] = %#v, want %q / %q", i, got[i], expected.id, expected.name)
		}
	}
	if _, err := PresetByID("custom"); err == nil {
		t.Fatal("custom preset unexpectedly available")
	}
}

func TestPresetCopiesCannotMutateBuiltInRequirements(t *testing.T) {
	first := Presets()
	first[0].Requirements[0] = "mutated"
	second, err := PresetByID("general-audio")
	if err != nil {
		t.Fatal(err)
	}
	if second.Requirements[0] == "mutated" {
		t.Fatal("mutating a returned preset changed the built-in preset")
	}
}

func TestAnalyzeDirectoryAppliesRequiredRolesConservatively(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "main master.wav"), pcmWAV(2, 48_000, 24))

	report, err := AnalyzeDirectory(root, mustPreset(t, "digital-release"))
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != StatusRequirementsNotMet {
		t.Fatalf("status = %q, want %q", report.Status, StatusRequirementsNotMet)
	}
	if !hasFinding(report.Findings, "role.missing.artwork", SeverityError) || !hasFinding(report.Findings, "role.missing.metadata-or-credits", SeverityError) {
		t.Fatalf("required-role findings = %#v", report.Findings)
	}
	if hasFinding(report.Findings, "role.missing.main-master", SeverityError) {
		t.Fatalf("lossless main master was not accepted: %#v", report.Findings)
	}
}

func TestAnalyzeDirectoryRejectsAnUnreadableRequiredPremaster(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "premaster.wav"), []byte("not a WAV file"))

	report, err := AnalyzeDirectory(root, mustPreset(t, "stereo-premaster"))
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != StatusRequirementsNotMet || !hasFinding(report.Findings, "role.unreadable.stereo-premaster", SeverityError) {
		t.Fatalf("unreadable required file produced %#v", report)
	}
}

func TestDigitalReleaseRejectsHeaderOnlyRequiredWAVAndPNG(t *testing.T) {
	cases := []struct {
		name  string
		write func(t *testing.T, root string)
		id    string
	}{
		{
			name: "WAV payload missing", id: "role.unreadable.main-master",
			write: func(t *testing.T, root string) {
				writeScanFile(t, filepath.Join(root, "main master.wav"), readablePCM(2, 48_000, 24)[:44])
				writeScanFile(t, filepath.Join(root, "cover.png"), squarePNG(t, 3000))
				writeScanFile(t, filepath.Join(root, "credits.txt"), []byte("credits"))
			},
		},
		{
			name: "PNG payload missing", id: "role.unreadable.artwork",
			write: func(t *testing.T, root string) {
				writeScanFile(t, filepath.Join(root, "main master.wav"), readablePCM(2, 48_000, 24))
				writeScanFile(t, filepath.Join(root, "cover.png"), squarePNG(t, 3000)[:33])
				writeScanFile(t, filepath.Join(root, "credits.txt"), []byte("credits"))
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			tc.write(t, root)
			report, err := AnalyzeDirectory(root, mustPreset(t, "digital-release"))
			if err != nil {
				t.Fatal(err)
			}
			if report.Status != StatusRequirementsNotMet || !hasFinding(report.Findings, tc.id, SeverityError) {
				t.Fatalf("header-only required media produced %#v", report)
			}
		})
	}
}

func TestAmbiguousRequiredCandidatesStillValidateEveryCandidate(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "main master.wav"), readablePCM(2, 48_000, 24))
	writeScanFile(t, filepath.Join(root, "bad master.wav"), []byte("not a WAV file"))
	writeScanFile(t, filepath.Join(root, "cover.png"), squarePNG(t, 3000))
	writeScanFile(t, filepath.Join(root, "credits.txt"), []byte("credits"))

	report, err := AnalyzeDirectory(root, mustPreset(t, "digital-release"))
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != StatusRequirementsNotMet || !hasFinding(report.Findings, "role.ambiguous.main-master", SeverityWarning) || !hasFinding(report.Findings, "role.unreadable.main-master", SeverityError) {
		t.Fatalf("ambiguous candidates were not all validated: %#v", report.Findings)
	}
}

func TestStereoPremasterIgnoresUnrelatedAudioOutsideItsEligibleExtensions(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "premaster.wav"), readablePCM(2, 48_000, 24))
	writeScanFile(t, filepath.Join(root, "reference.mp3"), []byte("not an MP3"))

	report, err := AnalyzeDirectory(root, mustPreset(t, "stereo-premaster"))
	if err != nil {
		t.Fatal(err)
	}
	if hasFinding(report.Findings, "role.unreadable.stereo-premaster", SeverityError) || hasFinding(report.Findings, "role.disallowed-encoding.stereo-premaster", SeverityError) {
		t.Fatalf("unrelated audio became a required premaster candidate: %#v", report.Findings)
	}
}

func TestGeneralAudioWarnsOnMixedInspectableBitDepth(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "one.wav"), readablePCM(2, 48_000, 16))
	writeScanFile(t, filepath.Join(root, "two.wav"), readablePCM(2, 48_000, 24))
	report, err := AnalyzeDirectory(root, mustPreset(t, "general-audio"))
	if err != nil {
		t.Fatal(err)
	}
	if report.Status != StatusWarnings || !hasFinding(report.Findings, "audio.mixed-bit-depth", SeverityWarning) {
		t.Fatalf("mixed bit depth was not reported: %#v", report)
	}
}

func TestAIFCContainerDoesNotTriggerFilenameContentMismatch(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "main.aifc"), aifcPCM())
	report, err := AnalyzeDirectory(root, mustPreset(t, "general-audio"))
	if err != nil {
		t.Fatal(err)
	}
	if hasFinding(report.Findings, "audio.filename-content-mismatch", SeverityWarning) {
		t.Fatalf("AIFC container was treated as AIFF: %#v", report.Findings)
	}
}

func TestReportsAreStableEscapedAndDoNotExposeSourceRoot(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "<unsafe>&.wav"), pcmWAV(2, 48_000, 24))
	report, err := AnalyzeDirectory(root, mustPreset(t, "general-audio"))
	if err != nil {
		t.Fatal(err)
	}

	first, err := JSONReport(report)
	if err != nil {
		t.Fatal(err)
	}
	second, err := JSONReport(report)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("JSON report bytes changed for the same scan")
	}
	var decoded map[string]any
	if err := json.Unmarshal(first, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["schema_version"] != "1.0" {
		t.Fatalf("schema version = %#v", decoded["schema_version"])
	}
	if bytes.Contains(first, []byte(root)) {
		t.Fatalf("JSON report leaks source root %q", root)
	}
	html := HTMLReport(report)
	if !strings.Contains(html, "<main>") || !strings.Contains(html, "aria-labelledby") || !strings.Contains(html, "&lt;unsafe&gt;&amp;.wav") {
		t.Fatalf("HTML report is not accessible and escaped: %s", html)
	}
	if strings.Contains(html, root) {
		t.Fatalf("HTML report leaks source root %q", root)
	}
	for _, want := range []string{"Resolved requirements", "Role assignments", "Media evidence", "Schema version", "Started", "Completed", "unavailable", "Source target"} {
		if !strings.Contains(html, want) {
			t.Fatalf("HTML report omits audit section %q: %s", want, html)
		}
	}
}

func TestChecksumManifestUsesOnlyRegularFilesInPortableOrder(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "z.wav"), pcmWAV(2, 48_000, 24))
	writeScanFile(t, filepath.Join(root, "a.txt"), []byte("notes"))
	if runtime.GOOS != "windows" {
		if err := os.Symlink("z.wav", filepath.Join(root, "linked.wav")); err != nil {
			t.Fatal(err)
		}
	}
	report, err := AnalyzeDirectory(root, mustPreset(t, "general-audio"))
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := ChecksumManifest(report)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(manifest, "\n"), "\n")
	if len(lines) != 2 || !strings.HasSuffix(lines[0], "  a.txt") || !strings.HasSuffix(lines[1], "  z.wav") {
		t.Fatalf("manifest = %q", manifest)
	}
}

func TestWriteReportsRequiresDistinctNewDestinationsWithoutSymlinkParents(t *testing.T) {
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "main.wav"), pcmWAV(2, 48_000, 24))
	report, err := AnalyzeDirectory(root, mustPreset(t, "general-audio"))
	if err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(t.TempDir(), "report.json")
	if err := os.WriteFile(destination, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := WriteReports(report, ReportDestinations{JSON: destination}); err == nil {
		t.Fatal("existing report destination was accepted")
	}
	if got, err := os.ReadFile(destination); err != nil || string(got) != "keep" {
		t.Fatalf("existing report changed: %q, %v", got, err)
	}

	shared := filepath.Join(t.TempDir(), "new-report")
	if err := WriteReports(report, ReportDestinations{JSON: shared, HTML: shared}); err == nil {
		t.Fatal("duplicate report destinations were accepted")
	}
	if runtime.GOOS != "windows" {
		realParent := t.TempDir()
		linkParent := filepath.Join(t.TempDir(), "linked-parent")
		if err := os.Symlink(realParent, linkParent); err != nil {
			t.Fatal(err)
		}
		if err := WriteReports(report, ReportDestinations{JSON: filepath.Join(linkParent, "report.json")}); err == nil {
			t.Fatal("destination below a symlink parent was accepted")
		}
	}
}

func mustPreset(t *testing.T, id string) Preset {
	t.Helper()
	preset, err := PresetByID(id)
	if err != nil {
		t.Fatal(err)
	}
	return preset
}

func hasFinding(findings []Finding, id string, severity Severity) bool {
	for _, finding := range findings {
		if finding.ID == id && finding.Severity == severity {
			return true
		}
	}
	return false
}

func writeScanFile(t *testing.T, path string, contents []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		t.Fatal(err)
	}
}

func pcmWAV(channels, sampleRate, bits int) []byte {
	buf := make([]byte, 44)
	copy(buf[0:4], "RIFF")
	binary.LittleEndian.PutUint32(buf[4:8], 36)
	copy(buf[8:12], "WAVE")
	copy(buf[12:16], "fmt ")
	binary.LittleEndian.PutUint32(buf[16:20], 16)
	binary.LittleEndian.PutUint16(buf[20:22], 1)
	binary.LittleEndian.PutUint16(buf[22:24], uint16(channels))
	binary.LittleEndian.PutUint32(buf[24:28], uint32(sampleRate))
	byteRate := sampleRate * channels * bits / 8
	binary.LittleEndian.PutUint32(buf[28:32], uint32(byteRate))
	binary.LittleEndian.PutUint16(buf[32:34], uint16(channels*bits/8))
	binary.LittleEndian.PutUint16(buf[34:36], uint16(bits))
	copy(buf[36:40], "data")
	return buf
}

func readablePCM(channels, sampleRate, bits int) []byte {
	buf := make([]byte, 44+channels*bits/8)
	copy(buf[0:4], "RIFF")
	binary.LittleEndian.PutUint32(buf[4:8], uint32(len(buf)-8))
	copy(buf[8:12], "WAVE")
	copy(buf[12:16], "fmt ")
	binary.LittleEndian.PutUint32(buf[16:20], 16)
	binary.LittleEndian.PutUint16(buf[20:22], 1)
	binary.LittleEndian.PutUint16(buf[22:24], uint16(channels))
	binary.LittleEndian.PutUint32(buf[24:28], uint32(sampleRate))
	byteRate := sampleRate * channels * bits / 8
	binary.LittleEndian.PutUint32(buf[28:32], uint32(byteRate))
	binary.LittleEndian.PutUint16(buf[32:34], uint16(channels*bits/8))
	binary.LittleEndian.PutUint16(buf[34:36], uint16(bits))
	copy(buf[36:40], "data")
	binary.LittleEndian.PutUint32(buf[40:44], uint32(len(buf)-44))
	return buf
}

func squarePNG(t *testing.T, side int) []byte {
	t.Helper()
	image := image.NewGray(image.Rect(0, 0, side, side))
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

func aifcPCM() []byte {
	comm := make([]byte, 22)
	binary.BigEndian.PutUint16(comm[0:2], 2)
	binary.BigEndian.PutUint32(comm[2:6], 1)
	binary.BigEndian.PutUint16(comm[6:8], 24)
	copy(comm[8:18], []byte{0x40, 0x0e, 0xac, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00})
	copy(comm[18:22], "NONE")
	ssnd := make([]byte, 14)
	copy(ssnd, "SSND")
	binary.BigEndian.PutUint32(ssnd[4:8], 6)
	return append(append([]byte("FORM\x00\x00\x00\x00AIFCCOMM\x00\x00\x00\x16"), comm...), ssnd...)
}
