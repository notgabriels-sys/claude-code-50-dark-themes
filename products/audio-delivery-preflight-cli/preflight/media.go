package preflight

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"path/filepath"
	"strings"
)

type mediaSource interface {
	io.Reader
	io.ReaderAt
	io.Seeker
}

const (
	maxInspectionBytes = 16 << 20
	maxMetadataBytes   = 1 << 20
)

func inspectMedia(f mediaSource, portablePath string, sourceSize int64) *MediaEvidence {
	ext := strings.ToLower(filepath.Ext(portablePath))
	var evidence *MediaEvidence
	switch ext {
	case ".wav", ".rf64":
		evidence = inspectWAV(f)
	case ".aif", ".aiff", ".aifc":
		evidence = inspectAIFF(f)
	case ".flac":
		evidence = inspectFLAC(f)
	case ".mp3":
		evidence = inspectMP3(f)
	case ".m4a", ".mp4":
		evidence = inspectMP4(f)
	case ".png", ".jpg", ".jpeg", ".gif":
		evidence = inspectStandardImage(f, ext)
	case ".tif", ".tiff":
		evidence = inspectTIFF(f)
	case ".heic", ".heif", ".webp":
		evidence = &MediaEvidence{Format: strings.TrimPrefix(ext, "."), Unavailable: "inspection is unsupported in version 1.0"}
	default:
		return nil
	}
	return applyReadabilityEvidence(evidence, f, ext, sourceSize)
}

func inspectStandardImage(f mediaSource, ext string) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia(ext, "cannot seek media")
	}
	config, format, err := image.DecodeConfig(io.LimitReader(f, maxInspectionBytes))
	if err != nil || config.Width <= 0 || config.Height <= 0 {
		return unavailableMedia(ext, "image dimensions are unavailable")
	}
	evidence := &MediaEvidence{
		Supported:   true,
		Format:      strings.ToUpper(format),
		Width:       Measurement[int]{Available: true, Value: config.Width},
		Height:      Measurement[int]{Available: true, Value: config.Height},
		AspectRatio: Measurement[float64]{Available: true, Value: float64(config.Width) / float64(config.Height)},
		ColorModel:  Measurement[string]{Available: true, Value: colorModelName(config.ColorModel)},
	}
	if strings.EqualFold(format, "png") {
		if hasAlpha, known := pngAlpha(f); known {
			evidence.HasAlpha = Measurement[bool]{Available: true, Value: hasAlpha}
		}
	}
	if strings.EqualFold(format, "jpeg") {
		evidence.HasAlpha = Measurement[bool]{Available: true, Value: false}
	}
	return evidence
}

func unavailableMedia(format, reason string) *MediaEvidence {
	return &MediaEvidence{Format: strings.ToUpper(strings.TrimPrefix(format, ".")), Readable: Measurement[bool]{Available: true}, Unavailable: reason}
}

// applyReadabilityEvidence separates bounded header/property extraction from a
// positive payload or decode check. A required role must consume Readable, not
// merely Supported, because a parseable header can be truncated.
func applyReadabilityEvidence(evidence *MediaEvidence, f mediaSource, ext string, sourceSize int64) *MediaEvidence {
	if evidence == nil {
		return nil
	}
	readable, reason := false, evidence.Unavailable
	if evidence.Supported {
		switch ext {
		case ".wav", ".rf64":
			readable, reason = wavPayloadReadable(f, sourceSize)
		case ".aif", ".aiff", ".aifc":
			readable, reason = aiffPayloadReadable(f, sourceSize)
		case ".flac":
			readable, reason = flacPayloadReadable(f, sourceSize)
		case ".mp3":
			readable, reason = true, ""
		case ".m4a", ".mp4":
			readable, reason = mp4PayloadReadable(f, sourceSize)
		case ".png", ".jpg", ".jpeg", ".gif":
			readable, reason = imagePayloadReadable(f, sourceSize)
		case ".tif", ".tiff":
			reason = "full TIFF payload decoding is unavailable in version 1.0"
		default:
			reason = "inspection is unsupported in version 1.0"
		}
	}
	evidence.Readable = Measurement[bool]{Available: true, Value: readable}
	if !readable && evidence.Unavailable == "" {
		evidence.Unavailable = reason
	}
	return evidence
}

