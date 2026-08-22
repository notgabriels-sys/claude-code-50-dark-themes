package preflight

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// These exercises use real directories and handle-relative writes. Hooks only
// place adversarial filesystem changes at otherwise nondeterministic boundaries.
func TestPrepareReportsRejectsDestinationInsideSelectedSourceBeforeScanning(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing-source")
	_, err := PrepareReportDestinations(root, ReportDestinations{JSON: filepath.Join(root, "report.json")})
	if err == nil || !IsReportDestinationConfigurationError(err) {
		t.Fatalf("source-tree destination error = %v, want configuration error", err)
	}
}

func TestPreparedReportsRollBackEveryArtifactAfterLateCollision(t *testing.T) {
	report := transactionReport(t)
	parent := physicalTempDir(t)
	htmlPath := filepath.Join(parent, "report.html")
	jsonPath := filepath.Join(parent, "report.json")
	prepared, err := PrepareReportDestinations("", ReportDestinations{HTML: htmlPath, JSON: jsonPath})
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	err = writePreparedReportsWithHooks(prepared, report, reportWriteHooks{
		beforePublish: func(index int) error {
			if index == 1 {
				return os.WriteFile(jsonPath, []byte("external collision"), 0o600)
			}
			return nil
		},
		tempName: func(index int) string { return ".adp-test-tmp-" + string(rune('a'+index)) },
	})
	if err == nil || !IsReportDestinationConfigurationError(err) {
		t.Fatalf("late collision error = %v, want configuration error", err)
	}
	if _, err := os.Lstat(htmlPath); !os.IsNotExist(err) {
		t.Fatalf("first artifact survived failed transaction: %v", err)
	}
	if got, err := os.ReadFile(jsonPath); err != nil || string(got) != "external collision" {
		t.Fatalf("colliding destination = %q, %v", got, err)
	}
	entries, err := os.ReadDir(parent)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".adp-test-tmp-") {
			t.Fatalf("temporary artifact was not cleaned up: %q", entry.Name())
		}
	}
}

func TestPreparedReportsRollBackWhenAncestorReplacementBreaksRequestedBinding(t *testing.T) {
	report := transactionReport(t)
	base := physicalTempDir(t)
	originalParent := filepath.Join(base, "original")
	movedParent := filepath.Join(base, "moved")
	attackerParent := filepath.Join(base, "attacker")
	if err := os.Mkdir(originalParent, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(attackerParent, 0o700); err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(originalParent, "report.json")
	prepared, err := PrepareReportDestinations("", ReportDestinations{JSON: destination})
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	err = writePreparedReportsWithHooks(prepared, report, reportWriteHooks{
		beforePublish: func(index int) error {
			if index == 0 {
				if err := os.Rename(originalParent, movedParent); err != nil {
					return err
				}
				return os.Rename(attackerParent, originalParent)
			}
			return nil
		},
		tempName: func(int) string { return ".adp-test-tmp-race" },
	})
	if err == nil || !IsReportDestinationConfigurationError(err) {
		t.Fatalf("ancestor replacement error = %v, want configuration error", err)
	}
	if _, err := os.Lstat(filepath.Join(originalParent, "report.json")); !os.IsNotExist(err) {
		t.Fatalf("report was redirected into replacement parent: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(movedParent, "report.json")); !os.IsNotExist(err) {
		t.Fatalf("report was not rolled back through held parent descriptor: %v", err)
	}
}

func TestPreparedReportsPreserveUnexpectedWriteFailureClass(t *testing.T) {
	report := transactionReport(t)
	parent := physicalTempDir(t)
	prepared, err := PrepareReportDestinations("", ReportDestinations{JSON: filepath.Join(parent, "report.json")})
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.Close()
	err = writePreparedReportsWithHooks(prepared, report, reportWriteHooks{
		writeTemp: func(*os.File, []byte) error { return errors.New("injected sync failure") },
	})
	if err == nil || IsReportDestinationConfigurationError(err) {
		t.Fatalf("unexpected write failure class = %v", err)
	}
	if _, err := os.Lstat(filepath.Join(parent, "report.json")); !os.IsNotExist(err) {
		t.Fatalf("artifact survived unexpected write failure: %v", err)
	}
}

func transactionReport(t *testing.T) Report {
	t.Helper()
	root := t.TempDir()
	writeScanFile(t, filepath.Join(root, "main.wav"), readablePCM(2, 48_000, 24))
	preset, err := PresetByID("general-audio")
	if err != nil {
		t.Fatal(err)
	}
	report, err := AnalyzeDirectory(root, preset)
	if err != nil {
		t.Fatal(err)
	}
	return report
}

func physicalTempDir(t *testing.T) string {
	t.Helper()
	base, err := filepath.EvalSymlinks(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path, err := os.MkdirTemp(base, "audio-preflight-transaction-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(path) })
	return path
}
