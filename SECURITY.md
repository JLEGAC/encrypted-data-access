# Security

All cryptographic operations run locally with Web Crypto. Protected data uses AES-GCM-256. Each browser installation owns a non-exportable RSA-OAEP private key stored in IndexedDB.

The public file `data/encrypted-data-public.json` contains the administrator vault encrypted with AES-GCM. Its key is derived from the recovery phrase with PBKDF2-SHA-256 and 600,000 iterations plus a random salt. Neither the phrase nor a verifier is published.

Never publish:

- an original clear file;
- `admin-recovery-SECRET.txt`;
- any `.key` file or filename containing `SECRET`;
- a decrypted export.

An attacker can try recovery phrases offline because the encrypted vault is public. Use only the random phrase generated at first setup and keep it in a password manager. Revoking access protects future versions by rotating the database key; it cannot erase a copy previously downloaded by an authorized user.

The remembered administrator key is non-exportable and stored in IndexedDB. The administration locks after 15 minutes of inactivity. The ✕ button locks the vault and deletes this remembered key.
