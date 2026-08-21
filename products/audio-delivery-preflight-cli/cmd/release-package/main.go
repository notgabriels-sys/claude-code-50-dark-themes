// release-package builds one reproducible private candidate archive. It never
// creates a provider object, uploads an artifact, tags a release, or publishes.
package main

import (
	"crypto/sha256"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/release"
)

const version = "1.0.0"

func main() {
	platform := flag.String("platform", "", "target platform: darwin-arm64, darwin-amd64, or linux-amd64")
	outputDirectory := flag.String("output-dir", "", "existing directory for the private candidate archive")
	flag.Parse()
	if *platform == "" || *outputDirectory == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: release-package -platform <darwin-arm64|darwin-amd64|linux-amd64> -output-dir <existing-directory>")
		os.Exit(2)
	}
	if err := run(*platform, *outputDirectory); err != nil {
		fmt.Fprintln(os.Stderr, "private candidate packaging failed:", err)
		os.Exit(1)
	}
}

func run(platform, outputDirectory string) error {
	if platform != "darwin-arm64" && platform != "darwin-amd64" && platform != "linux-amd64" {
		return fmt.Errorf("unsupported platform %q", platform)
	}
	parts := strings.Split(platform, "-")
	info, err := os.Stat(outputDirectory)
	if err != nil {
		return fmt.Errorf("stat output directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("output path is not a directory")
	}
	working, err := os.MkdirTemp("", "audio-preflight-cli-package-")
	if err != nil {
		return fmt.Errorf("create build workspace: %w", err)
	}
	defer os.RemoveAll(working)
	binary := filepath.Join(working, "audio-preflight")
	build := exec.Command("go", "build", "-trimpath", "-buildvcs=false", "-ldflags=-buildid=", "-o", binary, "./cmd/audio-preflight")
	build.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+parts[0], "GOARCH="+parts[1])
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		return fmt.Errorf("build %s: %w", platform, err)
	}
	executable, err := os.ReadFile(binary)
	if err != nil {
		return fmt.Errorf("read built executable: %w", err)
	}
	documents, err := release.LoadDocuments(".")
	if err != nil {
		return err
	}
	archive := filepath.Join(outputDirectory, release.CandidateFilename(version, platform))
	if err := release.BuildArchive(archive, release.ArchiveInput{
		Version: version, Platform: platform, Executable: executable, Documents: documents,
	}); err != nil {
		return err
	}
	if err := release.VerifyArchive(archive, release.Verification{Version: version, Platform: platform}); err != nil {
		return fmt.Errorf("verify generated archive: %w", err)
	}
	if err := writeSidecarChecksum(archive); err != nil {
		return err
	}
	fmt.Println("Created and verified private candidate:", archive)
	return nil
}

func writeSidecarChecksum(archive string) error {
	contents, err := os.ReadFile(archive)
	if err != nil {
		return fmt.Errorf("read archive for checksum: %w", err)
	}
	digest := sha256.Sum256(contents)
	sidecar := archive + ".sha256"
	file, err := os.OpenFile(sidecar, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create archive checksum: %w", err)
	}
	if _, err := fmt.Fprintf(file, "%x  %s\n", digest, filepath.Base(archive)); err != nil {
		_ = file.Close()
		_ = os.Remove(sidecar)
		return fmt.Errorf("write archive checksum: %w", err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(sidecar)
		return fmt.Errorf("close archive checksum: %w", err)
	}
	return nil
}
