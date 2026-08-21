// Package preflight inventories an audio-delivery tree without changing it.
package preflight

import (
	"crypto/sha256"
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

// InventoryDirectory recursively inventories root. It rejects a symlink root and never
// traverses symlinks encountered in the tree.
func InventoryDirectory(root string) (Inventory, error) {
	cleanRoot, err := checkedRoot(root)
	if err != nil {
		return Inventory{}, err
	}

	entries := make([]Entry, 0)
	hashes := make(map[string][]string)
	err = filepath.WalkDir(cleanRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk %q: %w", path, walkErr)
		}
		if path == cleanRoot {
			return nil
		}
		rel, err := PortablePath(cleanRoot, path)
		if err != nil {
			return err
		}
		info, err := d.Info()
		if err != nil {
			return fmt.Errorf("stat %q: %w", rel, err)
		}
		entry := Entry{Path: rel, Size: info.Size(), Mode: info.Mode(), ServiceClass: classifyServiceFile(rel)}
		switch {
		case d.Type()&fs.ModeSymlink != 0:
			target, err := os.Readlink(path)
			if err != nil {
				return fmt.Errorf("read symlink %q: %w", rel, err)
			}
			entry.Kind = EntrySymlink
			entry.LinkTarget = target
		case d.IsDir():
			entry.Kind = EntryDirectory
		default:
			entry.Kind = EntryFile
			entry.SHA256, err = sha256File(path)
			if err != nil {
				return fmt.Errorf("hash %q: %w", rel, err)
			}
			entry.Media = inspectMedia(path, rel)
			hashes[entry.SHA256] = append(hashes[entry.SHA256], rel)
		}
		entries = append(entries, entry)
		return nil
	})
	if err != nil {
		return Inventory{}, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	duplicates := duplicateGroups(hashes)
	return Inventory{Entries: entries, DuplicateGroups: duplicates, Fingerprint: fingerprint(entries)}, nil
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

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.CopyBuffer(h, f, make([]byte, hashBufferSize)); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
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
		// Length prefixes prevent ambiguous concatenation while keeping the result portable.
		fmt.Fprintf(h, "%d:%s\x00%d:%s\x00%d:%s\x00%d:%s\n", len(entry.Path), entry.Path, len(entry.Kind), entry.Kind, len(entry.SHA256), entry.SHA256, len(entry.LinkTarget), entry.LinkTarget)
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
