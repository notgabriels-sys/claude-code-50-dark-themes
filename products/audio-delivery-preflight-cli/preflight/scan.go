package preflight

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const SchemaVersion = "1.0"

// Severity ranks a technical finding. It is deliberately not an artistic judgement.
type Severity string

const (
	SeverityInformation Severity = "information"
	SeverityWarning     Severity = "warning"
	SeverityError       Severity = "error"
)

// Status is the completed scan verdict used for deterministic CLI exit codes.
type Status string

const (
	StatusReady              Status = "ready"
	StatusWarnings           Status = "warnings"
	StatusRequirementsNotMet Status = "requirements-not-met"
)

// Preset is a transparent built-in technical check profile.
type Preset struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Requirements []string `json:"requirements"`
}

var builtInPresets = []Preset{
	{
		ID:           "general-audio",
		Name:         "General Audio",
		Description:  "Inventories audio and reports technical consistency, duplicates, links, and ambiguous version names.",
		Requirements: []string{"Audio is inspected only where its container parser provides evidence.", "No sample rate, bit depth, loudness, or artistic target is required."},
	},
	{
		ID:           "stereo-premaster",
		Name:         "Stereo Premaster",
		Description:  "Requires one readable PCM stereo audio file and reports package consistency; FLAC metadata is inventory-only in version 1.",
		Requirements: []string{"One readable PCM stereo audio file.", "FLAC STREAMINFO metadata is inventoried but cannot satisfy a required role until complete frame, payload, and CRC validation exists.", "No loudness, true-peak, headroom, or artistic target is required."},
	},
	{
		ID:           "digital-release",
		Name:         "Digital Release",
		Description:  "Requires a visible readable PCM main-master role, square 3000 px artwork, and metadata or credits; FLAC metadata is inventory-only in version 1.",
		Requirements: []string{"One readable PCM file named as a main master, premaster, or master.", "FLAC STREAMINFO metadata is inventoried but cannot satisfy a required role until complete frame, payload, and CRC validation exists.", "One readable square artwork file at least 3000 by 3000 pixels.", "One metadata or credits document matched by its visible filename."},
	},
}

// Presets returns copies in the documented stable display order.
func Presets() []Preset {
	result := make([]Preset, len(builtInPresets))
	for i, preset := range builtInPresets {
		result[i] = clonePreset(preset)
	}
	return result
}

func PresetByID(id string) (Preset, error) {
	for _, preset := range builtInPresets {
		if preset.ID == id {
			return clonePreset(preset), nil
		}
	}
	return Preset{}, fmt.Errorf("unknown preset %q", id)
}

func clonePreset(preset Preset) Preset {
	preset.Requirements = append([]string(nil), preset.Requirements...)
	return preset
}

// Finding identifies an evidence-backed technical condition. Paths are portable,
// root-relative inventory paths only.
type Finding struct {
	ID              string   `json:"id"`
	Severity        Severity `json:"severity"`
	Title           string   `json:"title"`
	Explanation     string   `json:"explanation"`
	Paths           []string `json:"paths"`
	Expected        string   `json:"expected"`
	SuggestedAction string   `json:"suggested_action"`
}

// RoleAssignment records a role only when one file passed every stated test.
type RoleAssignment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Path     string `json:"path"`
	Evidence string `json:"evidence"`
}

// Report is a schema-versioned, portable scan result. SourceRoot is intentionally
// excluded so JSON and HTML exports cannot disclose the selected absolute path.
type Report struct {
	SchemaVersion   string           `json:"schema_version"`
	EngineVersion   string           `json:"engine_version"`
	FolderName      string           `json:"folder_name"`
	Preset          Preset           `json:"preset"`
	StartedAt       time.Time        `json:"started_at"`
	CompletedAt     time.Time        `json:"completed_at"`
	Status          Status           `json:"status"`
	Inventory       Inventory        `json:"inventory"`
	RoleAssignments []RoleAssignment `json:"role_assignments"`
	Findings        []Finding        `json:"findings"`
}

