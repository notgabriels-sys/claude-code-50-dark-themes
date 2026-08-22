//go:build darwin || linux

package preflight_test

import (
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/preflight"
)

func TestInventoryRecordsFIFOWithoutOpeningIt(t *testing.T) {
	root := t.TempDir()
	fifo := filepath.Join(root, "blocked.wav")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}
	result := make(chan struct {
		inventory preflight.Inventory
		err       error
	}, 1)
	go func() {
		inventory, err := preflight.InventoryDirectory(root)
		result <- struct {
			inventory preflight.Inventory
			err       error
		}{inventory, err}
	}()
	select {
	case got := <-result:
		if got.err != nil {
			t.Fatal(got.err)
		}
		if entryByPath(t, got.inventory.Entries, "blocked.wav").Kind != preflight.EntrySpecial {
			t.Fatalf("FIFO was not recorded as special: %#v", got.inventory)
		}
	case <-time.After(time.Second):
		t.Fatal("inventory blocked while handling FIFO")
	}
}
