package release

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version"
)

// This fails if the verifier accepts a Mach-O header prefix that is not a
// complete runnable executable with Go build metadata.
func TestVerifyArchiveRejectsHeaderOnlyExecutable(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz")
	input := ArchiveInput{
		Version:    "1.0.0",
		Platform:   "darwin-arm64",
		Mode:       PrivateCandidate,
		Executable: executableForPlatform("darwin-arm64"),
		Provenance: testProvenance(),
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
	if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "darwin-arm64", Mode: PrivateCandidate, Provenance: testProvenance()}); err == nil {
		t.Fatal("VerifyArchive() accepted a header-only executable")
	}
}

// This fails if a linux candidate can contain a checksummed macOS executable
// while still being described and verified as linux-amd64.
func TestVerifyArchiveRejectsExecutableForDifferentPlatform(t *testing.T) {
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", "linux-amd64"))
	if err := BuildArchive(archive, ArchiveInput{
		Version:    "1.0.0",
		Platform:   "linux-amd64",
		Mode:       PrivateCandidate,
		Executable: realExecutable(t, "darwin-amd64"),
		Provenance: testProvenance(),
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
	if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()}); err == nil {
		t.Fatal("VerifyArchive() accepted a macOS executable for a linux candidate")
	}
}

// This fails if parsed Go build metadata is accepted when every release
// setting except the embedded product-version tag identifies a valid CLI.
func TestVerifyArchiveRejectsOtherwiseValidOldVersionGoExecutable(t *testing.T) {
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", "darwin-arm64"))
	input := privateCandidateInput(t, "darwin-arm64")
	input.Executable = realExecutableVersion(t, "darwin-arm64", "0.9.0")
	if err := BuildArchive(archive, input); err != nil {
		t.Fatal(err)
	}

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "darwin-arm64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "bind executable version") {
		t.Fatalf("VerifyArchive() error = %v, want old executable version rejection", err)
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
			name: "special executable permission bits",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				if strings.HasSuffix(header.Name, "/audio-preflight") {
					header.Mode = 0o4755
				}
				return true
			},
		},
		{
			name: "noncanonical owner and timestamp metadata",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				if strings.HasSuffix(header.Name, "/README.md") {
					header.Uid, header.Gid, header.Uname, header.Gname, header.ModTime = 1, 2, "owner", "group", time.Unix(1, 0)
				}
				return true
			},
		},
		{
			name: "pax attributes",
			mutate: func(header *tar.Header, _ *[]byte) bool {
				if strings.HasSuffix(header.Name, "/README.md") {
					header.PAXRecords = map[string]string{"comment": "unexpected"}
					header.Format = tar.FormatPAX
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
			if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()}); err == nil {
				t.Fatal("VerifyArchive() accepted an unsafe or inconsistent archive")
			}
		})
	}
}

func TestVerifyArchiveRejectsSetgidExecutableMode(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	rewriteArchive(t, archive, func(header *tar.Header, _ *[]byte) bool {
		if strings.HasSuffix(header.Name, "/audio-preflight") {
			header.Mode = 0o2755
		}
		return true
	})

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "non-canonical metadata") {
		t.Fatalf("VerifyArchive() error = %v, want setgid-mode rejection", err)
	}
}

func TestVerifyArchiveRejectsStickyExecutableMode(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	rewriteArchive(t, archive, func(header *tar.Header, _ *[]byte) bool {
		if strings.HasSuffix(header.Name, "/audio-preflight") {
			header.Mode = 0o1755
		}
		return true
	})

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "non-canonical metadata") {
		t.Fatalf("VerifyArchive() error = %v, want sticky-mode rejection", err)
	}
}