// AnalyzeDirectory reads an inventory and applies only the evidence its bounded
// media inspection exposes. It never writes the selected tree.
func AnalyzeDirectory(root string, preset Preset) (Report, error) {
	if _, err := PresetByID(preset.ID); err != nil {
		return Report{}, err
	}
	started := time.Now().UTC()
	inventory, err := InventoryDirectory(root)
	if err != nil {
		return Report{}, err
	}
	folderName := filepath.Base(filepath.Clean(root))
	if !safeDisplayComponent(folderName) {
		folderName = "Selected folder"
	}
	report := Report{
		SchemaVersion: SchemaVersion,
		EngineVersion: "1.0.0",
		FolderName:    folderName,
		Preset:        preset,
		StartedAt:     started,
		CompletedAt:   time.Now().UTC(),
		Inventory:     inventory,
	}
	report.Findings = append(report.Findings, generalFindings(inventory)...)
	switch preset.ID {
	case "stereo-premaster":
		assignments, findings := stereoPremasterFindings(inventory)
		report.RoleAssignments = assignments
		report.Findings = append(report.Findings, findings...)
	case "digital-release":
		assignments, findings := digitalReleaseFindings(inventory)
		report.RoleAssignments = assignments
		report.Findings = append(report.Findings, findings...)
	}
	sortFindings(report.Findings)
	report.Status = statusFor(report.Findings)
	return report, nil
}

func generalFindings(inventory Inventory) []Finding {
	findings := make([]Finding, 0)
	for _, entry := range inventory.Entries {
		switch entry.Kind {
		case EntrySymlink:
			findings = append(findings, finding("source.symbolic-link", SeverityWarning, "Symbolic link was not followed", []string{entry.Path}, "A delivery tree without symbolic links.", "Replace the link with the intended regular delivery file if it must be delivered."))
		case EntrySpecial:
			findings = append(findings, finding("source.special-file", SeverityWarning, "Special filesystem entry was not read", []string{entry.Path}, "Regular files and directories only.", "Remove or replace this special entry before delivery."))
		}
		if entry.Kind == EntryFile && entry.ServiceClass == ServiceAudio {
			if !mediaReadable(entry.Media) {
				findings = append(findings, finding("audio.unreadable", SeverityWarning, "Audio could not be inspected", []string{entry.Path}, "A readable audio container with evidence appropriate to its format.", "Re-export or verify this audio file with a trusted tool."))
				continue
			}
			if expected, ok := expectedContainer(entry.Path); ok && !strings.EqualFold(expected, entry.Media.Container) {
				findings = append(findings, finding("audio.filename-content-mismatch", SeverityWarning, "Audio filename extension does not match inspected content", []string{entry.Path}, "A filename extension consistent with the inspected container.", "Correct the filename or re-export the intended audio format."))
			}
		}
		if entry.Kind == EntryFile && ambiguousVersionName(entry.Path) {
			findings = append(findings, finding("filename.ambiguous-version", SeverityWarning, "Filename has an ambiguous version marker", []string{entry.Path}, "A delivery filename without an ambiguous version marker.", "Rename the file using the agreed delivery naming convention."))
		}
	}
	for _, group := range inventory.DuplicateGroups {
		findings = append(findings, finding("source.exact-duplicate", SeverityWarning, "Exact duplicate files found", group.Paths, "One intentional copy of each delivery file.", "Confirm whether every duplicate is required; this scanner does not remove files."))
	}
	for _, paths := range caseCollisions(inventory.Entries) {
		findings = append(findings, finding("filename.case-insensitive-collision", SeverityWarning, "Files collide on case-insensitive filesystems", paths, "Distinct relative filenames after case is ignored.", "Rename one or more files so the delivery works on case-insensitive filesystems."))
	}
	findings = append(findings, audioConsistencyFindings(inventory.Entries)...)
	return findings
}

func stereoPremasterFindings(inventory Inventory) ([]RoleAssignment, []Finding) {
	candidates := filterEntries(inventory.Entries, isStereoPremasterCandidate)
	if len(candidates) == 0 {
		return nil, []Finding{missingRole("stereo-premaster", "readable lossless stereo premaster")}
	}
	accepted := make([]Entry, 0, len(candidates))
	findings := make([]Finding, 0)
	for _, entry := range candidates {
		candidateFindings, valid := losslessRoleFindings(entry, "stereo-premaster", true)
		findings = append(findings, candidateFindings...)
		if valid {
			accepted = append(accepted, entry)
		}
	}
	if len(accepted) == 0 {
		return nil, findings
	}
	if len(accepted) > 1 {
		findings = append(findings, finding("role.ambiguous.stereo-premaster", SeverityWarning, "Premaster role matches multiple files", entryPaths(accepted), "Exactly one identifiable premaster.", "Keep one premaster candidate or use unambiguous delivery names."))
		return nil, findings
	}
	return []RoleAssignment{{ID: "stereo-premaster", Name: "readable lossless stereo premaster", Path: accepted[0].Path, Evidence: losslessEvidence(accepted[0])}}, findings
}