func imagePayloadReadable(f mediaSource, sourceSize int64) (bool, string) {
	if sourceSize > maxInspectionBytes {
		return false, "full image payload exceeds the bounded readability inspection limit"
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return false, "cannot seek media"
	}
	if _, _, err := image.Decode(io.LimitReader(f, maxInspectionBytes)); err != nil {
		return false, "image payload cannot be decoded"
	}
	return true, ""
}

func wavPayloadReadable(f mediaSource, sourceSize int64) (bool, string) {
	data, err := readBoundedMedia(f)
	if err != nil || len(data) < 12 || string(data[8:12]) != "WAVE" {
		return false, "WAV payload is unavailable"
	}
	for offset := 12; offset+8 <= len(data); {
		size := uint64(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		payloadOffset := uint64(offset + 8)
		if string(data[offset:offset+4]) == "data" {
			if size == 0 || size == math.MaxUint32 {
				return false, "WAV data payload is empty or unavailable"
			}
			if payloadOffset+size > uint64(sourceSize) {
				return false, "WAV data payload is truncated"
			}
			return true, ""
		}
		next := payloadOffset + size + size%2
		if next > uint64(len(data)) {
			return false, "WAV metadata is truncated"
		}
		offset = int(next)
	}
	return false, "WAV data chunk is unavailable"
}

func aiffPayloadReadable(f mediaSource, sourceSize int64) (bool, string) {
	data, err := readBoundedMedia(f)
	if err != nil || len(data) < 12 || string(data[:4]) != "FORM" {
		return false, "AIFF payload is unavailable"
	}
	for offset := 12; offset+8 <= len(data); {
		size := uint64(binary.BigEndian.Uint32(data[offset+4 : offset+8]))
		payloadOffset := uint64(offset + 8)
		if string(data[offset:offset+4]) == "SSND" {
			if size <= 8 || payloadOffset+size > uint64(sourceSize) {
				return false, "AIFF sound payload is missing or truncated"
			}
			return true, ""
		}
		next := payloadOffset + size + size%2
		if next > uint64(len(data)) {
			return false, "AIFF metadata is truncated"
		}
		offset = int(next)
	}
	return false, "AIFF sound chunk is unavailable"
}

func flacPayloadReadable(_ mediaSource, _ int64) (bool, string) {
	// STREAMINFO is useful bounded metadata, but neither it nor a frame-sync
	// marker proves a complete FLAC frame. Required roles remain fail-closed
	// until version 1 can validate frame structure, subframes/payload, and CRC.
	return false, "complete FLAC frame, payload, and CRC validation is unavailable in version 1.0"
}

func mp4PayloadReadable(f mediaSource, sourceSize int64) (bool, string) {
	data, err := readBoundedMedia(f)
	if err != nil || sourceSize > maxInspectionBytes {
		return false, "MP4 payload cannot be fully established within the bounded inspection limit"
	}
	for offset := 0; offset+8 <= len(data); {
		size := int(binary.BigEndian.Uint32(data[offset : offset+4]))
		if size < 8 || offset+size > len(data) {
			return false, "MP4 atoms are truncated"
		}
		if string(data[offset+4:offset+8]) == "mdat" && size > 8 {
			return true, ""
		}
		offset += size
	}
	return false, "MP4 media payload is unavailable"
}

func readBoundedMedia(f mediaSource) ([]byte, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	return io.ReadAll(io.LimitReader(f, maxInspectionBytes))
}

func colorModelName(model color.Model) string {
	if _, ok := model.(color.Palette); ok {
		return "Palette"
	}
	switch model {
	case color.RGBAModel:
		return "RGBA"
	case color.NRGBAModel:
		return "NRGBA"
	case color.RGBA64Model:
		return "RGBA64"
	case color.NRGBA64Model:
		return "NRGBA64"
	case color.GrayModel:
		return "Gray"
	case color.Gray16Model:
		return "Gray16"
	case color.AlphaModel:
		return "Alpha"
	case color.Alpha16Model:
		return "Alpha16"
	case color.CMYKModel:
		return "CMYK"
	case color.YCbCrModel:
		return "YCbCr"
	default:
		return "unknown"
	}
}

func pngAlpha(f mediaSource) (bool, bool) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return false, false
	}
	var signature [8]byte
	if _, err := io.ReadFull(f, signature[:]); err != nil || string(signature[:]) != "\x89PNG\r\n\x1a\n" {
		return false, false
	}
	colorType := byte(255)
	for read := int64(8); read < int64(maxMetadataBytes); {
		var header [8]byte
		if _, err := io.ReadFull(f, header[:]); err != nil {
			return false, false
		}
		read += 8
		length := int64(binary.BigEndian.Uint32(header[:4]))
		kind := string(header[4:])
		if length > maxMetadataBytes-read-4 {
			return false, false
		}
		if kind == "IHDR" {
			if length != 13 {
				return false, false
			}
			var data [13]byte
			if _, err := io.ReadFull(f, data[:]); err != nil {
				return false, false
			}
			colorType = data[9]
		} else if kind == "tRNS" {
			return true, true
		} else if kind == "IDAT" || kind == "IEND" {
			return colorType == 4 || colorType == 6, colorType != 255
		}
		if kind != "IHDR" {
			if _, err := f.Seek(length, io.SeekCurrent); err != nil {
				return false, false
			}
		}
		if _, err := f.Seek(4, io.SeekCurrent); err != nil {
			return false, false
		}
		read += length + 4
	}
	return false, false
}

