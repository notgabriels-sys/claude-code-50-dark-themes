package release

import (
	"archive/tar"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// This test fails if packaging omits a promised customer-facing file, gives
// the executable an unsafe mode, or produces an archive the independent
// verifier cannot establish as a private candidate for its declared platform.
func TestBuildArchiveCreatesVerifiableDarwinArm64Candidate(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz")
	input := ArchiveInput{
		Version:    "1.0.0",
		Platform:   "darwin-arm64",
		Executable: executableForPlatform("darwin-arm64"),
		Documents: map[string][]byte{
			"README.md":                 []byte("readme"),
			"PRIVACY.md":                []byte("privacy"),
			"LIMITATIONS.md":            []byte("limitations"),
			"CUSTOMER_LICENSE_DRAFT.md": []byte("license draft"),
			"VERIFY_SHA256.md":          []byte("verification instructions"),
			"examples/README.md":        []byte("examples"),
		},
	}
	if err := BuildArchive(archive, input); err != nil {
		t.Fatalf("BuildArchive() error = %v", err)
	}
	if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "darwin-arm64"}); err != nil {
		t.Fatalf("VerifyArchive() error = %v", err)
	}
}

// This fails if a linux candidate can contain a checksummed macOS executable
// while still being described and verified as linux-amd64.
func TestVerifyArchiveRejectsExecutableForDifferentPlatform(t *testing.T) {
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", "linux-amd64"))
	if err := BuildArchive(archive, ArchiveInput{
		Version:    "1.0.0",
		Platform:   "linux-amd64",
		Executable: executableForPlatform("darwin-amd64"),
		Documents: map[string][]byte{
			"README.md":                 []byte("readme"),
			"PRIVACY.md":                []byte("privacy"),
			"LIMITATIONS.md":            []byte("limitations"),
			"CUSTOMER_LICENSE_DRAFT.md": []byte("license draft"),
			"VERIFY_SHA256.md":          []byte("verification instructions"),
			"examples/README.md":        []byte("examples"),
		},
	}); err != nil {
		t.Fatal(err)
	}
	if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64"}); err == nil {
		t.Fatal("VerifyArchive() accepted a macOS executable for a linux candidate")
	}
}

// These cases fail if a future verifier starts trusting archive paths,
// metadata, permissions, or checksum text supplied by an untrusted archive.
func TestVerifyArchiveRejectsUnsafeOrInconsistentMembers(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*tar.Header, *[]byte) bool
	}{
		{
			name: "path traversal",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				if header.Name == "audio-preflight-cli-1.0.0-linux-amd64/README.md" {
					header.Name = "audio-preflight-cli-1.0.0-linux-amd64/../README.md"
				}
				return true
			},
		},
		{
			name: "symbolic link",
			mutate: func(header *tar.Header, body *[]byte) bool {
				if header.Name == "audio-preflight-cli-1.0.0-linux-amd64/README.md" {
					header.Typeflag = tar.TypeSymlink
					header.Linkname = "/etc/passwd"
					header.Size = 0
					*body = nil
				}
				return true
			},
		},
		{
			name: "missing required file",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				return header.Name != "audio-preflight-cli-1.0.0-linux-amd64/PRIVACY.md"
			},
		},
		{
			name: "wrong executable mode",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				if header.Name == "audio-preflight-cli-1.0.0-linux-amd64/audio-preflight" {
					header.Mode = 0o644
				}
				return true
			},
		},
		{
			name: "checksum mismatch",
			mutate: func(header *tar.Header, body *[]byte) bool {
				if header.Name == "audio-preflight-cli-1.0.0-linux-amd64/audio-preflight" {
					*body = []byte("tampered executable")
					header.Size = int64(len(*body))
				}
				return true
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			archive := privateCandidateArchive(t, "linux-amd64")
			rewriteArchive(t, archive, tc.mutate)
			if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64"}); err == nil {
				t.Fatal("VerifyArchive() accepted an unsafe or inconsistent archive")
			}
		})
	}
}

// This fails if candidate packaging starts treating unreviewed seller terms as
// an accepted final customer license.
func TestLoadDocumentsRequiresClearlyNamedDraftLicense(t *testing.T) {
	root := t.TempDir()
	for _, name := range requiredDocuments {
		if name == "CUSTOMER_LICENSE_DRAFT.md" {
			continue
		}
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(name), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "LICENSE.md"), []byte("not reviewed"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadDocuments(root); err == nil {
		t.Fatal("LoadDocuments() accepted an unmarked final license")
	}
}

func privateCandidateArchive(t *testing.T, platform string) string {
	t.Helper()
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", platform))
	err := BuildArchive(archive, ArchiveInput{
		Version:    "1.0.0",
		Platform:   platform,
		Executable: executableForPlatform(platform),
		Documents: map[string][]byte{
			"README.md":                 []byte("readme"),
			"PRIVACY.md":                []byte("privacy"),
			"LIMITATIONS.md":            []byte("limitations"),
			"CUSTOMER_LICENSE_DRAFT.md": []byte("license draft"),
			"VERIFY_SHA256.md":          []byte("verification instructions"),
			"examples/README.md":        []byte("examples"),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return archive
}

func rewriteArchive(t *testing.T, archive string, mutate func(*tar.Header, *[]byte) bool) {
	t.Helper()
	file, err := os.Open(archive)
	if err != nil {
		t.Fatal(err)
	}
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	tarReader := tar.NewReader(gzipReader)
	type member struct {
		header tar.Header
		body   []byte
	}
	var members []member
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(tarReader)
		if err != nil {
			t.Fatal(err)
		}
		if mutate(header, &body) {
			members = append(members, member{header: *header, body: body})
		}
	}
	if err := gzipReader.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	output, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter := gzip.NewWriter(output)
	tarWriter := tar.NewWriter(gzipWriter)
	for _, member := range members {
		if err := tarWriter.WriteHeader(&member.header); err != nil {
			t.Fatal(err)
		}
		if _, err := tarWriter.Write(member.body); err != nil {
			t.Fatal(err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
}

func executableForPlatform(platform string) []byte {
	switch platform {
	case "darwin-arm64":
		return []byte{0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01}
	case "darwin-amd64":
		return []byte{0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01}
	case "linux-amd64":
		return []byte{0x7f, 'E', 'L', 'F', 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x3e, 0x00}
	default:
		panic("unsupported platform fixture")
	}
}
