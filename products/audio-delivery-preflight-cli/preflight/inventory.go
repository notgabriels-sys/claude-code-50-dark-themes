// Package preflight inventories an audio-delivery tree without changing it.
package preflight

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const hashBufferSize = 128 * 1024

// EntryKind describes an object found below an inventory root.
type EntryKind string

const (
	EntryFile      EntryKind = "file"
	EntryDirectory EntryKind = "directory"
	EntrySymlink   EntryKind = "symlink"
	EntrySpecial   EntryKind = "special"
)

// ServiceClass is a conservative classification based on a file extension.
type ServiceClass string

const (
	ServiceAudio         ServiceClass = "audio"
	ServiceArtwork       ServiceClass = "artwork"
	ServiceMetadata      ServiceClass = "metadata"
	ServiceDocumentation ServiceClass = "documentation"
	ServiceArchive       ServiceClass = "archive"
	ServiceOther         ServiceClass = "other"
)

// Measurement is deliberately explicit: an absent value is not a zero value.
type Measurement[T any] struct {
	Available bool `json:"available"`
	Value     T    `json:"value,omitempty"`
}

// MediaEvidence contains only measurements which a bounded parser can support.
type MediaEvidence struct {
	Supported   bool                 `json:"supported"`
	Format      string               `json:"format"`
	Container   string               `json:"container,omitempty"`
	Encoding    Measurement[string]  `json:"encoding"`
	Channels    Measurement[int]     `json:"channels"`
	SampleRate  Measurement[int]     `json:"sample_rate"`
	BitDepth    Measurement[int]     `json:"bit_depth"`
	Duration    Measurement[float64] `json:"duration_seconds"`
	Width       Measurement[int]     `json:"width"`
	Height      Measurement[int]     `json:"height"`
	AspectRatio Measurement[float64] `json:"aspect_ratio"`
	HasAlpha    Measurement[bool]    `json:"has_alpha"`
	ColorModel  Measurement[string]  `json:"color_model"`
	Readable    Measurement[bool]    `json:"readable"`
	Unavailable string               `json:"unavailable_reason,omitempty"`
}

// Entry is a single source-tree object. Path is always slash-separated and root-relative.
type Entry struct {
	Path         string         `json:"path"`
	Kind         EntryKind      `json:"kind"`
	Size         int64          `json:"size"`
	Mode         fs.FileMode    `json:"mode"`
	SHA256       string         `json:"sha256,omitempty"`
	LinkTarget   string         `json:"link_target,omitempty"`
	ServiceClass ServiceClass   `json:"service_class"`
	Media        *MediaEvidence `json:"media,omitempty"`
}

// DuplicateGroup lists two or more ordinary files with identical SHA-256 values.
type DuplicateGroup struct {
	SHA256 string   `json:"sha256"`
	Paths  []string `json:"paths"`
}

// Inventory is a deterministic, read-only record of a delivery source tree.
type Inventory struct {
	Entries         []Entry          `json:"entries"`
	DuplicateGroups []DuplicateGroup `json:"duplicate_groups"`
	Fingerprint     string           `json:"fingerprint"`
}

// inventoryHooks provides deterministic synchronization points for adversarial tests.
// Production callers always use the zero value.
type inventoryHooks struct {
	beforeOpen                func(string, EntryKind) error
	afterFileSnapshot         func(string) error
	afterSymlinkRead          func(string) error
	beforeDirectoryFinalCheck func(string) error
	statOpened                func(*os.File) (fs.FileInfo, fileIdentity, error)
}

type childSnapshot struct {
	info     fs.FileInfo
	identity fileIdentity
}

type fileSnapshot struct {
	sha256 string
	media  []byte
}

// InventoryDirectory recursively inventories root. It rejects a symlink root and never
// traverses symlinks encountered in the tree.
func InventoryDirectory(root string) (Inventory, error) {
	return inventoryDirectoryWithHooks(root, inventoryHooks{})
}

