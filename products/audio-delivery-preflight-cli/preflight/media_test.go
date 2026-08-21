package preflight_test

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"math"
	"path/filepath"
	"testing"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/preflight"
)

func TestPortablePathRejectsTraversalOutsideRoot(t *testing.T) {
	root := t.TempDir()
	cases := []struct {
		name    string
		path    string
		want    string
		wantErr bool
	}{
		{name: "nested file", path: filepath.Join(root, "masters", "main.wav"), want: "masters/main.wav"},
		{name: "root itself", path: root, wantErr: true},
		{name: "parent traversal", path: filepath.Join(root, "..", "outside.wav"), wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := preflight.PortablePath(root, tc.path)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("PortablePath(%q) = %q, nil; want error", tc.path, got)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("PortablePath(%q) = %q, %v; want %q, nil", tc.path, got, err, tc.want)
			}
		})
	}
}

func TestMediaEvidenceUsesOnlyProvableMeasurements(t *testing.T) {
	cases := []struct {
		name  string
		file  string
		body  []byte
		check func(*testing.T, *preflight.MediaEvidence)
	}{
		{
			name: "WAV PCM", file: "main.wav", body: wavPCM(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "WAV" || !got.Encoding.Available || got.Encoding.Value != "PCM" || got.Channels.Value != 2 || got.SampleRate.Value != 48000 || got.BitDepth.Value != 24 || !got.Duration.Available || got.Duration.Value != 8.0/288000.0 {
					t.Fatalf("WAV evidence = %#v", got)
				}
			},
		},
		{
			name: "RF64 duration unavailable without ds64", file: "main.rf64", body: rf64WithoutDS64(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "RF64" || got.Duration.Available || !got.Channels.Available || got.Channels.Value != 2 {
					t.Fatalf("RF64 evidence = %#v", got)
				}
			},
		},
		{
			name: "AIFF PCM", file: "main.aiff", body: aiffPCM(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "AIFF" || got.Encoding.Value != "PCM" || got.Channels.Value != 2 || got.SampleRate.Value != 44100 || got.BitDepth.Value != 24 || got.Duration.Value != 1 {
					t.Fatalf("AIFF evidence = %#v", got)
				}
			},
		},
		{
			name: "FLAC streaminfo", file: "main.flac", body: flacStreamInfo(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "FLAC" || got.Encoding.Value != "FLAC" || got.Channels.Value != 2 || got.SampleRate.Value != 48000 || got.BitDepth.Value != 24 || got.Duration.Value != 2 {
					t.Fatalf("FLAC evidence = %#v", got)
				}
			},
		},
		{
			name: "MP3 no inferred duration", file: "main.mp3", body: mp3Frame(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "MP3" || got.Encoding.Value != "MPEG Layer III" || got.Duration.Available {
					t.Fatalf("MP3 evidence = %#v", got)
				}
			},
		},
		{
			name: "M4A AAC sample entry", file: "main.m4a", body: m4aAAC(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Container != "M4A" || got.Encoding.Value != "AAC" || got.SampleRate.Available || got.Duration.Available {
					t.Fatalf("M4A evidence = %#v", got)
				}
			},
		},
		{
			name: "PNG dimensions and alpha", file: "cover.png", body: tinyPNG(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Format != "PNG" || got.Width.Value != 1 || got.Height.Value != 1 || got.AspectRatio.Value != 1 || !got.HasAlpha.Available || !got.HasAlpha.Value {
					t.Fatalf("PNG evidence = %#v", got)
				}
			},
		},
		{
			name: "JPEG dimensions and no alpha", file: "cover.jpg", body: jpegConfig(t),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Format != "JPEG" || got.Width.Value != 3 || got.Height.Value != 2 || !got.HasAlpha.Available || got.HasAlpha.Value {
					t.Fatalf("JPEG evidence = %#v", got)
				}
			},
		},
		{
			name: "GIF dimensions", file: "cover.gif", body: gifConfig(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Format != "GIF" || got.Width.Value != 3 || got.Height.Value != 2 || got.HasAlpha.Available {
					t.Fatalf("GIF evidence = %#v", got)
				}
			},
		},
		{
			name: "TIFF dimensions", file: "cover.tiff", body: tiffConfig(),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Format != "TIFF" || got.Width.Value != 3 || got.Height.Value != 2 || got.AspectRatio.Value != 1.5 {
					t.Fatalf("TIFF evidence = %#v", got)
				}
			},
		},
		{
			name: "HEIC remains unsupported", file: "cover.heic", body: []byte("not decoded"),
			check: func(t *testing.T, got *preflight.MediaEvidence) {
				if got.Supported || got.Unavailable == "" {
					t.Fatalf("HEIC evidence = %#v", got)
				}
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			mustWrite(t, filepath.Join(root, tc.file), tc.body)
			inventory, err := preflight.InventoryDirectory(root)
			if err != nil {
				t.Fatal(err)
			}
			got := entryByPath(t, inventory.Entries, tc.file).Media
			if got == nil {
				t.Fatal("media evidence is nil")
			}
			tc.check(t, got)
		})
	}
}

