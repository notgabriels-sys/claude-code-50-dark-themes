// Package release builds and verifies private, platform-specific CLI archives.
package release

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const executableName = "audio-preflight"

var requiredDocuments = []string{
	"README.md",
	"PRIVACY.md",
	"LIMITATIONS.md",
	"CUSTOMER_LICENSE_DRAFT.md",
	"VERIFY_SHA256.md",
	"examples/README.md",
}

// ArchiveInput is the complete, already-built content of one private candidate.
type ArchiveInput struct {
	Version    string
	Platform   string
	Executable []byte
	Documents  map[string][]byte
}

// Verification identifies the archive version and platform the verifier must
// establish without extracting any archive member to disk.
type Verification struct {
	Version  string
	Platform string
}

// LoadDocuments reads the exact private-candidate documentation set from a
// CLI source directory. A final customer license is intentionally not an
// accepted input until the seller completes the owner-controlled legal gate.
func LoadDocuments(source string) (map[string][]byte, error) {
	documents := make(map[string][]byte, len(requiredDocuments))
	for _, name := range requiredDocuments {
		contents, err := os.ReadFile(filepath.Join(source, filepath.FromSlash(name)))
		if err != nil {
			return nil, fmt.Errorf("read private candidate document %q: %w", name, err)
		}
		if len(contents) == 0 {
			return nil, fmt.Errorf("private candidate document %q is empty", name)
		}
		documents[name] = contents
	}
	return documents, nil
}

type manifest struct {
	FormatVersion string `json:"format_version"`
	ReleaseStatus string `json:"release_status"`
	Version       string `json:"version"`
	Platform      string `json:"platform"`
	Executable    string `json:"executable"`
}

func archiveRoot(version, platform string) string {
	return fmt.Sprintf("audio-preflight-cli-%s-%s", version, platform)
}

func candidateFilename(version, platform string) string {
	return fmt.Sprintf("audio-preflight-cli-private-candidate_%s_%s.tar.gz", version, platform)
}

// CandidateFilename returns the required, deliberately non-public archive name.
func CandidateFilename(version, platform string) string {
	return candidateFilename(version, platform)
}

// BuildArchive writes a deterministic private candidate and refuses to replace
// an existing output. Its gzip and tar timestamps, ownership, ordering, and
// permissions are fixed so repeated builds from identical bytes are identical.
func BuildArchive(output string, input ArchiveInput) error {
	if err := validateInput(output, input); err != nil {
		return err
	}
	files := map[string][]byte{executableName: input.Executable}
	for name, contents := range input.Documents {
		files[name] = contents
	}
	manifestBytes, err := json.MarshalIndent(manifest{
		FormatVersion: "1",
		ReleaseStatus: "private-candidate-only",
		Version:       input.Version,
		Platform:      input.Platform,
		Executable:    executableName,
	}, "", "  ")
	if err != nil {
		return fmt.Errorf("encode release manifest: %w", err)
	}
	files["RELEASE_MANIFEST.json"] = append(manifestBytes, '\n')
	files["SHA256SUMS.txt"] = checksumFile(files)

	file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create private candidate archive: %w", err)
	}
	completed := false
	defer func() {
		if !completed {
			_ = file.Close()
			_ = os.Remove(output)
		}
	}()
	gzipWriter := gzip.NewWriter(file)
	gzipWriter.Name = ""
	gzipWriter.Comment = ""
	gzipWriter.ModTime = time.Unix(0, 0).UTC()
	gzipWriter.OS = 255
	tarWriter := tar.NewWriter(gzipWriter)
	root := archiveRoot(input.Version, input.Platform)
	if err := writeHeader(tarWriter, root+"/", tar.TypeDir, 0o755, nil); err != nil {
		return err
	}
	for _, name := range sortedFileNames(files) {
		mode := int64(0o644)
		if name == executableName {
			mode = 0o755
		}
		if err := writeHeader(tarWriter, root+"/"+name, tar.TypeReg, mode, files[name]); err != nil {
			return err
		}
		if _, err := tarWriter.Write(files[name]); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		return fmt.Errorf("finalize tar: %w", err)
	}
	if err := gzipWriter.Close(); err != nil {
		return fmt.Errorf("finalize gzip: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close archive: %w", err)
	}
	completed = true
	return nil
}

func validateInput(output string, input ArchiveInput) error {
	if !validVersion(input.Version) || !validPlatform(input.Platform) {
		return fmt.Errorf("invalid candidate version or platform")
	}
	if filepath.Base(output) != candidateFilename(input.Version, input.Platform) {
		return fmt.Errorf("private candidate archive must be named %q", candidateFilename(input.Version, input.Platform))
	}
	if len(input.Executable) == 0 {
		return fmt.Errorf("candidate executable is empty")
	}
	if len(input.Documents) != len(requiredDocuments) {
		return fmt.Errorf("candidate document set is incomplete or contains an unexpected file")
	}
	for _, name := range requiredDocuments {
		contents, ok := input.Documents[name]
		if !ok || len(contents) == 0 {
			return fmt.Errorf("candidate document %q is missing or empty", name)
		}
	}
	return nil
}