func inventoryDirectoryWithHooks(root string, hooks inventoryHooks) (Inventory, error) {
	cleanRoot, err := checkedRoot(root)
	if err != nil {
		return Inventory{}, err
	}

	rootFile, rootIdentity, err := openRoot(cleanRoot)
	if err != nil {
		return Inventory{}, fmt.Errorf("open inventory root: %w", err)
	}
	defer rootFile.Close()
	entries := make([]Entry, 0)
	hashes := make(map[string][]string)
	err = inventoryDirectory(rootFile, rootIdentity, "", &entries, hashes, hooks)
	if err != nil {
		return Inventory{}, err
	}
	if err := verifyRootPath(cleanRoot, rootIdentity); err != nil {
		return Inventory{}, fmt.Errorf("inventory root changed during scan: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	duplicates := duplicateGroups(hashes)
	return Inventory{Entries: entries, DuplicateGroups: duplicates, Fingerprint: fingerprint(entries)}, nil
}

func inventoryDirectory(dir *os.File, expectedDirectory fileIdentity, prefix string, entries *[]Entry, hashes map[string][]string, hooks inventoryHooks) error {
	children, directoryIdentity, err := stableDirectorySnapshot(dir, prefix, hooks)
	if err != nil {
		return err
	}
	if !sameIdentity(expectedDirectory, directoryIdentity) {
		return fmt.Errorf("source changed while enumerating directory %q", displayPath(prefix))
	}
	for _, childSnapshot := range children {
		info := childSnapshot.info
		expected := childSnapshot.identity
		name := info.Name()
		if name == "." || name == ".." || strings.ContainsRune(name, filepath.Separator) {
			return errors.New("unsafe directory entry name")
		}
		rel := name
		if prefix != "" {
			rel = prefix + "/" + name
		}
		entry := Entry{Path: rel, Size: info.Size(), Mode: info.Mode(), ServiceClass: classifyServiceFile(rel)}
		if isSymlink(info, expected) {
			target, err := readLink(dir, name)
			if err != nil {
				return fmt.Errorf("source changed while reading symlink %q: %w", rel, err)
			}
			if hooks.afterSymlinkRead != nil {
				if err := hooks.afterSymlinkRead(rel); err != nil {
					return fmt.Errorf("after symlink read %q: %w", rel, err)
				}
			}
			afterRead, err := statChild(dir, name, info)
			if err != nil || !sameIdentity(expected, afterRead.identity) {
				return fmt.Errorf("source changed while reading symlink %q", rel)
			}
			confirmedTarget, err := readLink(dir, name)
			if err != nil || confirmedTarget != target {
				return fmt.Errorf("source changed while reading symlink %q", rel)
			}
			confirmed, err := statChild(dir, name, info)
			if err != nil || !sameIdentity(expected, confirmed.identity) {
				return fmt.Errorf("source changed while reading symlink %q", rel)
			}
			entry.Kind = EntrySymlink
			entry.LinkTarget = target
			*entries = append(*entries, entry)
			continue
		}
		if info.IsDir() {
			if hooks.beforeOpen != nil {
				if err := hooks.beforeOpen(rel, EntryDirectory); err != nil {
					return fmt.Errorf("before opening directory %q: %w", rel, err)
				}
			}
			child, err := openChild(dir, name, true)
			if err != nil {
				return fmt.Errorf("open directory %q: %w", rel, err)
			}
			_, actual, err := statOpened(child, hooks)
			if err != nil || !sameIdentity(expected, actual) {
				child.Close()
				return fmt.Errorf("source changed while opening directory %q: %w", rel, err)
			}
			entry.Kind = EntryDirectory
			*entries = append(*entries, entry)
			err = inventoryDirectory(child, actual, rel, entries, hashes, hooks)
			_, finalOpened, statErr := statOpened(child, hooks)
			closeErr := child.Close()
			if err != nil {
				return err
			}
			if statErr != nil || !sameIdentity(actual, finalOpened) {
				return fmt.Errorf("source changed while reading directory %q: %w", rel, statErr)
			}
			if closeErr != nil {
				return fmt.Errorf("close directory %q: %w", rel, closeErr)
			}
			pathFinal, err := statChild(dir, name, info)
			if err != nil || !sameIdentity(expected, pathFinal.identity) {
				return fmt.Errorf("source changed while reading directory %q", rel)
			}
			continue
		}
		if !info.Mode().IsRegular() {
			entry.Kind = EntrySpecial
			*entries = append(*entries, entry)
			continue
		}
		if hooks.beforeOpen != nil {
			if err := hooks.beforeOpen(rel, EntryFile); err != nil {
				return fmt.Errorf("before opening file %q: %w", rel, err)
			}
		}
		file, err := openChild(dir, name, false)
		if err != nil {
			return fmt.Errorf("open file %q: %w", rel, err)
		}
		_, actual, err := statOpened(file, hooks)
		if err != nil || !sameIdentity(expected, actual) {
			file.Close()
			return fmt.Errorf("source changed while opening file %q: %w", rel, err)
		}
		entry.Kind = EntryFile
		snapshot, err := snapshotFile(file)
		if err != nil {
			file.Close()
			return fmt.Errorf("hash %q: %w", rel, err)
		}
		if hooks.afterFileSnapshot != nil {
			if err := hooks.afterFileSnapshot(rel); err != nil {
				file.Close()
				return fmt.Errorf("after file snapshot %q: %w", rel, err)
			}
		}
		_, afterSnapshot, statErr := statOpened(file, hooks)
		if statErr != nil || !sameIdentity(actual, afterSnapshot) {
			file.Close()
			return fmt.Errorf("source changed while reading file %q: %w", rel, statErr)
		}
		if err := verifyFileSnapshot(file, snapshot.sha256); err != nil {
			file.Close()
			return fmt.Errorf("source changed while reading file %q: %w", rel, err)
		}
		_, final, statErr := statOpened(file, hooks)
		closeErr := file.Close()
		if statErr != nil || !sameIdentity(actual, final) {
			return fmt.Errorf("source changed while reading file %q", rel)
		}
		if closeErr != nil {
			return fmt.Errorf("close file %q: %w", rel, closeErr)
		}
		pathFinal, err := statChild(dir, name, info)
		if err != nil || !sameIdentity(expected, pathFinal.identity) {
			return fmt.Errorf("source changed while reading file %q", rel)
		}
		entry.SHA256 = snapshot.sha256
		entry.Media = inspectMedia(bytes.NewReader(snapshot.media), rel, entry.Size)
		hashes[entry.SHA256] = append(hashes[entry.SHA256], rel)
		*entries = append(*entries, entry)
	}
	if hooks.beforeDirectoryFinalCheck != nil {
		if err := hooks.beforeDirectoryFinalCheck(prefix); err != nil {
			return fmt.Errorf("before final directory check %q: %w", displayPath(prefix), err)
		}
	}
	finalChildren, finalIdentity, err := stableDirectorySnapshot(dir, prefix, hooks)
	if err != nil || !sameIdentity(directoryIdentity, finalIdentity) || !sameChildSnapshots(children, finalChildren) {
		return fmt.Errorf("source changed while reading directory %q", displayPath(prefix))
	}
	return nil
}

func stableDirectorySnapshot(dir *os.File, prefix string, hooks inventoryHooks) ([]childSnapshot, fileIdentity, error) {
	_, before, err := statOpened(dir, hooks)
	if err != nil {
		return nil, fileIdentity{}, fmt.Errorf("stat directory %q: %w", displayPath(prefix), err)
	}
	first, err := readChildSnapshots(dir)
	if err != nil {
		return nil, fileIdentity{}, fmt.Errorf("read directory %q: %w", displayPath(prefix), err)
	}
	_, middle, err := statOpened(dir, hooks)
	if err != nil {
		return nil, fileIdentity{}, fmt.Errorf("stat directory %q: %w", displayPath(prefix), err)
	}
	second, err := readChildSnapshots(dir)
	if err != nil {
		return nil, fileIdentity{}, fmt.Errorf("re-read directory %q: %w", displayPath(prefix), err)
	}
	_, after, err := statOpened(dir, hooks)
	if err != nil {
		return nil, fileIdentity{}, fmt.Errorf("stat directory %q: %w", displayPath(prefix), err)
	}
	if !sameIdentity(before, middle) || !sameIdentity(middle, after) || !sameChildSnapshots(first, second) {
		return nil, fileIdentity{}, fmt.Errorf("source changed while snapshotting directory %q", displayPath(prefix))
	}
	return second, after, nil
}

func readChildSnapshots(dir *os.File) ([]childSnapshot, error) {
	children, err := readDirectory(dir)
	if err != nil {
		return nil, err
	}
	sort.Slice(children, func(i, j int) bool { return children[i].Name() < children[j].Name() })
	result := make([]childSnapshot, 0, len(children))
	for _, info := range children {
		name := info.Name()
		if name == "." || name == ".." || strings.ContainsAny(name, `/\\`) {
			return nil, errors.New("unsafe directory entry name")
		}
		child, err := statChild(dir, name, info)
		if err != nil {
			return nil, err
		}
		result = append(result, child)
	}
	return result, nil
}

func sameChildSnapshots(first, second []childSnapshot) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index].info.Name() != second[index].info.Name() || !sameIdentity(first[index].identity, second[index].identity) {
			return false
		}
	}
	return true
}