func inspectWAV(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("wav", "cannot seek media")
	}
	header := make([]byte, 12)
	if _, err := io.ReadFull(f, header); err != nil || string(header[8:]) != "WAVE" || (string(header[:4]) != "RIFF" && string(header[:4]) != "RF64") {
		return unavailableMedia("wav", "invalid or truncated RIFF/WAVE header")
	}
	container := "WAV"
	rf64 := string(header[:4]) == "RF64"
	if rf64 {
		container = "RF64"
	}
	evidence := &MediaEvidence{Supported: true, Format: container, Container: container}
	var dataSize uint64
	dataSizeKnown := false
	byteRate := uint32(0)
	foundFormat := false
	read := int64(12)
	for read < maxInspectionBytes {
		chunkHeader := make([]byte, 8)
		if _, err := io.ReadFull(f, chunkHeader); err != nil {
			break
		}
		read += 8
		size := uint64(binary.LittleEndian.Uint32(chunkHeader[4:]))
		chunkID := string(chunkHeader[:4])
		if chunkID == "data" {
			if size != math.MaxUint32 || !rf64 {
				dataSize, dataSizeKnown = size, true
			}
			break // Audio payload is intentionally never read by the evidence parser.
		}
		if size > maxMetadataBytes || size > uint64(maxInspectionBytes-read) {
			return unavailableMedia(container, "metadata chunk exceeds inspection limit")
		}
		chunk := make([]byte, int(size))
		if _, err := io.ReadFull(f, chunk); err != nil {
			return unavailableMedia(container, "truncated metadata chunk")
		}
		read += int64(size)
		if size%2 == 1 {
			if _, err := f.Seek(1, io.SeekCurrent); err != nil {
				return unavailableMedia(container, "truncated chunk padding")
			}
			read++
		}
		switch chunkID {
		case "ds64":
			if len(chunk) >= 16 && rf64 {
				dataSize = binary.LittleEndian.Uint64(chunk[8:16])
				dataSizeKnown = true
			}
		case "fmt ":
			if len(chunk) < 16 {
				return unavailableMedia(container, "truncated format chunk")
			}
			foundFormat = true
			formatCode := binary.LittleEndian.Uint16(chunk[0:2])
			channels := binary.LittleEndian.Uint16(chunk[2:4])
			sampleRate := binary.LittleEndian.Uint32(chunk[4:8])
			byteRate = binary.LittleEndian.Uint32(chunk[8:12])
			bits := binary.LittleEndian.Uint16(chunk[14:16])
			if channels > 0 {
				evidence.Channels = Measurement[int]{Available: true, Value: int(channels)}
			}
			if sampleRate > 0 {
				evidence.SampleRate = Measurement[int]{Available: true, Value: int(sampleRate)}
			}
			switch formatCode {
			case 1:
				evidence.Encoding = Measurement[string]{Available: true, Value: "PCM"}
				if bits > 0 {
					evidence.BitDepth = Measurement[int]{Available: true, Value: int(bits)}
				}
			case 3:
				evidence.Encoding = Measurement[string]{Available: true, Value: "IEEE float"}
			case 0xfffe:
				if len(chunk) < 40 {
					return unavailableMedia(container, "truncated WAVE_FORMAT_EXTENSIBLE chunk")
				}
				cbSize := int(binary.LittleEndian.Uint16(chunk[16:18]))
				if cbSize < 22 || 18+cbSize > len(chunk) {
					return unavailableMedia(container, "invalid WAVE_FORMAT_EXTENSIBLE fields")
				}
				standardTail := []byte{0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}
				if bytes.Equal(chunk[28:40], standardTail) {
					subtype := binary.LittleEndian.Uint32(chunk[24:28])
					validBits := binary.LittleEndian.Uint16(chunk[18:20])
					switch subtype {
					case 1:
						if validBits == 0 || validBits > bits {
							return unavailableMedia(container, "invalid WAVE_FORMAT_EXTENSIBLE PCM valid bits")
						}
						evidence.Encoding = Measurement[string]{Available: true, Value: "PCM"}
						evidence.BitDepth = Measurement[int]{Available: true, Value: int(validBits)}
					case 3:
						evidence.Encoding = Measurement[string]{Available: true, Value: "IEEE float"}
					}
				}
			}
		}
	}
	if !foundFormat {
		return unavailableMedia(container, "format chunk is unavailable")
	}
	if dataSizeKnown && byteRate > 0 {
		evidence.Duration = Measurement[float64]{Available: true, Value: float64(dataSize) / float64(byteRate)}
	}
	return evidence
}