func validVersion(version string) bool {
	return version != "" && !strings.ContainsAny(version, "/\\") && !strings.Contains(version, "..")
}

func validPlatform(platform string) bool {
	return platform == "darwin-arm64" || platform == "darwin-amd64" || platform == "linux-amd64"
}

func writeHeader(writer *tar.Writer, name string, typeflag byte, mode int64, body []byte) error {
	header := &tar.Header{
		Name:       name,
		Mode:       mode,
		Size:       int64(len(body)),
		Typeflag:   typeflag,
		ModTime:    time.Unix(0, 0).UTC(),
		AccessTime: time.Time{},
		ChangeTime: time.Time{},
		Uid:        0,
		Gid:        0,
		Uname:      "",
		Gname:      "",
		Format:     tar.FormatUSTAR,
	}
	if typeflag == tar.TypeDir {
		header.Size = 0
	}
	if err := writer.WriteHeader(header); err != nil {
		return fmt.Errorf("write archive header %q: %w", name, err)
	}
	return nil
}

func sortedFileNames(files map[string][]byte) []string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func checksumFile(files map[string][]byte) []byte {
	var lines []string
	for _, name := range sortedFileNames(files) {
		digest := sha256.Sum256(files[name])
		lines = append(lines, hex.EncodeToString(digest[:])+"  "+name)
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

// VerifyArchive validates the compressed stream in place. It never follows or
// creates paths from the archive, and rejects unsafe member types before any
// caller could extract them.
func VerifyArchive(archive string, expected Verification) error {
	if !validVersion(expected.Version) || !validPlatform(expected.Platform) {
		return fmt.Errorf("invalid expected version or platform")
	}
	if filepath.Base(archive) != candidateFilename(expected.Version, expected.Platform) {
		return fmt.Errorf("archive filename does not identify the expected private candidate")
	}
	file, err := os.Open(archive)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("open gzip archive: %w", err)
	}
	defer gzipReader.Close()

	root := archiveRoot(expected.Version, expected.Platform)
	seen := make(map[string]fileRecord)
	seenRoot := false
	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read archive: %w", err)
		}
		name, err := safeMemberName(header.Name, root)
		if err != nil {
			return err
		}
		if header.Typeflag == tar.TypeDir {
			if name != "" || header.Mode&0o777 != 0o755 || seenRoot {
				return fmt.Errorf("invalid archive root directory")
			}
			seenRoot = true
			continue
		}
		if header.Typeflag != tar.TypeReg || header.Linkname != "" {
			return fmt.Errorf("archive member %q is not a regular file", header.Name)
		}
		if !seenRoot || name == "" {
			return fmt.Errorf("archive member %q appears before the root directory", header.Name)
		}
		if _, duplicate := seen[name]; duplicate {
			return fmt.Errorf("archive has duplicate member %q", name)
		}
		if err := allowedMode(name, header.Mode); err != nil {
			return err
		}
		digest, contents, prefix, err := readAndHash(tarReader, header.Size, name)
		if err != nil {
			return err
		}
		seen[name] = fileRecord{digest: digest, contents: contents, prefix: prefix}
	}
	if !seenRoot {
		return fmt.Errorf("archive root directory is missing")
	}
	if err := validateRequiredFiles(seen); err != nil {
		return err
	}
	if err := validateManifest(seen["RELEASE_MANIFEST.json"].contents, expected); err != nil {
		return err
	}
	if err := validateExecutablePlatform(seen[executableName].prefix, expected.Platform); err != nil {
		return err
	}
	if err := validateChecksums(seen, seen["SHA256SUMS.txt"].contents); err != nil {
		return err
	}
	return nil
}

type fileRecord struct {
	digest   string
	contents []byte
	prefix   []byte
}

func safeMemberName(member, root string) (string, error) {
	if member == "" || strings.HasPrefix(member, "/") || strings.Contains(member, "\\") {
		return "", fmt.Errorf("unsafe archive member path %q", member)
	}
	clean := path.Clean(member)
	if clean != strings.TrimSuffix(member, "/") || clean == "." || strings.HasPrefix(clean, "../") || strings.Contains(clean, "/../") {
		return "", fmt.Errorf("unsafe archive member path %q", member)
	}
	if clean == root {
		return "", nil
	}
	prefix := root + "/"
	if !strings.HasPrefix(clean, prefix) {
		return "", fmt.Errorf("archive member %q is outside expected root", member)
	}
	return strings.TrimPrefix(clean, prefix), nil
}

