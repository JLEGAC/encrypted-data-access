# Customization

Edit `config/ui-config.json` to change application names, descriptions, logo path, supported languages and colors without touching JavaScript. Keep colors in six-digit hexadecimal form and logo paths relative to the project.

Translations live in `locales/fr.json` and `locales/en.json`. English is the fallback. Add a locale file and its language code to `supportedLanguages` to extend the interface. Update the PWA manifest names and icons separately because browsers read the manifest directly.