func inspectAIFF(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("aiff", "cannot seek media")
	}
	header := make([]byte, 12)
	if _, err := io.ReadFull(f, header); err != nil || string(header[:4]) != "FORM" || (string(header[8:]) != "AIFF" && string(header[8:]) != "AIFC") {
		return unavailableMedia("aiff", "invalid or truncated FORM header")
	}
	container := string(header[8:])
	evidence := &MediaEvidence{Supported: true, Format: container, Container: container}
	foundCOMM := false
	read := int64(12)
	for read < maxInspectionBytes {
		chunkHeader := make([]byte, 8)
		if _, err := io.ReadFull(f, chunkHeader); err != nil {
			break
		}
		read += 8
		size := uint64(binary.BigEndian.Uint32(chunkHeader[4:]))
		if size > maxMetadataBytes || size > uint64(maxInspectionBytes-read) {
			return unavailableMedia(container, "metadata chunk exceeds inspection limit")
		}
		chunk := make([]byte, int(size))
		if _, err := io.ReadFull(f, chunk); err != nil {
			return unavailableMedia(container, "truncated metadata chunk")
		}
		read += int64(size)
		if size%2 == 1 {
			if _, err := f.Seek(1, io.SeekCurrent); err != nil {
				return unavailableMedia(container, "truncated chunk padding")
			}
			read++
		}
		if string(chunkHeader[:4]) != "COMM" {
			continue
		}
		if len(chunk) < 18 {
			return unavailableMedia(container, "truncated common chunk")
		}
		foundCOMM = true
		channels := binary.BigEndian.Uint16(chunk[0:2])
		frames := binary.BigEndian.Uint32(chunk[2:6])
		bits := binary.BigEndian.Uint16(chunk[6:8])
		if channels > 0 {
			evidence.Channels = Measurement[int]{Available: true, Value: int(channels)}
		}
		if rate, ok := extended80(chunk[8:18]); ok && rate > 0 && rate <= float64(math.MaxInt) {
			evidence.SampleRate = Measurement[int]{Available: true, Value: int(math.Round(rate))}
			evidence.Duration = Measurement[float64]{Available: true, Value: float64(frames) / rate}
		}
		if container == "AIFF" {
			evidence.Encoding = Measurement[string]{Available: true, Value: "PCM"}
			if bits > 0 {
				evidence.BitDepth = Measurement[int]{Available: true, Value: int(bits)}
			}
		} else if len(chunk) >= 22 {
			switch string(chunk[18:22]) {
			case "NONE", "sowt":
				evidence.Encoding = Measurement[string]{Available: true, Value: "PCM"}
				if bits > 0 {
					evidence.BitDepth = Measurement[int]{Available: true, Value: int(bits)}
				}
			default:
				evidence.Encoding = Measurement[string]{Available: true, Value: string(chunk[18:22])}
			}
		}
		break
	}
	if !foundCOMM {
		return unavailableMedia(container, "common chunk is unavailable")
	}
	return evidence
}

