use serde::Serialize;

pub const SIGNATURE_FORMAT: &str = "--format=%G?%x1f%GS%x1f%GK";
const FIELD_SEPARATOR: char = '\u{1f}';

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignatureStatus {
    None,
    Good,
    GoodUntrusted,
    GoodExpired,
    GoodExpiredKey,
    GoodRevokedKey,
    Bad,
    Unverifiable,
}

impl SignatureStatus {
    pub fn from_code(code: char) -> Self {
        match code {
            'G' => Self::Good,
            'U' => Self::GoodUntrusted,
            'X' => Self::GoodExpired,
            'Y' => Self::GoodExpiredKey,
            'R' => Self::GoodRevokedKey,
            'B' => Self::Bad,
            'E' => Self::Unverifiable,
            _ => Self::None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    pub status: SignatureStatus,
    pub signer: Option<String>,
    pub key: Option<String>,
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn parse_signature(text: &str) -> SignatureInfo {
    let line = text.lines().next().unwrap_or("");
    let mut fields = line.split(FIELD_SEPARATOR);
    let status = fields
        .next()
        .and_then(|value| value.trim().chars().next())
        .map(SignatureStatus::from_code)
        .unwrap_or(SignatureStatus::None);
    let signer = fields.next().and_then(non_empty);
    let key = fields.next().and_then(non_empty);
    SignatureInfo {
        status,
        signer,
        key,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpgKey {
    pub key_id: String,
    pub fingerprint: Option<String>,
    pub user: Option<String>,
    pub created: Option<i64>,
    pub expires: Option<i64>,
    pub expired: bool,
}

fn decode_colon_escapes(value: &str) -> String {
    value.replace("\\x3a", ":").replace("\\x3A", ":")
}

pub fn parse_gpg_secret_keys(text: &str) -> Vec<GpgKey> {
    let mut keys: Vec<GpgKey> = Vec::new();
    let mut current: Option<GpgKey> = None;
    let mut in_primary = false;

    fn finish(key: &mut Option<GpgKey>, keys: &mut Vec<GpgKey>) {
        if let Some(done) = key.take() {
            keys.push(done);
        }
    }

    for line in text.lines() {
        let fields: Vec<&str> = line.split(':').collect();
        let record = fields.first().copied().unwrap_or("");
        match record {
            "sec" => {
                finish(&mut current, &mut keys);
                let validity = fields.get(1).copied().unwrap_or("");
                if validity == "r" {
                    in_primary = false;
                    continue;
                }
                let key_id = fields.get(4).copied().unwrap_or("").to_string();
                if key_id.is_empty() {
                    in_primary = false;
                    continue;
                }
                in_primary = true;
                current = Some(GpgKey {
                    key_id,
                    fingerprint: None,
                    user: None,
                    created: fields.get(5).and_then(|value| value.parse().ok()),
                    expires: fields.get(6).and_then(|value| value.parse().ok()),
                    expired: validity == "e",
                });
            }
            "fpr" if in_primary => {
                if let Some(key) = current.as_mut() {
                    if key.fingerprint.is_none() {
                        key.fingerprint = fields.get(9).copied().and_then(non_empty);
                    }
                }
            }
            "uid" if in_primary => {
                if let Some(key) = current.as_mut() {
                    if key.user.is_none() {
                        key.user = fields
                            .get(9)
                            .map(|value| decode_colon_escapes(value))
                            .and_then(|value| non_empty(&value));
                    }
                }
            }
            "ssb" => in_primary = false,
            _ => {}
        }
    }
    finish(&mut current, &mut keys);
    keys
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    pub path: String,
    pub kind: String,
    pub comment: Option<String>,
    pub fingerprint: Option<String>,
}

pub fn parse_ssh_public_key(text: &str, path: &str) -> Option<SshKey> {
    let line = text.lines().find(|line| !line.trim().is_empty())?;
    let mut parts = line.split_whitespace();
    let kind = parts.next()?;
    let blob = parts.next()?;
    let known = kind.starts_with("ssh-") || kind.starts_with("ecdsa-") || kind.starts_with("sk-");
    if !known || blob.is_empty() {
        return None;
    }
    let comment = parts.collect::<Vec<_>>().join(" ");
    Some(SshKey {
        path: path.to_string(),
        kind: kind.to_string(),
        comment: non_empty(&comment),
        fingerprint: None,
    })
}

pub fn parse_ssh_fingerprint(text: &str) -> Option<String> {
    text.split_whitespace()
        .find(|part| part.starts_with("SHA256:") || part.starts_with("MD5:"))
        .map(str::to_string)
}

pub fn parse_scoped_value(text: &str) -> Option<(String, String)> {
    let line = text.lines().next()?;
    let (scope, value) = line.split_once('\t')?;
    Some((scope.trim().to_string(), value.trim().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_every_signature_code() {
        let expected = [
            ('G', SignatureStatus::Good),
            ('U', SignatureStatus::GoodUntrusted),
            ('X', SignatureStatus::GoodExpired),
            ('Y', SignatureStatus::GoodExpiredKey),
            ('R', SignatureStatus::GoodRevokedKey),
            ('B', SignatureStatus::Bad),
            ('E', SignatureStatus::Unverifiable),
            ('N', SignatureStatus::None),
            ('?', SignatureStatus::None),
        ];
        for (code, status) in expected {
            assert_eq!(SignatureStatus::from_code(code), status);
        }
    }

    #[test]
    fn parses_signature_lines_with_and_without_signers() {
        let signed = parse_signature("G\u{1f}Ana <ana@example.com>\u{1f}ABCDEF0123456789\n");
        assert_eq!(signed.status, SignatureStatus::Good);
        assert_eq!(signed.signer.as_deref(), Some("Ana <ana@example.com>"));
        assert_eq!(signed.key.as_deref(), Some("ABCDEF0123456789"));

        let unsigned = parse_signature("N\u{1f}\u{1f}\n");
        assert_eq!(unsigned.status, SignatureStatus::None);
        assert_eq!(unsigned.signer, None);
        assert_eq!(unsigned.key, None);

        assert_eq!(parse_signature("").status, SignatureStatus::None);
    }

    #[test]
    fn parses_gpg_colon_listings() {
        let text = "tru::1:1700000000:0:3:1:5\n\
sec:u:255:22:AAAA1111BBBB2222:1700000000:::u:::scESC:::+:::23::0:\n\
fpr:::::::::0123456789ABCDEF0123456789ABCDEF01234567:\n\
grp:::::::::AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:\n\
uid:u::::1700000000::HASH::Ana Perez <ana@example.com>::::::::::0:\n\
uid:u::::1700000001::HASH2::Ana Work <ana@work.example>::::::::::0:\n\
ssb:u:255:18:CCCC3333DDDD4444:1700000000::::::e:::+::cv25519::\n\
fpr:::::::::FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:\n\
sec:e:3072:1:EEEE5555FFFF6666:1500000000:1600000000::u:::scESC:::+::::\n\
fpr:::::::::1111111111111111111111111111111111111111:\n\
uid:e::::1500000000::HASH3::Old Key <old@example.com>::::::::::0:\n\
sec:r:3072:1:7777888899990000:1400000000:::u:::scESC:::+::::\n\
fpr:::::::::2222222222222222222222222222222222222222:\n\
uid:r::::1400000000::HASH4::Revoked <rev@example.com>::::::::::0:\n";
        let keys = parse_gpg_secret_keys(text);
        assert_eq!(keys.len(), 2);

        assert_eq!(keys[0].key_id, "AAAA1111BBBB2222");
        assert_eq!(
            keys[0].fingerprint.as_deref(),
            Some("0123456789ABCDEF0123456789ABCDEF01234567")
        );
        assert_eq!(keys[0].user.as_deref(), Some("Ana Perez <ana@example.com>"));
        assert_eq!(keys[0].created, Some(1_700_000_000));
        assert_eq!(keys[0].expires, None);
        assert!(!keys[0].expired);

        assert_eq!(keys[1].key_id, "EEEE5555FFFF6666");
        assert!(keys[1].expired);
        assert_eq!(keys[1].expires, Some(1_600_000_000));
    }

    #[test]
    fn decodes_escaped_colons_in_user_ids() {
        let text = "sec:u:255:22:ABCD:1700000000:::u:::scESC:::+:::23::0:\nfpr:::::::::AAAA:\nuid:u::::1700000000::H::Team\\x3a Dev <dev@example.com>::::::::::0:\n";
        let keys = parse_gpg_secret_keys(text);
        assert_eq!(keys[0].user.as_deref(), Some("Team: Dev <dev@example.com>"));
    }

    #[test]
    fn empty_listing_has_no_keys() {
        assert!(parse_gpg_secret_keys("").is_empty());
        assert!(parse_gpg_secret_keys("gpg: nothing\n").is_empty());
    }

    #[test]
    fn parses_ssh_public_keys() {
        let key = parse_ssh_public_key(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample ana@laptop\n",
            "/home/ana/.ssh/id_ed25519.pub",
        )
        .expect("key");
        assert_eq!(key.kind, "ssh-ed25519");
        assert_eq!(key.comment.as_deref(), Some("ana@laptop"));
        assert_eq!(key.path, "/home/ana/.ssh/id_ed25519.pub");

        let no_comment = parse_ssh_public_key("ssh-rsa AAAAB3Nza\n", "k.pub").expect("key");
        assert_eq!(no_comment.comment, None);

        assert!(parse_ssh_public_key("-----BEGIN OPENSSH PRIVATE KEY-----", "k").is_none());
        assert!(parse_ssh_public_key("", "k").is_none());
    }

    #[test]
    fn extracts_ssh_fingerprints() {
        assert_eq!(
            parse_ssh_fingerprint("256 SHA256:abcDEF123 ana@laptop (ED25519)\n").as_deref(),
            Some("SHA256:abcDEF123")
        );
        assert_eq!(parse_ssh_fingerprint("garbage"), None);
    }

    #[test]
    fn parses_scoped_config_output() {
        assert_eq!(
            parse_scoped_value("local\ttrue\n"),
            Some(("local".to_string(), "true".to_string()))
        );
        assert_eq!(parse_scoped_value(""), None);
        assert_eq!(parse_scoped_value("no tab here"), None);
    }
}
