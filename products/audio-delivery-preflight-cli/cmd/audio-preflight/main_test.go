package main

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// These command-boundary tests fail if a documented command is removed, a scan
// status maps to the wrong exit code, or an export is allowed to overwrite data.
func TestRunListsAndShowsOnlyBuiltInPresets(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := run([]string{"presets"}, &stdout, &stderr); code != exitReady {
		t.Fatalf("presets exit = %d, stderr = %s", code, stderr.String())
	}
	if got := stdout.String(); !strings.Contains(got, "general-audio") || !strings.Contains(got, "stereo-premaster") || !strings.Contains(got, "digital-release") || strings.Contains(got, "custom") {
		t.Fatalf("presets output = %q", got)
	}
	stdout.Reset()
	if code := run([]string{"preset", "show", "digital-release"}, &stdout, &stderr); code != exitReady || !strings.Contains(stdout.String(), "Digital Release") {
		t.Fatalf("preset show exit/output = %d / %q", code, stdout.String())
	}
}

func TestRunMapsCompletedScanStatusesToDocumentedExitCodes(t *testing.T) {
	ready := t.TempDir()
	writeCLIFile(t, filepath.Join(ready, "main.wav"), cliWAV())
	warning := t.TempDir()
	writeCLIFile(t, filepath.Join(warning, "master v2.wav"), cliWAV())
	errorRoot := t.TempDir()
	writeCLIFile(t, filepath.Join(errorRoot, "main master.wav"), cliWAV())
	cases := []struct {
		name string
		args []string
		want int
	}{
		{"ready", []string{"scan", ready}, exitReady},
		{"warnings", []string{"scan", warning}, exitWarnings},
		{"requirements not met", []string{"scan", errorRoot, "--preset", "digital-release"}, exitRequirementsNotMet},
		{"invalid command", []string{"scan"}, exitInvalidConfiguration},
		{"scan cannot start", []string{"scan", filepath.Join(t.TempDir(), "missing")}, exitScanStartFailure},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if got := run(tc.args, &stdout, &stderr); got != tc.want {
				t.Fatalf("run(%q) = %d, want %d; stdout=%q stderr=%q", tc.args, got, tc.want, stdout.String(), stderr.String())
			}
		})
	}
}

func TestRunExportsOnlyNewDistinctDestinations(t *testing.T) {
	root := t.TempDir()
	writeCLIFile(t, filepath.Join(root, "main.wav"), cliWAV())
	exports, err := os.MkdirTemp("/private/tmp", "audio-preflight-cli-reports-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(exports) })
	jsonPath := filepath.Join(exports, "report.json")
	htmlPath := filepath.Join(exports, "report.html")
	checksumPath := filepath.Join(exports, "SHA256SUMS.txt")
	var stdout, stderr bytes.Buffer
	if code := run([]string{"scan", root, "--report-json", jsonPath, "--report-html", htmlPath, "--checksums", checksumPath}, &stdout, &stderr); code != exitReady {
		t.Fatalf("export scan exit = %d, stderr = %s", code, stderr.String())
	}
	for _, path := range []string{jsonPath, htmlPath, checksumPath} {
		contents, err := os.ReadFile(path)
		if err != nil || len(contents) == 0 || bytes.Contains(contents, []byte(root)) {
			t.Fatalf("export %q = %q, %v", path, contents, err)
		}
	}
	if code := run([]string{"scan", root, "--report-json", jsonPath}, &stdout, &stderr); code != exitInvalidConfiguration {
		t.Fatalf("overwrite attempt exit = %d, want %d", code, exitInvalidConfiguration)
	}
}

func TestRunVersionAndCustomImportAreExplicit(t *testing.T) {
	var stdout, stderr bytes.Buffer
	if code := run([]string{"version"}, &stdout, &stderr); code != exitReady || strings.TrimSpace(stdout.String()) != version {
		t.Fatalf("version exit/output = %d / %q", code, stdout.String())
	}
	if code := run([]string{"scan", t.TempDir(), "--preset-file", "custom.json"}, &stdout, &stderr); code != exitInvalidConfiguration {
		t.Fatalf("custom import exit = %d, want %d", code, exitInvalidConfiguration)
	}
}

func TestRunValidatesConfigurationBeforeRootAccess(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	existing := filepath.Join(t.TempDir(), "existing.json")
	if err := os.WriteFile(existing, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		args []string
	}{
		{"unknown preset wins over missing root", []string{"scan", missing, "--preset", "does-not-exist"}},
		{"existing destination is configuration", []string{"scan", missing, "--report-json", existing}},
		{"source-tree destination is configuration", []string{"scan", missing, "--report-json", filepath.Join(missing, "report.json")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			if got := run(tc.args, &stdout, &stderr); got != exitInvalidConfiguration {
				t.Fatalf("run(%q) = %d, want invalid configuration; stderr=%q", tc.args, got, stderr.String())
			}
		})
	}
}

func TestRunMapsUnreadableExistingRootToScanStartFailure(t *testing.T) {
	root, err := os.MkdirTemp("/private/tmp", "audio-preflight-unreadable-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(root, 0o700)
		_ = os.RemoveAll(root)
	})
	if err := os.Chmod(root, 0o000); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	if got := run([]string{"scan", root}, &stdout, &stderr); got != exitScanStartFailure {
		t.Fatalf("unreadable root exit = %d, want %d; stderr=%q", got, exitScanStartFailure, stderr.String())
	}
}

func writeCLIFile(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func cliWAV() []byte {
	buf := make([]byte, 50)
	copy(buf[0:4], "RIFF")
	binary.LittleEndian.PutUint32(buf[4:8], uint32(len(buf)-8))
	copy(buf[8:12], "WAVE")
	copy(buf[12:16], "fmt ")
	binary.LittleEndian.PutUint32(buf[16:20], 16)
	binary.LittleEndian.PutUint16(buf[20:22], 1)
	binary.LittleEndian.PutUint16(buf[22:24], 2)
	binary.LittleEndian.PutUint32(buf[24:28], 48_000)
	binary.LittleEndian.PutUint32(buf[28:32], 288_000)
	binary.LittleEndian.PutUint16(buf[32:34], 6)
	binary.LittleEndian.PutUint16(buf[34:36], 24)
	copy(buf[36:40], "data")
	binary.LittleEndian.PutUint32(buf[40:44], 6)
	return buf
}
