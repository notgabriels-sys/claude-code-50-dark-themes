package main

import (
	"strings"
	"testing"

	"github.com/gabrielgarciaalonso/audio-delivery-preflight-cli/internal/release"
)

func TestVerificationSuccessMessageNamesArchiveMode(t *testing.T) {
	privateMessage := verificationSuccessMessage(release.PrivateCandidate, "/tmp/private.tar.gz")
	if !strings.Contains(privateMessage, "Private candidate archive verified") {
		t.Fatalf("private success message = %q", privateMessage)
	}
	customerMessage := verificationSuccessMessage(release.CustomerRelease, "/tmp/customer.tar.gz")
	if !strings.Contains(customerMessage, "Customer release archive verified") || strings.Contains(customerMessage, "Private candidate") {
		t.Fatalf("customer success message = %q", customerMessage)
	}
}
