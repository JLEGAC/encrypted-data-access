# Encrypted Data Access

[Version française](README.fr.md)

A serverless PWA for publishing encrypted text files on GitHub Pages and granting browser-specific access. Encryption, decryption and administration happen locally in the browser.

## Important files

| Role | File | Location | Purpose |
|---|---|---|---|
| Public system and encrypted admin vault | `data/encrypted-data-public.json` | GitHub | Lists protected databases and stores the encrypted administration vault. It contains no plaintext key or password. |
| Encrypted database and public grants | `data/[web-name]-public.json` | GitHub | Contains encrypted data plus the individually wrapped data key for authorized installations. |
| Original clear file | Original filename | Outside GitHub | Required to create, update or re-encrypt a database. |
| Optional recovery copy | `admin-recovery-SECRET.txt` | Outside GitHub | Contains the recovery phrase. Copying it directly into a password manager is preferred. |

The recovery phrase is shown only once during first setup. Losing it permanently prevents administration from a new device. Revoking a user rotates the database key and re-encrypts the original file.

## Setup

1. Publish the repository with GitHub Pages.
2. Open `administration.html` and create the administrator vault.
3. Save the recovery phrase in a password manager.
4. Upload the generated `encrypted-data-public.json` to `data/`.
5. Encrypt a clear source file and upload both public files found in the generated ZIP.

See [CUSTOMIZATION.md](CUSTOMIZATION.md) to change branding, themes and languages.

## GitHub browser upload warning

Folders beginning with a dot can be missed when using drag-and-drop in a browser. Verify that `.github/workflows/` and `.gitignore` are present after upload. If not, create them with GitHub’s **Add file → Create new file** and enter the complete path.

For critical checks to block publication, configure **Settings → Pages → Source: GitHub Actions**. The workflow tests cryptography and formats and rejects filenames containing `SECRET` or `.key` before deployment.

## Development

```bash
npm test
npm run check:private
```

No CDN is required. See [SECURITY.md](SECURITY.md).
