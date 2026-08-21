package preflight_test

import (
	"path/filepath"
	"testing"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/preflight"
)

// A future regression that accepts a parseable header as a readable payload must
// fail this test. Required-role code consumes this positive evidence.
func TestTruncatedMediaNeverClaimsPositiveReadability(t *testing.T) {
	cases := []struct {
		name string
		file string
		body []byte
	}{
		{"WAV data header only", "main.wav", wavPCM()[:44]},
		{"AIFF common chunk only", "main.aiff", aiffPCM()},
		{"FLAC streaminfo only", "main.flac", flacStreamInfo()},
		{"PNG signature and IHDR only", "cover.png", tinyPNG()[:33]},
		{"JPEG header only", "cover.jpg", jpegConfig(t)[:20]},
		{"GIF logical screen only", "cover.gif", gifConfig()[:13]},
		{"TIFF IFD without pixel data", "cover.tiff", tiffConfig()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			mustWrite(t, filepath.Join(root, tc.file), tc.body)
			inventory, err := preflight.InventoryDirectory(root)
			if err != nil {
				t.Fatal(err)
			}
			media := entryByPath(t, inventory.Entries, tc.file).Media
			if media == nil || !media.Readable.Available || media.Readable.Value {
				t.Fatalf("truncated %s claimed positive readability: %#v", tc.file, media)
			}
		})
	}
}
