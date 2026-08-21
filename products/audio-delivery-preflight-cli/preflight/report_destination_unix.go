//go:build darwin || linux

package preflight

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

func canonicalReportDestination(path string) (string, error) {
	if path == "" {
		return "", errUnsafeReportPath
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("make report destination absolute: %w", err)
	}
	clean := filepath.Clean(abs)
	if filepath.Base(clean) == "." || filepath.Base(clean) == ".." {
		return "", errUnsafeReportPath
	}
	return clean, nil
}

func reportDestinationAbsent(path string) error {
	parent, name, err := openReportParent(path)
	if err != nil {
		return err
	}
	defer parent.Close()
	var stat unix.Stat_t
	err = unix.Fstatat(int(parent.Fd()), name, &stat, unix.AT_SYMLINK_NOFOLLOW)
	if err == nil {
		return fmt.Errorf("report destination already exists")
	}
	if !errors.Is(err, unix.ENOENT) {
		return fmt.Errorf("check report destination: %w", err)
	}
	return nil
}

func writeNewReport(path string, data []byte) error {
	parent, name, err := openReportParent(path)
	if err != nil {
		return err
	}
	defer parent.Close()
	fd, err := unix.Openat(int(parent.Fd()), name, unix.O_WRONLY|unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0o644)
	if err != nil {
		return fmt.Errorf("create new report: %w", err)
	}
	file := os.NewFile(uintptr(fd), name)
	defer file.Close()
	if _, err := file.Write(data); err != nil {
		return fmt.Errorf("write report: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync report: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close report: %w", err)
	}
	return nil
}

func openReportParent(path string) (*os.File, string, error) {
	clean := filepath.Clean(path)
	if !filepath.IsAbs(clean) {
		return nil, "", errUnsafeReportPath
	}
	parts := strings.Split(strings.TrimPrefix(clean, string(filepath.Separator)), string(filepath.Separator))
	if len(parts) == 0 || parts[len(parts)-1] == "" {
		return nil, "", errUnsafeReportPath
	}
	name := parts[len(parts)-1]
	if name == "." || name == ".." || strings.ContainsRune(name, 0) {
		return nil, "", errUnsafeReportPath
	}
	fd, err := unix.Open(string(filepath.Separator), unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, "", err
	}
	parent := os.NewFile(uintptr(fd), string(filepath.Separator))
	for _, component := range parts[:len(parts)-1] {
		if component == "" || component == "." || component == ".." || strings.ContainsRune(component, 0) {
			parent.Close()
			return nil, "", errUnsafeReportPath
		}
		childFD, err := unix.Openat(int(parent.Fd()), component, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
		if err != nil {
			parent.Close()
			return nil, "", fmt.Errorf("open report destination parent without following links: %w", err)
		}
		child := os.NewFile(uintptr(childFD), component)
		if err := parent.Close(); err != nil {
			child.Close()
			return nil, "", err
		}
		parent = child
	}
	return parent, name, nil
}