func digitalReleaseFindings(inventory Inventory) ([]RoleAssignment, []Finding) {
	assignments := make([]RoleAssignment, 0, 3)
	findings := make([]Finding, 0)
	mainCandidates := filterEntries(inventory.Entries, func(entry Entry) bool {
		return entry.Kind == EntryFile && entry.ServiceClass == ServiceAudio && mainMasterName(entry.Path)
	})
	if len(mainCandidates) == 0 {
		findings = append(findings, missingRole("main-master", "lossless main master"))
	} else {
		accepted := make([]Entry, 0, len(mainCandidates))
		for _, entry := range mainCandidates {
			candidateFindings, valid := losslessRoleFindings(entry, "main-master", false)
			findings = append(findings, candidateFindings...)
			if valid {
				accepted = append(accepted, entry)
			}
		}
		if len(mainCandidates) > 1 {
			findings = append(findings, finding("role.ambiguous.main-master", SeverityWarning, "Main-master role matches multiple files", entryPaths(mainCandidates), "Exactly one identifiable main master.", "Keep one main-master candidate or make the visible filenames unambiguous."))
		} else if len(accepted) == 1 {
			assignments = append(assignments, RoleAssignment{ID: "main-master", Name: "lossless main master", Path: accepted[0].Path, Evidence: losslessEvidence(accepted[0])})
		}
	}

	artwork := regularByClass(inventory.Entries, ServiceArtwork)
	if len(artwork) == 0 {
		findings = append(findings, missingRole("artwork", "artwork"))
	} else {
		accepted := make([]Entry, 0, len(artwork))
		for _, entry := range artwork {
			candidateFindings, valid := artworkRoleFindings(entry)
			findings = append(findings, candidateFindings...)
			if valid {
				accepted = append(accepted, entry)
			}
		}
		if len(artwork) > 1 {
			findings = append(findings, finding("role.ambiguous.artwork", SeverityWarning, "Artwork role matches multiple files", entryPaths(artwork), "Exactly one identifiable artwork file.", "Keep one artwork file or make the visible filenames unambiguous."))
		} else if len(accepted) == 1 {
			entry := accepted[0]
			assignments = append(assignments, RoleAssignment{ID: "artwork", Name: "artwork", Path: entry.Path, Evidence: fmt.Sprintf("%d by %d pixels", entry.Media.Width.Value, entry.Media.Height.Value)})
		}
	}

	documents := filterEntries(inventory.Entries, func(entry Entry) bool {
		return entry.Kind == EntryFile && (entry.ServiceClass == ServiceMetadata || entry.ServiceClass == ServiceDocumentation) && metadataOrCreditsName(entry.Path)
	})
	if len(documents) == 0 {
		findings = append(findings, missingRole("metadata-or-credits", "metadata or credits document"))
	} else if len(documents) > 1 {
		findings = append(findings, finding("role.ambiguous.metadata-or-credits", SeverityWarning, "Metadata or credits role matches multiple files", entryPaths(documents), "Exactly one identifiable metadata or credits document.", "Keep one matching document or use unambiguous delivery names."))
	} else {
		assignments = append(assignments, RoleAssignment{ID: "metadata-or-credits", Name: "metadata or credits document", Path: documents[0].Path, Evidence: "regular inventoried document"})
	}
	return assignments, findings
}

func finding(id string, severity Severity, title string, paths []string, expected, action string) Finding {
	return Finding{ID: id, Severity: severity, Title: title, Explanation: title + ".", Paths: append([]string(nil), paths...), Expected: expected, SuggestedAction: action}
}

func roleFinding(id string, severity Severity, title, path, expected, action string) Finding {
	return finding(id, severity, title, []string{path}, expected, action)
}

func missingRole(id, name string) Finding {
	return finding("role.missing."+id, SeverityError, "Required delivery role is missing", nil, "One file matching the configured "+name+" role.", "Add the required delivery file with a visible matching name.")
}

func statusFor(findings []Finding) Status {
	for _, finding := range findings {
		if finding.Severity == SeverityError {
			return StatusRequirementsNotMet
		}
	}
	for _, finding := range findings {
		if finding.Severity == SeverityWarning {
			return StatusWarnings
		}
	}
	return StatusReady
}

