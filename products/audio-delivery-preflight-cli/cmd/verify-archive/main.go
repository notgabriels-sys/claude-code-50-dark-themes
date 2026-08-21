// verify-archive validates a private candidate without extracting its members.
package main

import (
	"flag"
	"fmt"
	"os"
	"runtime"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/release"
	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version"
)

func main() {
	archive := flag.String("archive", "", "private candidate archive path")
	productVersion := flag.String("version", version.Current, "expected product version")
	platform := flag.String("platform", "", "expected platform")
	mode := flag.String("mode", string(release.PrivateCandidate), "expected archive mode")
	sourceRevision := flag.String("source-revision", "", "expected source revision")
	flag.Parse()
	if *archive == "" || *platform == "" || *sourceRevision == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: verify-archive -archive <path> -platform <target> -source-revision <git-revision> [-version <version>] [-mode private-candidate|customer-release]")
		os.Exit(2)
	}
	runtimeVersion := "unverified-cross-target"
	if runtime.GOOS+"-"+runtime.GOARCH == *platform {
		runtimeVersion = *productVersion
	}
	if err := release.VerifyArchive(*archive, release.Verification{Version: *productVersion, Platform: *platform, Mode: release.Mode(*mode), Provenance: release.Provenance{SourceRevision: *sourceRevision, Toolchain: version.Toolchain, RuntimeVersion: runtimeVersion}}); err != nil {
		fmt.Fprintln(os.Stderr, "private candidate verification failed:", err)
		os.Exit(1)
	}
	fmt.Println(verificationSuccessMessage(release.Mode(*mode), *archive))
}

func verificationSuccessMessage(mode release.Mode, archive string) string {
	label := "Private candidate"
	if mode == release.CustomerRelease {
		label = "Customer release"
	}
	return label + " archive verified: " + archive
}