func statOpened(file *os.File, hooks inventoryHooks) (fs.FileInfo, fileIdentity, error) {
	if hooks.statOpened != nil {
		return hooks.statOpened(file)
	}
	return statOpenedFile(file)
}

func displayPath(path string) string {
	if path == "" {
		return "."
	}
	return path
}

// FingerprintSource returns a deterministic SHA-256 fingerprint of the tree's contents,
// entry types, portable names, and link targets. It is suitable for before/after checks.
func FingerprintSource(root string) (string, error) {
	inventory, err := InventoryDirectory(root)
	if err != nil {
		return "", err
	}
	return inventory.Fingerprint, nil
}

// PortablePath returns a slash-separated path below root and rejects traversal outside it.
func PortablePath(root, path string) (string, error) {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("make root absolute: %w", err)
	}
	pathAbs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("make path absolute: %w", err)
	}
	rel, err := filepath.Rel(filepath.Clean(rootAbs), filepath.Clean(pathAbs))
	if err != nil {
		return "", fmt.Errorf("find relative path: %w", err)
	}
	if rel == "." || rel == "" || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("path %q is outside inventory root", path)
	}
	return filepath.ToSlash(rel), nil
}

func checkedRoot(root string) (string, error) {
	if root == "" {
		return "", errors.New("inventory root is required")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("make root absolute: %w", err)
	}
	info, err := os.Lstat(abs)
	if err != nil {
		return "", fmt.Errorf("stat inventory root: %w", err)
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return "", errors.New("inventory root must not be a symbolic link")
	}
	if !info.IsDir() {
		return "", errors.New("inventory root must be a directory")
	}
	return filepath.Clean(abs), nil
}