func sortFindings(findings []Finding) {
	sort.Slice(findings, func(i, j int) bool {
		if findings[i].ID != findings[j].ID {
			return findings[i].ID < findings[j].ID
		}
		return strings.Join(findings[i].Paths, "\x00") < strings.Join(findings[j].Paths, "\x00")
	})
}

func regularByClass(entries []Entry, class ServiceClass) []Entry {
	return filterEntries(entries, func(entry Entry) bool { return entry.Kind == EntryFile && entry.ServiceClass == class })
}

func filterEntries(entries []Entry, keep func(Entry) bool) []Entry {
	result := make([]Entry, 0)
	for _, entry := range entries {
		if keep(entry) {
			result = append(result, entry)
		}
	}
	return result
}

func entryPaths(entries []Entry) []string {
	paths := make([]string, len(entries))
	for i, entry := range entries {
		paths[i] = entry.Path
	}
	sort.Strings(paths)
	return paths
}

func isLossless(media *MediaEvidence) bool {
	return media != nil && media.Encoding.Available && (media.Encoding.Value == "PCM" || media.Encoding.Value == "FLAC")
}

func mediaReadable(media *MediaEvidence) bool {
	return media != nil && media.Supported && media.Readable.Available && media.Readable.Value
}

func isStereoPremasterCandidate(entry Entry) bool {
	if entry.Kind != EntryFile || entry.ServiceClass != ServiceAudio {
		return false
	}
	switch strings.ToLower(filepath.Ext(entry.Path)) {
	case ".aif", ".aiff", ".flac", ".m4a", ".wav":
		return true
	default:
		return false
	}
}

func losslessRoleFindings(entry Entry, role string, stereo bool) ([]Finding, bool) {
	if !mediaReadable(entry.Media) || !entry.Media.Encoding.Available {
		return []Finding{roleFinding("role.unreadable."+role, SeverityError, "Required audio does not provide positive readable evidence", entry.Path, "Readable PCM or FLAC audio.", "Re-export or replace this file with a readable lossless file.")}, false
	}
	if !isLossless(entry.Media) {
		return []Finding{roleFinding("role.disallowed-encoding."+role, SeverityError, "Required audio is not a supported lossless encoding", entry.Path, "PCM or FLAC encoding.", "Supply PCM or FLAC audio.")}, false
	}
	if stereo && (!entry.Media.Channels.Available || entry.Media.Channels.Value != 2) {
		return []Finding{roleFinding("role.channel-count."+role, SeverityError, "Premaster is not stereo", entry.Path, "Exactly 2 inspected channels.", "Supply a stereo premaster.")}, false
	}
	return nil, true
}

func artworkRoleFindings(entry Entry) ([]Finding, bool) {
	if !mediaReadable(entry.Media) || !entry.Media.Width.Available || !entry.Media.Height.Available {
		return []Finding{roleFinding("role.unreadable.artwork", SeverityError, "Artwork does not provide positive readable dimension evidence", entry.Path, "Readable artwork with inspected dimensions.", "Re-export or replace the artwork with a supported readable image.")}, false
	}
	findings := make([]Finding, 0, 2)
	if entry.Media.Width.Value < 3000 || entry.Media.Height.Value < 3000 {
		findings = append(findings, roleFinding("artwork.minimum-dimensions", SeverityError, "Artwork is below the minimum dimensions", entry.Path, "At least 3000 by 3000 pixels.", "Supply artwork at least 3000 by 3000 pixels."))
	}
	if entry.Media.Width.Value != entry.Media.Height.Value {
		findings = append(findings, roleFinding("artwork.square", SeverityError, "Artwork is not square", entry.Path, "Equal width and height.", "Supply square artwork."))
	}
	return findings, len(findings) == 0
}

func losslessEvidence(entry Entry) string {
	if entry.Media == nil {
		return ""
	}
	parts := []string{entry.Media.Encoding.Value}
	if entry.Media.Channels.Available {
		parts = append(parts, fmt.Sprintf("%d channels", entry.Media.Channels.Value))
	}
	if entry.Media.SampleRate.Available {
		parts = append(parts, fmt.Sprintf("%d Hz", entry.Media.SampleRate.Value))
	}
	return strings.Join(parts, ", ")
}