func allowedMode(name string, mode int64) error {
	if name == executableName {
		if mode&0o777 != 0o755 {
			return fmt.Errorf("executable %q must have mode 0755", name)
		}
		return nil
	}
	if mode&0o777 != 0o644 {
		return fmt.Errorf("archive file %q must have mode 0644", name)
	}
	return nil
}

func readAndHash(reader io.Reader, size int64, name string) (string, []byte, []byte, error) {
	const maxMemberSize = 512 << 20
	const maxControlSize = 1 << 20
	if size < 0 || size > maxMemberSize {
		return "", nil, nil, fmt.Errorf("archive member %q has an unsafe size", name)
	}
	hash := sha256.New()
	prefix := &prefixCapture{limit: 32}
	stream := io.TeeReader(reader, io.MultiWriter(hash, prefix))
	var contents []byte
	if name == "RELEASE_MANIFEST.json" || name == "SHA256SUMS.txt" {
		if size > maxControlSize {
			return "", nil, nil, fmt.Errorf("archive control file %q is too large", name)
		}
		contents = make([]byte, size)
		if _, err := io.ReadFull(stream, contents); err != nil {
			return "", nil, nil, fmt.Errorf("read archive member %q: %w", name, err)
		}
	} else if _, err := io.Copy(io.Discard, stream); err != nil {
		return "", nil, nil, fmt.Errorf("read archive member %q: %w", name, err)
	}
	return hex.EncodeToString(hash.Sum(nil)), contents, prefix.bytes, nil
}

type prefixCapture struct {
	limit int
	bytes []byte
}

func (capture *prefixCapture) Write(value []byte) (int, error) {
	remaining := capture.limit - len(capture.bytes)
	if remaining > 0 {
		if remaining > len(value) {
			remaining = len(value)
		}
		capture.bytes = append(capture.bytes, value[:remaining]...)
	}
	return len(value), nil
}

func validateRequiredFiles(seen map[string]fileRecord) error {
	required := append([]string{executableName, "RELEASE_MANIFEST.json", "SHA256SUMS.txt"}, requiredDocuments...)
	if len(seen) != len(required) {
		return fmt.Errorf("archive has missing or unexpected files")
	}
	for _, name := range required {
		if _, ok := seen[name]; !ok {
			return fmt.Errorf("archive required file %q is missing", name)
		}
	}
	return nil
}

func validateManifest(contents []byte, expected Verification) error {
	var got manifest
	if err := json.Unmarshal(contents, &got); err != nil {
		return fmt.Errorf("read release manifest: %w", err)
	}
	if got.FormatVersion != "1" || got.ReleaseStatus != "private-candidate-only" || got.Version != expected.Version || got.Platform != expected.Platform || got.Executable != executableName {
		return fmt.Errorf("release manifest does not match the expected private candidate")
	}
	return nil
}

func validateExecutablePlatform(prefix []byte, platform string) error {
	switch platform {
	case "darwin-arm64":
		if len(prefix) >= 8 && string(prefix[:8]) == string([]byte{0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01}) {
			return nil
		}
	case "darwin-amd64":
		if len(prefix) >= 8 && string(prefix[:8]) == string([]byte{0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01}) {
			return nil
		}
	case "linux-amd64":
		if len(prefix) >= 20 && string(prefix[:4]) == "\x7fELF" && prefix[4] == 2 && prefix[5] == 1 && prefix[18] == 0x3e && prefix[19] == 0 {
			return nil
		}
	}
	return fmt.Errorf("executable does not match declared platform %q", platform)
}

func validateChecksums(seen map[string]fileRecord, contents []byte) error {
	lines := strings.Split(strings.TrimSuffix(string(contents), "\n"), "\n")
	if len(lines) != len(seen)-1 || len(lines) == 0 {
		return fmt.Errorf("checksum manifest does not cover every archive file")
	}
	declared := make(map[string]string, len(lines))
	for _, line := range lines {
		parts := strings.SplitN(line, "  ", 2)
		if len(parts) != 2 || len(parts[0]) != sha256.Size*2 || !validChecksumPath(parts[1]) {
			return fmt.Errorf("invalid checksum manifest entry %q", line)
		}
		if _, err := hex.DecodeString(parts[0]); err != nil {
			return fmt.Errorf("invalid checksum digest for %q", parts[1])
		}
		if _, duplicate := declared[parts[1]]; duplicate || parts[1] == "SHA256SUMS.txt" {
			return fmt.Errorf("duplicate or self-referential checksum entry %q", parts[1])
		}
		declared[parts[1]] = parts[0]
	}
	for name, record := range seen {
		if name == "SHA256SUMS.txt" {
			continue
		}
		if declared[name] != record.digest {
			return fmt.Errorf("checksum mismatch for %q", name)
		}
	}
	return nil
}

func validChecksumPath(name string) bool {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || path.Clean(name) != name || strings.HasPrefix(name, "../") {
		return false
	}
	return true
}
