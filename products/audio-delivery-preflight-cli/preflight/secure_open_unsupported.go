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

func unsupportedPlatformError() error {
	return fmt.Errorf("safe descriptor-relative inventory is unsupported on this platform; version 1 supports macOS and Linux")
}

func identityFromInfo(fs.FileInfo) (fileIdentity, bool) { return fileIdentity{}, false }
func sameIdentity(fileIdentity, fileIdentity) bool      { return false }
func openRoot(string) (*os.File, fileIdentity, error) {
	return nil, fileIdentity{}, unsupportedPlatformError()
}
func verifyRootPath(string, fileIdentity) error {
	return unsupportedPlatformError()
}
func statOpenedFile(*os.File) (fs.FileInfo, fileIdentity, error) {
	return nil, fileIdentity{}, unsupportedPlatformError()
}
func statChild(*os.File, string, fs.FileInfo) (childSnapshot, error) {
	return childSnapshot{}, unsupportedPlatformError()
}
func readDirectory(*os.File) ([]fs.FileInfo, error) {
	return nil, unsupportedPlatformError()
}
func openChild(*os.File, string, bool) (*os.File, error) {
	return nil, unsupportedPlatformError()
}
func readLink(*os.File, string) (string, error) {
	return "", unsupportedPlatformError()
}
func isSymlink(fs.FileInfo, fileIdentity) bool { return false }
