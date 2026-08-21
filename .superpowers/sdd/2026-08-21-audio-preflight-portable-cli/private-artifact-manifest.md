# Audio Delivery Preflight CLI 1.0.0 — private artifact manifest

Generated: 2026-08-22
Source revision: `dc49778`
Status: private engineering candidates only

These archives are not public customer releases. They contain
`CUSTOMER_LICENSE_DRAFT.md`; no final customer license has been accepted. They
must not be uploaded to Gumroad, linked from the shop, sold, or described as
customer-ready.

| Platform | Archive | Archive SHA-256 | Sidecar-file SHA-256 |
| --- | --- | --- | --- |
| macOS Apple Silicon | `audio-preflight-cli-private-candidate_1.0.0_darwin-arm64.tar.gz` | `8a66ff2f132d5a7958665e18442349fa4794cae4ba602fd103cd054982fc9bea` | `70808cba06838ad142cec25c33e948a67edc0d41b286a6c42cec3280721bf9f8` |
| macOS Intel | `audio-preflight-cli-private-candidate_1.0.0_darwin-amd64.tar.gz` | `97d2a6d0534931b8535851e30e6e72c4042f721fb7a356bfdd8db52b49affdd4` | `b30a2c1e51cc790e95108cc9f843f6978e8ffdd7149c93e560c7865f12e4d261` |
| Linux x86-64 | `audio-preflight-cli-private-candidate_1.0.0_linux-amd64.tar.gz` | `b3f5c9049978e33ea585bab4bc1cbeca17dce6797a48a995e7b1d218607c6d89` | `4f581b49a5dd0961e862b2d57acafb2f3ca964fab53ea40c917a9d284f682510` |

Local verification completed:

- all three archive streams and external sidecars verified;
- two Apple Silicon rebuilds were byte-for-byte identical;
- the Apple Silicon candidate passed extraction, internal checksum, version,
  presets, ready-status scan, and source immutability checks;
- valid and adversarial scan regressions passed; and
- full tests, race detector, vet, formatting, and diff checks passed.

Unverified external gates:

- GitHub Actions has not run for this revision;
- macOS Intel and Linux executables have not run on matching hosts;
- no accepted customer license exists;
- no Gumroad product/archive read-back, checkout, purchase, download, public
  tag, release, shop link, or publication exists.