func expectedContainer(path string) (string, bool) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".wav":
		return "WAV", true
	case ".rf64":
		return "RF64", true
	case ".aif", ".aiff", ".aifc":
		if strings.EqualFold(filepath.Ext(path), ".aifc") {
			return "AIFC", true
		}
		return "AIFF", true
	case ".flac":
		return "FLAC", true
	case ".mp3":
		return "MP3", true
	case ".m4a", ".mp4":
		return "M4A", true
	default:
		return "", false
	}
}

var ambiguousVersionPattern = regexp.MustCompile(`(?i)(?:^|[ _.-])(?:final|master|version|v)[ _.-]*\d+(?:$|[ _.-])`)
var mainMasterPattern = regexp.MustCompile(`(?i)(?:^|/)(?:[^/]*[ _.-])?(?:main[ _.-]*master|premaster|master)(?:[ _.-](?:v(?:ersion)?[ _.-]?\d+|\d+|final))?\.(?:aif|aiff|flac|m4a|wav)$`)
var metadataOrCreditsPattern = regexp.MustCompile(`(?i)(?:^|/).*(?:metadata|credits).*\.(?:csv|doc|docx|md|pdf|rtf|txt)$`)

func ambiguousVersionName(path string) bool  { return ambiguousVersionPattern.MatchString(path) }
func mainMasterName(path string) bool        { return mainMasterPattern.MatchString(path) }
func metadataOrCreditsName(path string) bool { return metadataOrCreditsPattern.MatchString(path) }

func caseCollisions(entries []Entry) [][]string {
	groups := make(map[string][]string)
	for _, entry := range entries {
		if entry.Kind == EntryFile {
			groups[strings.ToLower(entry.Path)] = append(groups[strings.ToLower(entry.Path)], entry.Path)
		}
	}
	keys := make([]string, 0)
	for key, paths := range groups {
		if len(paths) > 1 {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	result := make([][]string, 0, len(keys))
	for _, key := range keys {
		paths := groups[key]
		sort.Strings(paths)
		result = append(result, paths)
	}
	return result
}

func audioConsistencyFindings(entries []Entry) []Finding {
	audio := regularByClass(entries, ServiceAudio)
	if len(audio) < 2 {
		return nil
	}
	findings := consistentMeasurementFinding(audio, "sample_rate", "Audio sample rates are inconsistent", func(entry Entry) (int, bool) {
		return mediaMeasurement(entry, func(media *MediaEvidence) Measurement[int] { return media.SampleRate })
	})
	findings = append(findings, consistentMeasurementFinding(audio, "channel_count", "Audio channel counts are inconsistent", func(entry Entry) (int, bool) {
		return mediaMeasurement(entry, func(media *MediaEvidence) Measurement[int] { return media.Channels })
	})...)
	findings = append(findings, consistentMeasurementFinding(audio, "bit_depth", "Audio bit depths are inconsistent", func(entry Entry) (int, bool) {
		return mediaMeasurement(entry, func(media *MediaEvidence) Measurement[int] { return media.BitDepth })
	})...)
	return findings
}

func mediaMeasurement(entry Entry, measure func(*MediaEvidence) Measurement[int]) (int, bool) {
	if !mediaReadable(entry.Media) {
		return 0, false
	}
	value := measure(entry.Media)
	return value.Value, value.Available
}

func consistentMeasurementFinding(entries []Entry, id, title string, value func(Entry) (int, bool)) []Finding {
	values := make(map[int]bool)
	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		v, ok := value(entry)
		if !ok {
			return []Finding{finding("audio.consistent-"+id+"-unavailable", SeverityWarning, "Audio "+strings.ReplaceAll(id, "_", " ")+" consistency could not be established", entryPaths(entries), "An inspected value for every audio file.", "Use audio formats whose relevant property can be inspected, or verify this property separately.")}
		}
		values[v] = true
		paths = append(paths, entry.Path)
	}
	if len(values) > 1 {
		return []Finding{finding("audio.mixed-"+strings.ReplaceAll(id, "_", "-"), SeverityWarning, title, paths, "One inspected value across the audio files.", "Confirm whether mixed technical properties are intentional.")}
	}
	return nil
}

func safeDisplayComponent(value string) bool {
	return value != "" && value != "." && value != ".." && !strings.ContainsAny(value, `/\\`) && !strings.ContainsRune(value, 0)
}

var errUnsafeReportPath = errors.New("report destination is unsafe")