func TestMalformedAndOversizedMediaAreUnavailableWithoutPanicking(t *testing.T) {
	cases := []struct {
		name string
		file string
		body []byte
	}{
		{name: "truncated WAV", file: "bad.wav", body: []byte("RIFF")},
		{name: "oversized WAV fmt chunk", file: "bad.wav", body: oversizedWAVChunk()},
		{name: "truncated AIFF", file: "bad.aiff", body: []byte("FORM\x00\x00")},
		{name: "oversized FLAC metadata", file: "bad.flac", body: []byte{'f', 'L', 'a', 'C', 0x00, 0x20, 0x00, 0x00}},
		{name: "truncated MP4", file: "bad.m4a", body: []byte{0, 0, 0, 8, 'f', 't'}},
		{name: "truncated TIFF", file: "bad.tiff", body: []byte{'I', 'I', 42}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			mustWrite(t, filepath.Join(root, tc.file), tc.body)
			inventory, err := preflight.InventoryDirectory(root)
			if err != nil {
				t.Fatal(err)
			}
			got := entryByPath(t, inventory.Entries, tc.file).Media
			if got == nil || got.Supported || got.Unavailable == "" {
				t.Fatalf("malformed media claimed usable evidence: %#v", got)
			}
		})
	}
}

func wavPCM() []byte {
	result := make([]byte, 44+8)
	copy(result[0:], "RIFF")
	binary.LittleEndian.PutUint32(result[4:], uint32(len(result)-8))
	copy(result[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(result[16:], 16)
	binary.LittleEndian.PutUint16(result[20:], 1)
	binary.LittleEndian.PutUint16(result[22:], 2)
	binary.LittleEndian.PutUint32(result[24:], 48000)
	binary.LittleEndian.PutUint32(result[28:], 288000)
	binary.LittleEndian.PutUint16(result[32:], 6)
	binary.LittleEndian.PutUint16(result[34:], 24)
	copy(result[36:], "data")
	binary.LittleEndian.PutUint32(result[40:], 8)
	return result
}

func rf64WithoutDS64() []byte {
	result := wavPCM()
	copy(result, "RF64")
	binary.LittleEndian.PutUint32(result[40:], math.MaxUint32)
	return result
}

func aiffPCM() []byte {
	result := make([]byte, 12+8+18)
	copy(result, "FORM")
	binary.BigEndian.PutUint32(result[4:], uint32(len(result)-8))
	copy(result[8:], "AIFFCOMM")
	binary.BigEndian.PutUint32(result[16:], 18)
	binary.BigEndian.PutUint16(result[20:], 2)
	binary.BigEndian.PutUint32(result[22:], 44100)
	binary.BigEndian.PutUint16(result[26:], 24)
	copy(result[28:], []byte{0x40, 0x0e, 0xac, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00})
	return result
}

func flacStreamInfo() []byte {
	result := make([]byte, 4+4+34)
	copy(result, "fLaC")
	result[4] = 0x80
	result[7] = 34
	packed := uint64(48000)<<44 | uint64(1)<<41 | uint64(23)<<36 | uint64(96000)
	binary.BigEndian.PutUint64(result[18:26], packed)
	return result
}

func mp3Frame() []byte { return []byte{0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00} }

func m4aAAC() []byte {
	ftyp := atom("ftyp", append([]byte("M4A "), []byte("\x00\x00\x00\x00isommp42")...))
	stsd := atom("stsd", append([]byte("\x00\x00\x00\x00\x00\x00\x00\x01"), atom("mp4a", nil)...))
	return append(ftyp, atom("moov", stsd)...)
}

func atom(name string, payload []byte) []byte {
	result := make([]byte, 8+len(payload))
	binary.BigEndian.PutUint32(result, uint32(len(result)))
	copy(result[4:], name)
	copy(result[8:], payload)
	return result
}

func jpegConfig(t *testing.T) []byte {
	t.Helper()
	image := image.NewRGBA(image.Rect(0, 0, 3, 2))
	image.SetRGBA(0, 0, color.RGBA{R: 18, G: 24, B: 32, A: 255})
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, image, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

func gifConfig() []byte { return []byte("GIF89a\x03\x00\x02\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff;") }

func tiffConfig() []byte {
	result := make([]byte, 38)
	copy(result, "II")
	binary.LittleEndian.PutUint16(result[2:], 42)
	binary.LittleEndian.PutUint32(result[4:], 8)
	binary.LittleEndian.PutUint16(result[8:], 2)
	binary.LittleEndian.PutUint16(result[10:], 256)
	binary.LittleEndian.PutUint16(result[12:], 4)
	binary.LittleEndian.PutUint32(result[14:], 1)
	binary.LittleEndian.PutUint32(result[18:], 3)
	binary.LittleEndian.PutUint16(result[22:], 257)
	binary.LittleEndian.PutUint16(result[24:], 4)
	binary.LittleEndian.PutUint32(result[26:], 1)
	binary.LittleEndian.PutUint32(result[30:], 2)
	return result
}

func oversizedWAVChunk() []byte {
	result := make([]byte, 20)
	copy(result, "RIFF\x00\x00\x00\x00WAVEfmt ")
	binary.LittleEndian.PutUint32(result[16:], 2<<20)
	return result
}
