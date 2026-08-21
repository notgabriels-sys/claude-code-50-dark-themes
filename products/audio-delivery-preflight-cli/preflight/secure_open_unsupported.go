//go:build !darwin && !linux

package preflight

import (
	"fmt"
	"io/fs"
	"os"
)

// Unsupported platforms fail closed rather than using path-based opens that can follow
// a replacement link. Platform-specific handle-relative traversal is required first.
type fileIdentity struct{}

func identityFromInfo(fs.FileInfo) (fileIdentity, bool) { return fileIdentity{}, false }
func sameIdentity(fileIdentity, fileIdentity) bool      { return false }
func openRoot(string) (*os.File, fileIdentity, error) {
	return nil, fileIdentity{}, fmt.Errorf("safe descriptor-relative inventory is unsupported on this platform")
}
func openChild(*os.File, string, bool) (*os.File, error) {
	return nil, fmt.Errorf("safe descriptor-relative inventory is unsupported on this platform")
}
func readLink(*os.File, string) (string, error) {
	return "", fmt.Errorf("safe descriptor-relative inventory is unsupported on this platform")
}
func mustStat(*os.File) fs.FileInfo { return nil }
