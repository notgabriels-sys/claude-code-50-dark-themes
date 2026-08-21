//go:build darwin || linux

package preflight

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"

	"golang.org/x/sys/unix"
)

// ReportDestinationError identifies a deterministic user-supplied report-path
// problem. Callers map it to the documented invalid-configuration exit code.
type ReportDestinationError struct {
	Reason string
	Err    error
}

func (err *ReportDestinationError) Error() string {
	if err.Err != nil {
		return err.Reason + ": " + err.Err.Error()
	}
	return err.Reason
}

func (err *ReportDestinationError) Unwrap() error { return err.Err }

func IsReportDestinationConfigurationError(err error) bool {
	var destination *ReportDestinationError
	return errors.As(err, &destination)
}

func destinationConfigurationError(reason string, err error) error {
	return &ReportDestinationError{Reason: reason, Err: err}
}

type reportFormat uint8

const (
	reportHTML reportFormat = iota
	reportJSON
	reportChecksums
)

type preparedReportDestination struct {
	format reportFormat
	path   string
	name   string
	parent *os.File
}

// PreparedReportDestinations owns directory descriptors opened without link
// traversal. It is deliberately prepared before a scan and closed afterwards.
type PreparedReportDestinations struct {
	destinations []preparedReportDestination
}

// PrepareReportDestinations validates report configuration without touching the
// selected root. Any report path lexically inside sourceRoot is rejected so an
// export cannot invalidate the just-created source snapshot.
func PrepareReportDestinations(sourceRoot string, destinations ReportDestinations) (*PreparedReportDestinations, error) {
	root, err := canonicalSourceRoot(sourceRoot)
	if err != nil {
		return nil, destinationConfigurationError("selected source root is not a safe report boundary", err)
	}
	requested := []struct {
		format reportFormat
		path   string
	}{
		{reportHTML, destinations.HTML},
		{reportJSON, destinations.JSON},
		{reportChecksums, destinations.Checksums},
	}
	prepared := &PreparedReportDestinations{}
	seen := make(map[string]bool)
	for _, request := range requested {
		if request.path == "" {
			continue
		}
		path, err := canonicalReportDestination(request.path)
		if err != nil {
			prepared.Close()
			return nil, destinationConfigurationError("report destination is unsafe", err)
		}
		if root != "" && pathIsWithin(root, path) {
			prepared.Close()
			return nil, destinationConfigurationError("report destination must be outside the selected source tree", nil)
		}
		if seen[path] {
			prepared.Close()
			return nil, destinationConfigurationError("report destinations must be distinct", nil)
		}
		seen[path] = true
		parent, name, err := openReportParent(path)
		if err != nil {
			prepared.Close()
			return nil, destinationConfigurationError("report destination parent is unsafe or unavailable", err)
		}
		if err := reportDestinationAbsentAt(parent, name); err != nil {
			parent.Close()
			prepared.Close()
			return nil, destinationConfigurationError("report destination must be absent", err)
		}
		prepared.destinations = append(prepared.destinations, preparedReportDestination{format: request.format, path: path, name: name, parent: parent})
	}
	return prepared, nil
}

func (prepared *PreparedReportDestinations) Close() error {
	var first error
	for index := range prepared.destinations {
		if parent := prepared.destinations[index].parent; parent != nil {
			prepared.destinations[index].parent = nil
			if err := parent.Close(); err != nil && first == nil {
				first = err
			}
		}
	}
	return first
}

// Write publishes all prepared reports or removes every artifact it created.
// Final publication uses linkat on the held parent descriptor, which is atomic
// and fails instead of replacing an externally-created destination.
func (prepared *PreparedReportDestinations) Write(report Report) error {
	return writePreparedReportsWithHooks(prepared, report, reportWriteHooks{})
}

type reportWriteHooks struct {
	afterPrepared func() error
	beforePublish func(index int) error
	tempName      func(index int) string
	writeTemp     func(*os.File, []byte) error
}

type temporaryReport struct {
	destination *preparedReportDestination
	name        string
	identity    fileIdentity
	published   bool
}

var reportTemporarySequence uint64

