//go:build darwin

package preflight

import (
	"io/fs"
	"syscall"
)

func identityFromInfo(info fs.FileInfo) (fileIdentity, bool) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fileIdentity{}, false
	}
	return fileIdentity{
		dev:       uint64(stat.Dev),
		ino:       uint64(stat.Ino),
		rawMode:   uint32(stat.Mode),
		size:      stat.Size,
		mtimeSec:  stat.Mtimespec.Sec,
		mtimeNsec: stat.Mtimespec.Nsec,
	}, true
}