func extended80(value []byte) (float64, bool) {
	if len(value) != 10 {
		return 0, false
	}
	exponent := int(binary.BigEndian.Uint16(value[:2]) & 0x7fff)
	if exponent == 0 || exponent == 0x7fff {
		return 0, false
	}
	mantissa := binary.BigEndian.Uint64(value[2:])
	if mantissa == 0 {
		return 0, false
	}
	result := math.Ldexp(float64(mantissa), exponent-16383-63)
	if value[0]&0x80 != 0 {
		result = -result
	}
	return result, !math.IsNaN(result) && !math.IsInf(result, 0)
}

func inspectFLAC(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("flac", "cannot seek media")
	}
	header := make([]byte, 8)
	if _, err := io.ReadFull(f, header); err != nil || string(header[:4]) != "fLaC" {
		return unavailableMedia("flac", "invalid or truncated FLAC header")
	}
	blockType, size := header[4]&0x7f, int(header[5])<<16|int(header[6])<<8|int(header[7])
	if blockType != 0 || size != 34 {
		return unavailableMedia("flac", "STREAMINFO is unavailable or invalid")
	}
	streamInfo := make([]byte, size)
	if _, err := io.ReadFull(f, streamInfo); err != nil {
		return unavailableMedia("flac", "truncated STREAMINFO")
	}
	packed := binary.BigEndian.Uint64(streamInfo[10:18])
	sampleRate := int((packed >> 44) & 0xfffff)
	channels := int((packed>>41)&0x7) + 1
	bits := int((packed>>36)&0x1f) + 1
	totalSamples := packed & ((uint64(1) << 36) - 1)
	if sampleRate == 0 || bits < 4 || bits > 32 {
		return unavailableMedia("flac", "STREAMINFO fields are invalid")
	}
	evidence := &MediaEvidence{Supported: true, Format: "FLAC", Container: "FLAC", Encoding: Measurement[string]{Available: true, Value: "FLAC"}}
	if sampleRate > 0 {
		evidence.SampleRate = Measurement[int]{Available: true, Value: sampleRate}
	}
	if channels > 0 {
		evidence.Channels = Measurement[int]{Available: true, Value: channels}
	}
	if bits > 0 {
		evidence.BitDepth = Measurement[int]{Available: true, Value: bits}
	}
	if sampleRate > 0 && totalSamples > 0 {
		evidence.Duration = Measurement[float64]{Available: true, Value: float64(totalSamples) / float64(sampleRate)}
	}
	return evidence
}

