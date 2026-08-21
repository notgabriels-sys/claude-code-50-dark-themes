package preflight

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

func TestInventoryFailsClosedWhenRegularFileBecomesSymlink(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "main.wav")
	writeTestFile(t, path, []byte("original"))
	outside := filepath.Join(t.TempDir(), "outside.wav")
	writeTestFile(t, outside, []byte("outside"))

	_, err := inventoryDirectoryWithHooks(root, inventoryHooks{
		beforeOpen: func(portablePath string, kind EntryKind) error {
			if portablePath == "main.wav" && kind == EntryFile {
				if err := os.Remove(path); err != nil {
					return err
				}
				return os.Symlink(outside, path)
			}
			return nil
		},
	})
	if err == nil {
		t.Fatal("inventory accepted a regular file replaced by a symlink")
	}
}

func TestInventoryFailsClosedWhenDirectoryBecomesSymlink(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "masters")
	writeTestFile(t, filepath.Join(directory, "main.wav"), []byte("original"))
	outside := t.TempDir()
	writeTestFile(t, filepath.Join(outside, "outside.wav"), []byte("outside"))
	moved := filepath.Join(t.TempDir(), "moved-masters")

	_, err := inventoryDirectoryWithHooks(root, inventoryHooks{
		beforeOpen: func(portablePath string, kind EntryKind) error {
			if portablePath == "masters" && kind == EntryDirectory {
				if err := os.Rename(directory, moved); err != nil {
					return err
				}
				return os.Symlink(outside, directory)
			}
			return nil
		},
	})
	if err == nil {
		t.Fatal("inventory accepted a directory replaced by a symlink")
	}
}

func TestInventoryFailsClosedWhenOpenedDirectoryIsReplaced(t *testing.T) {
	root := t.TempDir()
	directory := filepath.Join(root, "masters")
	writeTestFile(t, filepath.Join(directory, "main.wav"), []byte("original"))
	moved := filepath.Join(t.TempDir(), "moved-masters")

	_, err := inventoryDirectoryWithHooks(root, inventoryHooks{
		beforeDirectoryFinalCheck: func(portablePath string) error {
			if portablePath != "masters" {
				return nil
			}
			if err := os.Rename(directory, moved); err != nil {
				return err
			}
			return os.Mkdir(directory, 0o755)
		},
	})
	if err == nil {
		t.Fatal("inventory accepted replacement of an opened directory")
	}
}

func TestInventoryFailsClosedWhenDirectoryEntryIsAdded(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "first.txt"), []byte("first"))

	_, err := inventoryDirectoryWithHooks(root, inventoryHooks{
		beforeDirectoryFinalCheck: func(portablePath string) error {
			if portablePath == "" {
				return os.WriteFile(filepath.Join(root, "late.txt"), []byte("late"), 0o644)
			}
			return nil
		},
	})
	if err == nil {
		t.Fatal("inventory silently omitted a file added during root enumeration")
	}
}

func TestInventoryFailsClosedWhenSymlinkTargetIsReplaced(t *testing.T) {
	root := t.TempDir()
	link := filepath.Join(root, "master-link")
	if err := os.Symlink("one.wav", link); err != nil {
		t.Fatal(err)
	}

	_, err := inventoryDirectoryWithHooks(root, inventoryHooks{
		afterSymlinkRead: func(portablePath string) error {
			if portablePath != "master-link" {
				return nil
			}
			if err := os.Remove(link); err != nil {
				return err
			}
			return os.Symlink("two.wav", link)
		},
	})
	if err == nil {
		t.Fatal("inventory accepted a symlink target replaced during read")
	}
}

func TestInventoryFailsClosedOnSameInodeContentMutationWithRestoredMtime(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "main.wav")
	writeTestFile(t, path, testWAVPCM())
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	originalMtime := info.ModTime()

	_, err = inventoryDirectoryWithHooks(root, inventoryHooks{
		afterFileSnapshot: func(portablePath string) error {
			if portablePath != "main.wav" {
				return nil
			}
			body := testWAVPCM()
			for index := range body {
				body[index] ^= 0xff
			}
			if err := os.WriteFile(path, body, 0o644); err != nil {
				return err
			}
			return os.Chtimes(path, originalMtime, originalMtime)
		},
	})
	if err == nil {
		t.Fatal("inventory accepted same-inode content mutation with restored mtime")
	}
}

func TestInventoryReturnsStatFailureWithoutPanicking(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "main.wav"), testWAVPCM())
	wantErr := errors.New("injected stat failure")
	calls := 0
	hooks := inventoryHooks{
		statOpened: func(file *os.File) (fs.FileInfo, fileIdentity, error) {
			calls++
			if calls == 2 {
				return nil, fileIdentity{}, wantErr
			}
			return statOpenedFile(file)
		},
	}

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("inventory panicked on stat failure: %v", recovered)
		}
	}()
	_, err := inventoryDirectoryWithHooks(root, hooks)
	if !errors.Is(err, wantErr) {
		t.Fatalf("inventory error = %v, want injected stat failure", err)
	}
}

func writeTestFile(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func testWAVPCM() []byte {
	return []byte{
		'R', 'I', 'F', 'F', 36, 0, 0, 0, 'W', 'A', 'V', 'E',
		'f', 'm', 't', ' ', 16, 0, 0, 0, 1, 0, 2, 0,
		0x80, 0xbb, 0, 0, 0, 0xca, 8, 0, 6, 0, 24, 0,
		'd', 'a', 't', 'a', 0, 0, 0, 0,
	}
}