func TestVerifyArchiveRejectsExtendedAttributes(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	rewriteArchive(t, archive, func(header *tar.Header, _ *[]byte) bool {
		if strings.HasSuffix(header.Name, "/README.md") {
			header.Xattrs = map[string]string{"user.release-note": "unexpected"}
			header.Format = tar.FormatPAX
		}
		return true
	})

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "non-canonical metadata") {
		t.Fatalf("VerifyArchive() error = %v, want xattr rejection", err)
	}
}

func TestVerifyArchiveRejectsTooManyMembers(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	members := readArchiveMembers(t, archive)
	var duplicate testArchiveMember
	for _, member := range members {
		if strings.HasSuffix(member.header.Name, "/README.md") {
			duplicate = member
			break
		}
	}
	if duplicate.header.Name == "" {
		t.Fatal("README.md member not found")
	}
	members = append(members, duplicate)
	writeArchiveMembers(t, archive, members)

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "too many members") {
		t.Fatalf("VerifyArchive() error = %v, want member-count rejection", err)
	}
}

func TestVerifyArchiveRejectsCumulativeExpandedSize(t *testing.T) {
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", "linux-amd64"))
	input := privateCandidateInput(t, "linux-amd64")
	paddedExecutable := make([]byte, maxExecutableSize)
	copy(paddedExecutable, input.Executable)
	input.Executable = paddedExecutable
	largeDocument := bytes.Repeat([]byte{'d'}, 3<<19)
	for name := range input.Documents {
		input.Documents[name] = largeDocument
	}
	if err := BuildArchive(archive, input); err != nil {
		t.Fatal(err)
	}

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "expanded-size limit") {
		t.Fatalf("VerifyArchive() error = %v, want cumulative expanded-size rejection", err)
	}
}

func TestVerifyArchiveRejectsUnexpectedLargeMemberBeforeReadingBody(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	rewriteArchive(t, archive, func(header *tar.Header, body *[]byte) bool {
		if strings.HasSuffix(header.Name, "/README.md") {
			header.Name = strings.TrimSuffix(header.Name, "README.md") + "unexpected.bin"
			*body = bytes.Repeat([]byte{0}, maxDocumentSize+1)
			header.Size = int64(len(*body))
		}
		return true
	})

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "unexpected member") {
		t.Fatalf("VerifyArchive() error = %v, want unexpected member rejection", err)
	}
}

func TestVerifyArchiveRejectsCompressedOversizedDocument(t *testing.T) {
	archive := privateCandidateArchive(t, "linux-amd64")
	rewriteArchive(t, archive, func(header *tar.Header, body *[]byte) bool {
		if strings.HasSuffix(header.Name, "/README.md") {
			*body = bytes.Repeat([]byte{0}, maxDocumentSize+1)
			header.Size = int64(len(*body))
		}
		return true
	})

	err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "linux-amd64", Mode: PrivateCandidate, Provenance: testProvenance()})
	if err == nil || !strings.Contains(err.Error(), "expanded-size limit") {
		t.Fatalf("VerifyArchive() error = %v, want compressed-bomb rejection", err)
	}
}

