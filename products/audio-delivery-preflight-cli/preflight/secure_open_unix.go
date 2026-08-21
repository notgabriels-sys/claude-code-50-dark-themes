//go:build darwin || linux

package preflight

import (
	"fmt"
	"io/fs"
	"os"
	"syscall"

	"golang.org/x/sys/unix"
)

type fileIdentity struct {
	dev, ino            uint64
	mode                fs.FileMode
	size                int64
	mtimeSec, mtimeNsec int64
}

func identityFromInfo(info fs.FileInfo) (fileIdentity, bool) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fileIdentity{}, false
	}
	modified := info.ModTime()
	return fileIdentity{dev: uint64(stat.Dev), ino: uint64(stat.Ino), mode: info.Mode(), size: info.Size(), mtimeSec: modified.Unix(), mtimeNsec: int64(modified.Nanosecond())}, true
}
func sameIdentity(a, b fileIdentity) bool {
	return a.dev == b.dev && a.ino == b.ino && a.mode == b.mode && a.size == b.size && a.mtimeSec == b.mtimeSec && a.mtimeNsec == b.mtimeNsec
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
	f := os.NewFile(uintptr(fd), root)
	actual, ok := identityFromInfo(mustStat(f))
	if !ok || !sameIdentity(expected, actual) {
		f.Close()
		return nil, fileIdentity{}, fmt.Errorf("inventory root changed during open")
	}
	return f, actual, nil
}
func mustStat(f *os.File) fs.FileInfo {
	info, err := f.Stat()
	if err != nil {
		panic(err)
	}
	return info
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
