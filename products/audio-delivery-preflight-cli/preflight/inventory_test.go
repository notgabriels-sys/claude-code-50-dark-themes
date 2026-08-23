package preflight_test

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/preflight"
)

func TestInventoryUsesPortablePathsRecordsLinksAndFindsDuplicates(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "masters", "A.WAV"), []byte("same audio bytes"))
	mustWrite(t, filepath.Join(root, "masters", "copy.wav"), []byte("same audio bytes"))
	mustWrite(t, filepath.Join(root, "Artwork", "cover.PNG"), tinyPNG())
	mustWrite(t, filepath.Join(root, "notes.txt"), []byte("delivery note"))
	if runtime.GOOS != "windows" {
		if err := os.Symlink("masters", filepath.Join(root, "linked-masters")); err != nil {
			t.Fatal(err)
		}
	}

	inventory, err := preflight.InventoryDirectory(root)
	if err != nil {
		t.Fatal(err)
	}

	wantHash := sha256.Sum256([]byte("same audio bytes"))
	if got := entryByPath(t, inventory.Entries, "masters/A.WAV"); got.SHA256 != hex.EncodeToString(wantHash[:]) || got.ServiceClass != preflight.ServiceAudio {
		t.Fatalf("audio entry = %#v", got)
	}
	if got := entryByPath(t, inventory.Entries, "Artwork/cover.PNG"); got.ServiceClass != preflight.ServiceArtwork || got.Media == nil || got.Media.Width.Value != 1 || got.Media.Height.Value != 1 {
		t.Fatalf("image entry = %#v", got)
	}
	if got := entryByPath(t, inventory.Entries, "notes.txt"); got.ServiceClass != preflight.ServiceDocumentation {
		t.Fatalf("text entry = %#v", got)
	}
	if runtime.GOOS != "windows" {
		if got := entryByPath(t, inventory.Entries, "linked-masters"); got.Kind != preflight.EntrySymlink || got.LinkTarget != "masters" || got.SHA256 != "" {
			t.Fatalf("symlink entry = %#v", got)
		}
	}
	if len(inventory.DuplicateGroups) != 1 || inventory.DuplicateGroups[0].SHA256 != hex.EncodeToString(wantHash[:]) {
		t.Fatalf("duplicates = %#v", inventory.DuplicateGroups)
	}
	if got, want := inventory.DuplicateGroups[0].Paths, []string{"masters/A.WAV", "masters/copy.wav"}; !sameStrings(got, want) {
		t.Fatalf("duplicate paths = %q, want %q", got, want)
	}
}

func TestInventoryRejectsSymlinkRootAndNeverWritesSource(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "unchanged.flac")
	original := []byte("unchanged source")
	mustWrite(t, path, original)
	before, err := preflight.FingerprintSource(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := preflight.InventoryDirectory(root); err != nil {
		t.Fatal(err)
	}
	after, err := preflight.FingerprintSource(root)
	if err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatalf("source fingerprint changed: before %q after %q", before, after)
	}
	if got, err := os.ReadFile(path); err != nil || string(got) != string(original) {
		t.Fatalf("source content = %q, %v", got, err)
	}
	if runtime.GOOS != "windows" {
		linkedRoot := filepath.Join(t.TempDir(), "root-link")
		if err := os.Symlink(root, linkedRoot); err != nil {
			t.Fatal(err)
		}
		if _, err := preflight.InventoryDirectory(linkedRoot); err == nil {
			t.Fatal("InventoryDirectory accepted a symlink root")
		}
	}
}

func TestInventoryOutputIsDeterministicAndRejectsNonDirectory(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "z.txt"), []byte("z"))
	mustWrite(t, filepath.Join(root, "nested", "a.txt"), []byte("a"))
	first, err := preflight.InventoryDirectory(root)
	if err != nil {
		t.Fatal(err)
	}
	second, err := preflight.InventoryDirectory(root)
	if err != nil {
		t.Fatal(err)
	}
	firstJSON, _ := json.Marshal(first)
	secondJSON, _ := json.Marshal(second)
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("inventory is nondeterministic: %#v / %#v", first, second)
	}
	if _, err := preflight.InventoryDirectory(filepath.Join(root, "z.txt")); err == nil {
		t.Fatal("InventoryDirectory accepted a file root")
	}
}

func TestFingerprintDetectsRepresentedSourceMutations(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "main.txt")
	mustWrite(t, path, []byte("one"))
	baseline, err := preflight.FingerprintSource(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	changed, err := preflight.FingerprintSource(root)
	if err != nil {
		t.Fatal(err)
	}
	if baseline == changed {
		t.Fatal("permission mutation did not change fingerprint")
	}
}

func mustWrite(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func entryByPath(t *testing.T, entries []preflight.Entry, path string) preflight.Entry {
	t.Helper()
	for _, entry := range entries {
		if entry.Path == path {
			return entry
		}
	}
	t.Fatalf("entry %q not found in %#v", path, entries)
	return preflight.Entry{}
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}

func sameEntries(got, want []preflight.Entry) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i].Path != want[i].Path || got[i].SHA256 != want[i].SHA256 || got[i].Kind != want[i].Kind {
			return false
		}
	}
	return true
}

func sameDuplicateGroups(got, want []preflight.DuplicateGroup) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i].SHA256 != want[i].SHA256 || !sameStrings(got[i].Paths, want[i].Paths) {
			return false
		}
	}
	return true
}

func tinyPNG() []byte {
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
		0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54,
		0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f,
		0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d,
		0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
		0xae, 0x42, 0x60, 0x82,
	}
}