func writePreparedReportsWithHooks(prepared *PreparedReportDestinations, report Report, hooks reportWriteHooks) (result error) {
	if hooks.afterPrepared != nil {
		if err := hooks.afterPrepared(); err != nil {
			return fmt.Errorf("report destination changed before writing: %w", err)
		}
	}
	temporaries := make([]temporaryReport, 0, len(prepared.destinations))
	defer func() {
		if result != nil {
			for index := len(temporaries) - 1; index >= 0; index-- {
				item := temporaries[index]
				if item.published {
					removeIfIdentity(item.destination.parent, item.destination.name, item.identity)
				}
				removeIfIdentity(item.destination.parent, item.name, item.identity)
			}
		}
	}()
	for index := range prepared.destinations {
		destination := &prepared.destinations[index]
		if destination.parent == nil {
			return fmt.Errorf("prepared report destination is closed")
		}
		data, err := reportData(report, destination.format)
		if err != nil {
			return err
		}
		name := reportTemporaryName(index, hooks)
		file, identity, err := createTemporaryReport(destination.parent, name)
		if err != nil {
			return fmt.Errorf("create report temporary: %w", err)
		}
		item := temporaryReport{destination: destination, name: name, identity: identity}
		temporaries = append(temporaries, item)
		if hooks.writeTemp != nil {
			err = hooks.writeTemp(file, data)
		} else {
			_, err = file.Write(data)
		}
		if err == nil {
			err = file.Sync()
		}
		closeErr := file.Close()
		if err != nil {
			return fmt.Errorf("write report temporary: %w", err)
		}
		if closeErr != nil {
			return fmt.Errorf("close report temporary: %w", closeErr)
		}
	}
	for index := range temporaries {
		item := &temporaries[index]
		if hooks.beforePublish != nil {
			if err := hooks.beforePublish(index); err != nil {
				return fmt.Errorf("prepare report publication: %w", err)
			}
		}
		if err := unix.Linkat(int(item.destination.parent.Fd()), item.name, int(item.destination.parent.Fd()), item.destination.name, 0); err != nil {
			if errors.Is(err, unix.EEXIST) {
				return destinationConfigurationError("report destination became occupied during export", err)
			}
			return fmt.Errorf("publish report: %w", err)
		}
		item.published = true
		if err := unix.Unlinkat(int(item.destination.parent.Fd()), item.name, 0); err != nil {
			return fmt.Errorf("finalize report publication: %w", err)
		}
	}
	return nil
}

func reportData(report Report, format reportFormat) ([]byte, error) {
	switch format {
	case reportHTML:
		return []byte(HTMLReport(report)), nil
	case reportJSON:
		return JSONReport(report)
	case reportChecksums:
		text, err := ChecksumManifest(report)
		return []byte(text), err
	default:
		return nil, fmt.Errorf("unknown report format")
	}
}

func reportTemporaryName(index int, hooks reportWriteHooks) string {
	if hooks.tempName != nil {
		return hooks.tempName(index)
	}
	sequence := atomic.AddUint64(&reportTemporarySequence, 1)
	return fmt.Sprintf(".audio-preflight-%d-%d-%d.tmp", os.Getpid(), sequence, index)
}

func createTemporaryReport(parent *os.File, name string) (*os.File, fileIdentity, error) {
	if name == "" || strings.ContainsAny(name, "/\\") || name == "." || name == ".." {
		return nil, fileIdentity{}, fmt.Errorf("unsafe temporary report name")
	}
	fd, err := unix.Openat(int(parent.Fd()), name, unix.O_WRONLY|unix.O_CREAT|unix.O_EXCL|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0o644)
	if err != nil {
		return nil, fileIdentity{}, err
	}
	file := os.NewFile(uintptr(fd), name)
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, fileIdentity{}, err
	}
	identity, ok := identityFromInfo(info)
	if !ok {
		file.Close()
		return nil, fileIdentity{}, fmt.Errorf("temporary report identity is unavailable")
	}
	return file, identity, nil
}

func removeIfIdentity(parent *os.File, name string, expected fileIdentity) {
	if parent == nil {
		return
	}
	var stat unix.Stat_t
	if err := unix.Fstatat(int(parent.Fd()), name, &stat, unix.AT_SYMLINK_NOFOLLOW); err == nil && sameObject(expected, identityFromUnixStat(&stat)) {
		_ = unix.Unlinkat(int(parent.Fd()), name, 0)
	}
}

// Cleanup must not unlink a replacement created by another process. Size and
// mtime legitimately change while writing, so object identity is device/inode.
func sameObject(left, right fileIdentity) bool {
	return left.dev == right.dev && left.ino == right.ino
}

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

func canonicalSourceRoot(root string) (string, error) {
	if root == "" {
		return "", nil
	}
	return filepath.Abs(root)
}

func pathIsWithin(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func reportDestinationAbsentAt(parent *os.File, name string) error {
	var stat unix.Stat_t
	err := unix.Fstatat(int(parent.Fd()), name, &stat, unix.AT_SYMLINK_NOFOLLOW)
	if err == nil {
		return fs.ErrExist
	}
	if !errors.Is(err, unix.ENOENT) {
		return err
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
			return nil, "", err
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
