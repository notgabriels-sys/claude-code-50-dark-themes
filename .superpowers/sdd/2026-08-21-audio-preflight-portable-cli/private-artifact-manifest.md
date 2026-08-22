# Audio Delivery Preflight CLI 1.0.0 — private artifact manifest

Generated: 2026-08-22
Source revision: `c04f227`
Status: private engineering candidates only

These archives are not public customer releases. They contain
`CUSTOMER_LICENSE_DRAFT.md`; no final customer license has been accepted. They
must not be uploaded to Gumroad, linked from the shop, sold, or described as
customer-ready.

The hashes below were produced from a clean tree at `c04f227` and supersede the
earlier `dc49778` set. Every archive embeds its own source revision in
`RELEASE_MANIFEST.json`, so a candidate built from a different revision will not
match these values.

| Platform | Archive | Archive SHA-256 | Sidecar-file SHA-256 |
| --- | --- | --- | --- |
| macOS Apple Silicon | `audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz` | `ef57057c78e2f65322aa805b5d708398d78678729df72294f90f3fd0cc898500` | `19890d9b06d9018dd8d2a1de3a3e17c0d7182a3475d9d2e23ddcdf3d49c4a869` |
| macOS Intel | `audio-preflight-cli-private-candidate_1.0.0_darwin-amd64.tar.gz` | `f50ea04387dee00ef4e982e5794b87f2cc48eea682f8c9ffaebd9609a90d91e0` | `c3699c7d087da51f2bf82da92a6273daefafbd317a40d724236cb0f06b99b1f8` |
| Linux x86-64 | `audio-preflight-cli-private-candidate_1.0.0_linux-amd64.tar.gz` | `2a406645a4d96e5d99627201034c733a41e37344cc1f3b987e861827f68f259b` | `d8cd0edb7cdb4dc9be94514f48874c555ff0d25833270f44c964ceff423b3ddb` |

Local verification completed at this revision:

- all three archive streams and external sidecars verified;
- two Apple Silicon rebuilds were byte-for-byte identical, and identical to the
  archive recorded above;
- the Apple Silicon candidate passed extraction, external sidecar check,
  internal `SHA256SUMS.txt` check, version, presets, ready-status scan, and
  source immutability checks;
- the extracted `RELEASE_MANIFEST.json` records source revision `c04f227`,
  `go1.26.3`, `CGO_ENABLED=0`, and `trimpath`; and
- full tests, race detector, vet, formatting, and diff checks passed.

Remote verification completed at this revision:

- GitHub Actions run `32571165222` on `c04f227` is green in both jobs: the
  existing theme/shop `verify` job, and the CLI job covering formatting, Linux
  tests, the Linux race detector, vet, and the build and independent
  verification of all three private candidates plus the two-build Apple Silicon
  reproducibility comparison.

Unverified external gates:

- the packaged macOS Intel and Linux executables have not been run on matching
  hosts (CI builds and verifies those archives but does not execute their
  binaries);
- no accepted customer license exists;
- no Gumroad product/archive read-back, checkout, purchase, download, public
  tag, release, shop link, or publication exists.
