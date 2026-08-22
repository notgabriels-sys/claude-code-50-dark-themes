# Verify a release archive

The packager replaces this repository template inside every archive with
instructions containing that archive's exact filename, release status,
platform, source revision, license filename, verifier mode, and sidecar command.
Follow the generated `VERIFY_SHA256.md` shipped inside the archive being
verified.

The separately supplied `.sha256` sidecar must be checked before extraction.
The stream verifier then validates release mode and provenance, rejects unsafe
or inconsistent members, and checks every regular file against
`SHA256SUMS.txt` without extracting the archive.

Private-candidate and customer-release archives are distinct. A private
candidate contains `CUSTOMER_LICENSE_DRAFT.md`; a customer release requires and
contains the explicit owner-supplied `LICENSE.txt`. This template does not
accept license terms or confer customer-release status.
