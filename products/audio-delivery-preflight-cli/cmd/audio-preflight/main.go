package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"strings"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/version"
	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/preflight"
)

const (
	exitReady                = 0
	exitWarnings             = 1
	exitRequirementsNotMet   = 2
	exitInvalidConfiguration = 3
	exitScanStartFailure     = 4
	exitInternalFailure      = 5
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		printUsage(stderr)
		return exitInvalidConfiguration
	}
	switch args[0] {
	case "version":
		if len(args) != 1 {
			printUsage(stderr)
			return exitInvalidConfiguration
		}
		fmt.Fprintln(stdout, version.Value)
		return exitReady
	case "presets":
		if len(args) != 1 {
			printUsage(stderr)
			return exitInvalidConfiguration
		}
		for _, preset := range preflight.Presets() {
			fmt.Fprintf(stdout, "%s\t%s\n", preset.ID, preset.Name)
		}
		return exitReady
	case "preset":
		return runPreset(args[1:], stdout, stderr)
	case "scan":
		return runScan(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "invalid command %q\n", args[0])
		printUsage(stderr)
		return exitInvalidConfiguration
	}
}

func runPreset(args []string, stdout, stderr io.Writer) int {
	if len(args) != 2 || args[0] != "show" {
		printUsage(stderr)
		return exitInvalidConfiguration
	}
	preset, err := preflight.PresetByID(args[1])
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitInvalidConfiguration
	}
	fmt.Fprintf(stdout, "%s (%s)\n%s\n", preset.Name, preset.ID, preset.Description)
	for _, requirement := range preset.Requirements {
		fmt.Fprintf(stdout, "- %s\n", requirement)
	}
	return exitReady
}

type scanOptions struct {
	root         string
	presetID     string
	destinations preflight.ReportDestinations
}

func runScan(args []string, stdout, stderr io.Writer) int {
	options, err := parseScanOptions(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		printUsage(stderr)
		return exitInvalidConfiguration
	}
	preset, err := preflight.PresetByID(options.presetID)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitInvalidConfiguration
	}
	prepared, err := preflight.PrepareReportDestinations(options.root, options.destinations)
	if err != nil {
		fmt.Fprintf(stderr, "invalid report destination: %v\n", err)
		return exitInvalidConfiguration
	}
	defer prepared.Close()
	if err := scanRootCanStart(options.root); err != nil {
		fmt.Fprintf(stderr, "scan could not start: %v\n", err)
		return exitScanStartFailure
	}
	if err := prepared.ValidateSourceBoundary(options.root); err != nil {
		if preflight.IsReportDestinationConfigurationError(err) {
			fmt.Fprintf(stderr, "invalid report destination: %v\n", err)
			return exitInvalidConfiguration
		}
		fmt.Fprintf(stderr, "scan could not start: %v\n", err)
		return exitScanStartFailure
	}
	report, err := preflight.AnalyzeDirectory(options.root, preset)
	if err != nil {
		fmt.Fprintf(stderr, "scan could not complete reliably: %v\n", err)
		return exitScanStartFailure
	}
	if err := prepared.Write(report); err != nil {
		if preflight.IsReportDestinationConfigurationError(err) {
			fmt.Fprintf(stderr, "invalid report destination: %v\n", err)
			return exitInvalidConfiguration
		}
		fmt.Fprintf(stderr, "report export failed: %v\n", err)
		return exitInternalFailure
	}
	fmt.Fprintf(stdout, "Preset: %s\n", report.Preset.Name)
	fmt.Fprintf(stdout, "Inventory entries: %d\n", len(report.Inventory.Entries))
	fmt.Fprintf(stdout, "Findings: %d\n", len(report.Findings))
	fmt.Fprintf(stdout, "Status: %s\n", report.Status)
	switch report.Status {
	case preflight.StatusReady:
		return exitReady
	case preflight.StatusWarnings:
		return exitWarnings
	case preflight.StatusRequirementsNotMet:
		return exitRequirementsNotMet
	default:
		fmt.Fprintln(stderr, "scan failed: unknown completed status")
		return exitInternalFailure
	}
}

func parseScanOptions(args []string) (scanOptions, error) {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return scanOptions{}, fmt.Errorf("scan requires one folder")
	}
	options := scanOptions{root: args[0], presetID: "general-audio"}
	seen := make(map[string]bool)
	for index := 1; index < len(args); index += 2 {
		if index+1 >= len(args) {
			return scanOptions{}, fmt.Errorf("option %q requires a value", args[index])
		}
		flag, value := args[index], args[index+1]
		if !strings.HasPrefix(flag, "--") || value == "" || seen[flag] {
			return scanOptions{}, fmt.Errorf("invalid or duplicate option %q", flag)
		}
		seen[flag] = true
		switch flag {
		case "--preset":
			options.presetID = value
		case "--report-html":
			options.destinations.HTML = value
		case "--report-json":
			options.destinations.JSON = value
		case "--checksums":
			options.destinations.Checksums = value
		case "--preset-file":
			return scanOptions{}, fmt.Errorf("custom preset-file import is not available in version %s", version.Value)
		default:
			return scanOptions{}, fmt.Errorf("unknown option %q", flag)
		}
	}
	return options, nil
}

func scanRootCanStart(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return fmt.Errorf("selected folder must not be a symbolic link")
	}
	if !info.IsDir() {
		return fmt.Errorf("selected path must be a directory")
	}
	return nil
}

func printUsage(writer io.Writer) {
	fmt.Fprintln(writer, "usage: audio-preflight scan <folder> [--preset <id>] [--report-html <new-path>] [--report-json <new-path>] [--checksums <new-path>]")
	fmt.Fprintln(writer, "       audio-preflight presets")
	fmt.Fprintln(writer, "       audio-preflight preset show <id>")
	fmt.Fprintln(writer, "       audio-preflight version")
}
