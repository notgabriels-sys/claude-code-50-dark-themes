// verify-archive validates a private candidate without extracting its members.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/release"
)

func main() {
	archive := flag.String("archive", "", "private candidate archive path")
	version := flag.String("version", "1.0.0", "expected product version")
	platform := flag.String("platform", "", "expected platform")
	flag.Parse()
	if *archive == "" || *platform == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: verify-archive -archive <path> -platform <darwin-arm64|darwin-amd64|linux-amd64> [-version <version>]")
		os.Exit(2)
	}
	if err := release.VerifyArchive(*archive, release.Verification{Version: *version, Platform: *platform}); err != nil {
		fmt.Fprintln(os.Stderr, "private candidate verification failed:", err)
		os.Exit(1)
	}
	fmt.Println("Private candidate archive verified:", *archive)
}