func inspectMP3(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("mp3", "cannot seek media")
	}
	data, err := io.ReadAll(io.LimitReader(f, 64<<10))
	if err != nil {
		return unavailableMedia("mp3", "cannot read media header")
	}
	start := 0
	if len(data) >= 10 && string(data[:3]) == "ID3" {
		size := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
		start = 10 + size
		if start > len(data) {
			return unavailableMedia("mp3", "ID3 metadata exceeds inspection limit")
		}
	}
	for index := start; index+4 <= len(data); index++ {
		if encoding, frameLength, ok := mpegLayerThree(data[index : index+4]); ok && index+frameLength*3 <= len(data) && consistentMP3Frames(data[index:], frameLength) {
			return &MediaEvidence{Supported: true, Format: "MP3", Container: "MP3", Encoding: Measurement[string]{Available: true, Value: encoding}, Unavailable: "duration is unavailable without a bounded, trustworthy frame index"}
		}
	}
	return unavailableMedia("mp3", "MPEG audio frame is unavailable")
}

func consistentMP3Frames(data []byte, frameLength int) bool {
	for i := 0; i < 3; i++ {
		if _, n, ok := mpegLayerThree(data[i*frameLength:]); !ok || n != frameLength {
			return false
		}
	}
	return true
}

func mpegLayerThree(header []byte) (string, int, bool) {
	if len(header) < 4 || header[0] != 0xff || header[1]&0xe0 != 0xe0 {
		return "", 0, false
	}
	version := (header[1] >> 3) & 0x3
	layer := (header[1] >> 1) & 0x3
	bitrate := (header[2] >> 4) & 0xf
	sampleRate := (header[2] >> 2) & 0x3
	if version != 3 || layer != 1 || bitrate == 0 || bitrate == 15 || sampleRate == 3 {
		return "", 0, false
	}
	bitrates := [...]int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}
	rates := [...]int{44100, 48000, 32000}
	return "MPEG Layer III", 144000*bitrates[bitrate]/rates[sampleRate] + int((header[2]>>1)&1), true
}

func inspectMP4(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("mp4", "cannot seek media")
	}
	data, err := io.ReadAll(io.LimitReader(f, maxMetadataBytes+1))
	if err != nil {
		return unavailableMedia("mp4", "cannot read atom headers")
	}
	if len(data) > maxMetadataBytes {
		data = data[:maxMetadataBytes]
	}
	major, _, ok := mp4Evidence(data)
	if !ok {
		return unavailableMedia("mp4", "valid bounded MP4 atoms are unavailable")
	}
	container := "MP4"
	if major == "M4A " || major == "M4B " {
		container = "M4A"
	}
	evidence := &MediaEvidence{Supported: true, Format: container, Container: container}
	return evidence
}

func mp4Evidence(data []byte) (string, string, bool) {
	major := ""
	codec := ""
	var walk func([]byte, int, bool) bool
	walk = func(region []byte, depth int, inSTSD bool) bool {
		if depth > 12 {
			return false
		}
		for offset := 0; offset+8 <= len(region); {
			size := int64(binary.BigEndian.Uint32(region[offset : offset+4]))
			typeName := string(region[offset+4 : offset+8])
			header := 8
			if size == 1 {
				if offset+16 > len(region) {
					return false
				}
				size = int64(binary.BigEndian.Uint64(region[offset+8 : offset+16]))
				header = 16
			} else if size == 0 {
				size = int64(len(region) - offset)
			}
			if size < int64(header) || size > int64(len(region)-offset) {
				return false
			}
			payload := region[offset+header : offset+int(size)]
			if typeName == "ftyp" && len(payload) >= 4 {
				major = string(payload[:4])
			}
			if inSTSD && typeName == "mp4a" {
				codec = "AAC"
			}
			childSTSD := typeName == "stsd"
			if childSTSD {
				if len(payload) < 8 {
					return false
				}
				if !walk(payload[8:], depth+1, true) {
					return false
				}
			} else if isMP4Container(typeName) {
				if !walk(payload, depth+1, inSTSD) {
					return false
				}
			}
			offset += int(size)
		}
		return true
	}
	if !walk(data, 0, false) || major == "" {
		return "", "", false
	}
	return major, codec, true
}

