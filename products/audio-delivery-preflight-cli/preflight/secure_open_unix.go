//go:build darwin || linux

package preflight

import (
	"fmt"
	"io"
	"io/fs"
	"os"

	"golang.org/x/sys/unix"
)

type fileIdentity struct {
	dev, ino            uint64
	rawMode             uint32
	size                int64
	mtimeSec, mtimeNsec int64
}

func identityFromUnixStat(stat *unix.Stat_t) fileIdentity {
	return fileIdentity{
		dev:       uint64(stat.Dev),
		ino:       uint64(stat.Ino),
		rawMode:   uint32(stat.Mode),
		size:      stat.Size,
		mtimeSec:  stat.Mtim.Sec,
		mtimeNsec: stat.Mtim.Nsec,
	}
}

func sameIdentity(a, b fileIdentity) bool {
	return a.dev == b.dev && a.ino == b.ino && a.rawMode == b.rawMode && a.size == b.size && a.mtimeSec == b.mtimeSec && a.mtimeNsec == b.mtimeNsec
}

func openRoot(root string) (*os.File, fileIdentity, error) {
	info, err := os.Lstat(root)
	if err != nil {
		return nil, fileIdentity{}, err
	}
	expected, ok := identityFromInfo(info)
	if !ok || !info.IsDir() || info.Mode()&fs.ModeSymlink != 0 {
		return nil, fileIdentity{}, fmt.Errorf("unsafe inventory root")
	}
	fd, err := unix.Open(root, unix.O_RDONLY|unix.O_DIRECTORY|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0)
	if err != nil {
		return nil, fileIdentity{}, err
	}
	file := os.NewFile(uintptr(fd), root)
	_, actual, err := statOpenedFile(file)
	if err != nil || !sameIdentity(expected, actual) {
		file.Close()
		return nil, fileIdentity{}, fmt.Errorf("inventory root changed during open: %w", err)
	}
	return file, actual, nil
}

func verifyRootPath(root string, expected fileIdentity) error {
	file, actual, err := openRoot(root)
	if err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if !sameIdentity(expected, actual) {
		return fmt.Errorf("root identity changed")
	}
	return nil
}

func statOpenedFile(file *os.File) (fs.FileInfo, fileIdentity, error) {
	info, err := file.Stat()
	if err != nil {
		return nil, fileIdentity{}, err
	}
	identity, ok := identityFromInfo(info)
	if !ok {
		return nil, fileIdentity{}, fmt.Errorf("file identity is unavailable")
	}
	return info, identity, nil
}

func statChild(dir *os.File, name string, listed fs.FileInfo) (childSnapshot, error) {
	listedIdentity, ok := identityFromInfo(listed)
	if !ok {
		return childSnapshot{}, fmt.Errorf("cannot identify %q", name)
	}
	var stat unix.Stat_t
	if err := unix.Fstatat(int(dir.Fd()), name, &stat, unix.AT_SYMLINK_NOFOLLOW); err != nil {
		return childSnapshot{}, err
	}
	actual := identityFromUnixStat(&stat)
	if !sameIdentity(listedIdentity, actual) {
		return childSnapshot{}, fmt.Errorf("source changed while identifying %q", name)
	}
	return childSnapshot{info: listed, identity: actual}, nil
}

func readDirectory(dir *os.File) ([]fs.FileInfo, error) {
	if _, err := dir.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	return dir.Readdir(-1)
}

func openChild(dir *os.File, name string, directory bool) (*os.File, error) {
	flags := unix.O_RDONLY | unix.O_NOFOLLOW | unix.O_CLOEXEC | unix.O_NONBLOCK
	if directory {
		flags |= unix.O_DIRECTORY
	}
	fd, err := unix.Openat(int(dir.Fd()), name, flags, 0)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), name), nil
}

func readLink(dir *os.File, name string) (string, error) {
	buffer := make([]byte, 4096)
	n, err := unix.Readlinkat(int(dir.Fd()), name, buffer)
	if err != nil {
		return "", err
	}
	if n == len(buffer) {
		return "", fmt.Errorf("symlink target is too long")
	}
	return string(buffer[:n]), nil
}

func isSymlink(info fs.FileInfo, _ fileIdentity) bool { return info.Mode()&fs.ModeSymlink != 0 }
