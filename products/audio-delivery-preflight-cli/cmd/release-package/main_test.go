package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteSidecarWritesArchiveDigest(t *testing.T) {
	directory := t.TempDir()
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(archive, []byte("archive bytes"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := writeSidecar(archive, sidecar); err != nil {
		t.Fatalf("writeSidecar() error = %v", err)
	}
	contents, err := os.ReadFile(sidecar)
	if err != nil {
		t.Fatal(err)
	}
	const want = "cc9c340301ad4ba5e54aa24b442ff938d1ed84f7f32c4c5a73773c58af37bd1b  candidate.tar.gz\n"
	if string(contents) != want {
		t.Fatalf("sidecar contents = %q, want %q", contents, want)
	}
}

func TestWriteSidecarRemovesPartialFileAfterInjectedWriteFailure(t *testing.T) {
	directory := t.TempDir()
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(archive, []byte("archive bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	injected := errors.New("injected sidecar write failure")

	err := writeSidecarWithOpener(archive, sidecar, func(path string, flag int, mode os.FileMode) (sidecarFile, error) {
		file, err := os.OpenFile(path, flag, mode)
		if err != nil {
			return nil, err
		}
		return &faultSidecarFile{File: file, writeErr: injected}, nil
	})
	assertErrorContains(t, err, injected.Error())
	assertPathAbsent(t, sidecar)
}

func TestWriteSidecarRemovesFileAfterInjectedCloseFailure(t *testing.T) {
	directory := t.TempDir()
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(archive, []byte("archive bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	injected := errors.New("injected sidecar close failure")

	err := writeSidecarWithOpener(archive, sidecar, func(path string, flag int, mode os.FileMode) (sidecarFile, error) {
		file, err := os.OpenFile(path, flag, mode)
		if err != nil {
			return nil, err
		}
		return &faultSidecarFile{File: file, closeErr: injected}, nil
	})
	assertErrorContains(t, err, injected.Error())
	assertPathAbsent(t, sidecar)
}

func TestPublishPairRejectsPreExistingArchiveWithoutPublishingSidecar(t *testing.T) {
	directory := t.TempDir()
	stagedArchive, stagedSidecar := stagedPair(t, directory)
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(archive, []byte("pre-existing archive"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := publishPair(stagedArchive, stagedSidecar, archive, sidecar); err == nil {
		t.Fatal("publishPair() replaced a pre-existing archive")
	}
	assertFileContents(t, archive, "pre-existing archive")
	assertPathAbsent(t, sidecar)
}

func TestPublishPairRejectsPreExistingSidecarAndRollsBackArchive(t *testing.T) {
	directory := t.TempDir()
	stagedArchive, stagedSidecar := stagedPair(t, directory)
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(sidecar, []byte("pre-existing sidecar"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := publishPair(stagedArchive, stagedSidecar, archive, sidecar); err == nil {
		t.Fatal("publishPair() replaced a pre-existing sidecar")
	}
	assertPathAbsent(t, archive)
	assertFileContents(t, sidecar, "pre-existing sidecar")
}

func TestPublishPairPublishesCompleteArchiveAndSidecarPair(t *testing.T) {
	directory := t.TempDir()
	stagedArchive, stagedSidecar := stagedPair(t, directory)
	archive := filepath.Join(directory, "candidate.tar.gz")
	sidecar := archive + ".sha256"

	if err := publishPair(stagedArchive, stagedSidecar, archive, sidecar); err != nil {
		t.Fatalf("publishPair() error = %v", err)
	}
	assertFileContents(t, archive, "staged archive")
	assertFileContents(t, sidecar, "staged sidecar")
}

func stagedPair(t *testing.T, directory string) (string, string) {
	t.Helper()
	stage := filepath.Join(directory, "stage")
	if err := os.Mkdir(stage, 0o755); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(stage, "candidate.tar.gz")
	sidecar := archive + ".sha256"
	if err := os.WriteFile(archive, []byte("staged archive"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sidecar, []byte("staged sidecar"), 0o644); err != nil {
		t.Fatal(err)
	}
	return archive, sidecar
}

func assertFileContents(t *testing.T, path, want string) {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != want {
		t.Fatalf("%s contents = %q, want %q", filepath.Base(path), contents, want)
	}
}

func assertPathAbsent(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("%s exists or could not be checked: %v", filepath.Base(path), err)
	}
}

func assertErrorContains(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("error = %v, want text %q", err, want)
	}
}

type faultSidecarFile struct {
	*os.File
	writeErr error
	closeErr error
}

func (file *faultSidecarFile) Write(value []byte) (int, error) {
	if file.writeErr != nil {
		return 0, file.writeErr
	}
	return file.File.Write(value)
}

func (file *faultSidecarFile) Close() error {
	err := file.File.Close()
	if file.closeErr != nil {
		return file.closeErr
	}
	return err
}