// This fails if candidate packaging starts treating unreviewed seller terms as
// an accepted final customer license.
func TestLoadDocumentsRequiresClearlyNamedDraftLicense(t *testing.T) {
	root := t.TempDir()
	for _, name := range requiredDocuments(PrivateCandidate) {
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
	if _, err := LoadDocuments(root, PrivateCandidate, ""); err == nil {
		t.Fatal("LoadDocuments() accepted an unmarked final license")
	}
}

func TestLicenseModesKeepDraftAndCustomerReleaseSeparate(t *testing.T) {
	root := t.TempDir()
	for _, name := range baseDocuments {
		path := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("document"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	draft := filepath.Join(root, "CUSTOMER_LICENSE_DRAFT.md")
	if err := os.WriteFile(draft, []byte("DRAFT ONLY"), 0o644); err != nil {
		t.Fatal(err)
	}
	accepted := filepath.Join(root, "accepted-license.txt")
	if err := os.WriteFile(accepted, []byte("accepted terms"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadDocuments(root, PrivateCandidate, accepted); err == nil {
		t.Fatal("candidate accepted final license path")
	}
	if _, err := LoadDocuments(root, CustomerRelease, draft); err == nil {
		t.Fatal("customer release accepted draft license")
	}
	docs, err := LoadDocuments(root, CustomerRelease, accepted)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := docs["LICENSE.txt"]; !ok {
		t.Fatal("customer release did not copy accepted license as LICENSE.txt")
	}
	if _, ok := docs["CUSTOMER_LICENSE_DRAFT.md"]; ok {
		t.Fatal("customer release retained draft license")
	}
}

func TestVerifyArchiveRejectsTrailingPayload(t *testing.T) {
	archive := privateCandidateArchive(t, "darwin-arm64")
	file, err := os.OpenFile(archive, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write([]byte("trailing-payload")); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := VerifyArchive(archive, Verification{Version: "1.0.0", Platform: "darwin-arm64", Mode: PrivateCandidate, Provenance: testProvenance()}); err == nil {
		t.Fatal("VerifyArchive() accepted trailing payload")
	}
}

func privateCandidateArchive(t *testing.T, platform string) string {
	t.Helper()
	archive := filepath.Join(t.TempDir(), CandidateFilename("1.0.0", platform))
	if err := BuildArchive(archive, privateCandidateInput(t, platform)); err != nil {
		t.Fatal(err)
	}
	return archive
}

func privateCandidateInput(t *testing.T, platform string) ArchiveInput {
	t.Helper()
	return ArchiveInput{
		Version:    "1.0.0",
		Platform:   platform,
		Mode:       PrivateCandidate,
		Executable: realExecutable(t, platform),
		Provenance: testProvenance(),
		Documents: map[string][]byte{
			"README.md":                 []byte("readme"),
			"PRIVACY.md":                []byte("privacy"),
			"LIMITATIONS.md":            []byte("limitations"),
			"CUSTOMER_LICENSE_DRAFT.md": []byte("license draft"),
			"VERIFY_SHA256.md":          []byte("verification instructions"),
			"examples/README.md":        []byte("examples"),
		},
	}
}

func testProvenance() Provenance {
	return Provenance{SourceRevision: strings.Repeat("a", 40), Toolchain: version.Toolchain, RuntimeVersion: "unverified-cross-target"}
}

func rewriteArchive(t *testing.T, archive string, mutate func(*tar.Header, *[]byte) bool) {
	t.Helper()
	members := readArchiveMembers(t, archive)
	kept := members[:0]
	for _, member := range members {
		if mutate(&member.header, &member.body) {
			kept = append(kept, member)
		}
	}
	writeArchiveMembers(t, archive, kept)
}

type testArchiveMember struct {
	header tar.Header
	body   []byte
}

func readArchiveMembers(t *testing.T, archive string) []testArchiveMember {
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
	var members []testArchiveMember
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
		members = append(members, testArchiveMember{header: *header, body: body})
	}
	if err := gzipReader.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	return members
}

func writeArchiveMembers(t *testing.T, archive string, members []testArchiveMember) {
	t.Helper()
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

func realExecutable(t *testing.T, platform string) []byte {
	t.Helper()
	return realExecutableVersion(t, platform, "1.0.0")
}

func realExecutableVersion(t *testing.T, platform, productVersion string) []byte {
	t.Helper()
	parts := strings.Split(platform, "-")
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "audio-preflight")
	link := "-buildid= -X github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version.Value=" + productVersion
	tag := "audio_preflight_v" + strings.ReplaceAll(productVersion, ".", "_")
	cmd := exec.Command("go", "build", "-trimpath", "-buildvcs=false", "-buildmode=exe", "-tags="+tag, "-ldflags="+link, "-o", path, "./cmd/audio-preflight")
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+parts[0], "GOARCH="+parts[1])
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build test executable: %v\n%s", err, output)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return contents
}