func isMP4Container(name string) bool {
	switch name {
	case "moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "meta", "dinf":
		return true
	default:
		return false
	}
}

func inspectTIFF(f mediaSource) *MediaEvidence {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return unavailableMedia("tiff", "cannot seek media")
	}
	header := make([]byte, 8)
	if _, err := io.ReadFull(f, header); err != nil {
		return unavailableMedia("tiff", "truncated TIFF header")
	}
	little := string(header[:2]) == "II"
	if (!little && string(header[:2]) != "MM") || tiffUint16(header[2:4], little) != 42 {
		return unavailableMedia("tiff", "invalid TIFF header")
	}
	ifdOffset := uint64(tiffUint32(header[4:8], little))
	if ifdOffset > maxMetadataBytes {
		return unavailableMedia("tiff", "IFD exceeds inspection limit")
	}
	countBytes := make([]byte, 2)
	if _, err := f.ReadAt(countBytes, int64(ifdOffset)); err != nil {
		return unavailableMedia("tiff", "truncated TIFF IFD")
	}
	count := int(tiffUint16(countBytes, little))
	if count > 4096 || uint64(count)*12+2 > maxMetadataBytes-ifdOffset {
		return unavailableMedia("tiff", "IFD exceeds inspection limit")
	}
	entries := make([]byte, count*12)
	if _, err := f.ReadAt(entries, int64(ifdOffset)+2); err != nil {
		return unavailableMedia("tiff", "truncated TIFF IFD entries")
	}
	values := make(map[uint16]uint32)
	for offset := 0; offset < len(entries); offset += 12 {
		tag := tiffUint16(entries[offset:offset+2], little)
		typeID, itemCount := tiffUint16(entries[offset+2:offset+4], little), tiffUint32(entries[offset+4:offset+8], little)
		if itemCount != 1 {
			continue
		}
		switch typeID {
		case 3:
			values[tag] = uint32(tiffUint16(entries[offset+8:offset+10], little))
		case 4:
			values[tag] = tiffUint32(entries[offset+8:offset+12], little)
		}
	}
	width, widthOK := values[256]
	height, heightOK := values[257]
	if !widthOK || !heightOK || width == 0 || height == 0 {
		return unavailableMedia("tiff", "TIFF dimensions are unavailable")
	}
	evidence := &MediaEvidence{Supported: true, Format: "TIFF", Width: Measurement[int]{Available: true, Value: int(width)}, Height: Measurement[int]{Available: true, Value: int(height)}, AspectRatio: Measurement[float64]{Available: true, Value: float64(width) / float64(height)}}
	if photo, ok := values[262]; ok {
		switch photo {
		case 1:
			evidence.ColorModel = Measurement[string]{Available: true, Value: "Gray"}
		case 2:
			evidence.ColorModel = Measurement[string]{Available: true, Value: "RGB"}
		case 5:
			evidence.ColorModel = Measurement[string]{Available: true, Value: "CMYK"}
		}
	}
	if extra, ok := values[338]; ok && (extra == 1 || extra == 2) {
		evidence.HasAlpha = Measurement[bool]{Available: true, Value: true}
	}
	return evidence
}

func tiffUint16(value []byte, little bool) uint16 {
	if little {
		return binary.LittleEndian.Uint16(value)
	}
	return binary.BigEndian.Uint16(value)
}
func tiffUint32(value []byte, little bool) uint32 {
	if little {
		return binary.LittleEndian.Uint32(value)
	}
	return binary.BigEndian.Uint32(value)
}
