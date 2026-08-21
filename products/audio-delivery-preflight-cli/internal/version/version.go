// Package version is the single source for the CLI product version and the
// exact reviewed toolchain required to construct reproducible archives.
package version

const (
	Current   = "1.0.0"
	Toolchain = "go1.26.3"
)

// Value is linked into each release executable with -X. It starts at Current
// so local development builds report the same source version.
var Value = Current