func snapshotFile(f *os.File) (fileSnapshot, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return fileSnapshot{}, err
	}
	h := sha256.New()
	capture := &boundedWriter{remaining: maxInspectionBytes}
	if _, err := io.CopyBuffer(io.MultiWriter(h, capture), f, make([]byte, hashBufferSize)); err != nil {
		return fileSnapshot{}, err
	}
	return fileSnapshot{sha256: hex.EncodeToString(h.Sum(nil)), media: capture.bytes}, nil
}

func verifyFileSnapshot(f *os.File, want string) error {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	h := sha256.New()
	if _, err := io.CopyBuffer(h, f, make([]byte, hashBufferSize)); err != nil {
		return err
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		return errors.New("file content changed during inventory")
	}
	return nil
}

type boundedWriter struct {
	bytes     []byte
	remaining int
}

func (writer *boundedWriter) Write(value []byte) (int, error) {
	if writer.remaining > 0 {
		count := len(value)
		if count > writer.remaining {
			count = writer.remaining
		}
		writer.bytes = append(writer.bytes, value[:count]...)
		writer.remaining -= count
	}
	return len(value), nil
}

func duplicateGroups(hashes map[string][]string) []DuplicateGroup {
	keys := make([]string, 0, len(hashes))
	for sum, paths := range hashes {
		if len(paths) > 1 {
			keys = append(keys, sum)
		}
	}
	sort.Strings(keys)
	groups := make([]DuplicateGroup, 0, len(keys))
	for _, sum := range keys {
		paths := append([]string(nil), hashes[sum]...)
		sort.Strings(paths)
		groups = append(groups, DuplicateGroup{SHA256: sum, Paths: paths})
	}
	return groups
}

func fingerprint(entries []Entry) string {
	h := sha256.New()
	for _, entry := range entries {
		for _, value := range []string{entry.Path, string(entry.Kind), entry.SHA256, entry.LinkTarget, string(entry.ServiceClass)} {
			binary.Write(h, binary.BigEndian, uint32(len(value)))
			h.Write([]byte(value))
		}
		binary.Write(h, binary.BigEndian, entry.Size)
		binary.Write(h, binary.BigEndian, uint32(entry.Mode))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func classifyServiceFile(path string) ServiceClass {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".wav", ".rf64", ".aif", ".aiff", ".aifc", ".flac", ".mp3", ".m4a", ".mp4":
		return ServiceAudio
	case ".png", ".jpg", ".jpeg", ".gif", ".tif", ".tiff", ".heic", ".heif", ".webp":
		return ServiceArtwork
	case ".json", ".xml", ".csv", ".cue", ".m3u", ".m3u8":
		return ServiceMetadata
	case ".txt", ".md", ".pdf", ".rtf", ".doc", ".docx":
		return ServiceDocumentation
	case ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar":
		return ServiceArchive
	default:
		return ServiceOther
	}
}
