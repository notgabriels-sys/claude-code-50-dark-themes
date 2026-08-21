// release-package creates a verified archive pair. It never uploads, tags,
// releases, or publishes; customer mode only packages owner-supplied terms.
package main

import (
	"crypto/sha256"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/release"
	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version"
)

func main() {
	platform := flag.String("platform", "", "target platform")
	outputDirectory := flag.String("output-dir", "", "existing output directory")
	mode := flag.String("mode", string(release.PrivateCandidate), "private-candidate or customer-release")
	acceptedLicense := flag.String("accepted-license", "", "explicit owner-accepted license path for customer-release")
	flag.Parse()
	if *platform == "" || *outputDirectory == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: release-package -platform <darwin-arm64|darwin-amd64|linux-amd64> -output-dir <directory> [-mode private-candidate|customer-release] [-accepted-license <path>]")
		os.Exit(2)
	}
	if err := run(*platform, *outputDirectory, release.Mode(*mode), *acceptedLicense); err != nil {
		fmt.Fprintln(os.Stderr, "release packaging failed:", err)
		os.Exit(1)
	}
}

func run(platform, outputDirectory string, mode release.Mode, acceptedLicense string) error {
	if platform != "darwin-arm64" && platform != "darwin-amd64" && platform != "linux-amd64" {
		return fmt.Errorf("unsupported platform %q", platform)
	}
	if err := requireToolchain(); err != nil {
		return err
	}
	if info, err := os.Stat(outputDirectory); err != nil || !info.IsDir() {
		return fmt.Errorf("output directory is unavailable")
	}
	if err := requireCleanSourceTree(); err != nil {
		return err
	}
	filename := release.ArchiveFilename(version.Current, platform, mode)
	archive := filepath.Join(outputDirectory, filename)
	sidecar := archive + ".sha256"
	if _, err := os.Lstat(archive); err == nil {
		return fmt.Errorf("archive already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	if _, err := os.Lstat(sidecar); err == nil {
		return fmt.Errorf("archive checksum already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	sourceRevision, err := commandOutput("git", "rev-parse", "HEAD")
	if err != nil {
		return fmt.Errorf("read source revision: %w", err)
	}
	if err := verifyCommittedVersionSource(sourceRevision); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(outputDirectory, ".audio-preflight-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	parts := strings.Split(platform, "-")
	binary := filepath.Join(stage, "audio-preflight")
	link := "-buildid= -X github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version.Value=" + version.Current
	build := exec.Command("go", "build", "-trimpath", "-buildvcs=true", "-buildmode=exe", "-tags="+versionTag(version.Current), "-ldflags="+link, "-o", binary, "./cmd/audio-preflight")
	build.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+parts[0], "GOARCH="+parts[1])
	build.Stdout, build.Stderr = os.Stdout, os.Stderr
	if err := build.Run(); err != nil {
		return fmt.Errorf("build %s: %w", platform, err)
	}
	executable, err := os.ReadFile(binary)
	if err != nil {
		return err
	}
	runtimeVersion := "unverified-cross-target"
	if runtime.GOOS+"-"+runtime.GOARCH == platform {
		runtimeVersion, err = commandOutput(binary, "version")
		if err != nil || runtimeVersion != version.Current {
			return fmt.Errorf("runtime version evidence failed: %w", err)
		}
	}
	documents, err := release.LoadDocuments(".", mode, acceptedLicense)
	if err != nil {
		return err
	}
	provenance := release.Provenance{SourceRevision: sourceRevision, Toolchain: version.Toolchain, RuntimeVersion: runtimeVersion}
	stagedArchive := filepath.Join(stage, filename)
	if err := release.BuildArchive(stagedArchive, release.ArchiveInput{Version: version.Current, Platform: platform, Mode: mode, Executable: executable, Documents: documents, Provenance: provenance}); err != nil {
		return err
	}
	if err := release.VerifyArchive(stagedArchive, release.Verification{Version: version.Current, Platform: platform, Mode: mode, Provenance: provenance}); err != nil {
		return err
	}
	stagedSidecar := stagedArchive + ".sha256"
	if err := writeSidecar(stagedArchive, stagedSidecar); err != nil {
		return err
	}
	if err := publishPair(stagedArchive, stagedSidecar, archive, sidecar); err != nil {
		return err
	}
	fmt.Println("Created and verified", mode, "archive:", archive)
	return nil
}

func requireCleanSourceTree() error {
	status, err := commandOutput("git", "status", "--porcelain=v1", "--untracked-files=all")
	if err != nil {
		return fmt.Errorf("inspect source tree: %w", err)
	}
	if status != "" {
		return fmt.Errorf("release packaging requires a clean source tree")
	}
	return nil
}

func verifyCommittedVersionSource(revision string) error {
	contents, err := commandOutput("git", "show", revision+":products/audio-delivery-preflight-cli/internal/version/version.go")
	if err != nil {
		return fmt.Errorf("read committed version source: %w", err)
	}
	pattern := regexp.MustCompile(`(?m)Current\s*=\s*"` + regexp.QuoteMeta(version.Current) + `"`)
	if !pattern.MatchString(contents) {
		return fmt.Errorf("committed version source does not declare %s", version.Current)
	}
	return nil
}

func requireToolchain() error {
	got, err := commandOutput("go", "version")
	if err != nil || got != "go version "+version.Toolchain+" "+runtime.GOOS+"/"+runtime.GOARCH {
		return fmt.Errorf("requires exact toolchain %s", version.Toolchain)
	}
	return nil
}
func versionTag(value string) string {
	return "audio_preflight_v" + strings.ReplaceAll(value, ".", "_")
}
func commandOutput(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	return strings.TrimSpace(string(out)), err
}

type sidecarFile interface {
	io.Writer
	Close() error
}

type openSidecarFunc func(string, int, os.FileMode) (sidecarFile, error)

func writeSidecar(archive, sidecar string) error {
	return writeSidecarWithOpener(archive, sidecar, func(path string, flag int, mode os.FileMode) (sidecarFile, error) {
		return os.OpenFile(path, flag, mode)
	})
}

func writeSidecarWithOpener(archive, sidecar string, openSidecar openSidecarFunc) error {
	input, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer input.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, input); err != nil {
		return err
	}
	output, err := openSidecar(sidecar, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	completed := false
	defer func() {
		if !completed {
			_ = output.Close()
			_ = os.Remove(sidecar)
		}
	}()
	if _, err := fmt.Fprintf(output, "%x  %s\n", hash.Sum(nil), filepath.Base(archive)); err != nil {
		return fmt.Errorf("write archive checksum: %w", err)
	}
	if err := output.Close(); err != nil {
		return fmt.Errorf("close archive checksum: %w", err)
	}
	completed = true
	return nil
}

func publishPair(stagedArchive, stagedSidecar, archive, sidecar string) error {
	publishedArchive := false
	if err := os.Link(stagedArchive, archive); err != nil {
		return fmt.Errorf("publish archive without overwrite: %w", err)
	}
	publishedArchive = true
	if err := os.Link(stagedSidecar, sidecar); err != nil {
		if publishedArchive {
			_ = os.Remove(archive)
		}
		return fmt.Errorf("publish checksum without overwrite: %w", err)
	}
	return nil
}
