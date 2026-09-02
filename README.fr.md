# Encrypted Data Access

[English](README.md)

PWA sans serveur permettant de publier des fichiers texte chiffrés sur GitHub Pages et d’autoriser individuellement des navigateurs. Tout est traité localement.

## Fichiers importants

| Rôle | Nom | Destination | Fonction |
|---|---|---|---|
| Système public et coffre administrateur chiffré | `data/encrypted-data-public.json` | GitHub | Répertorie les bases et contient le coffre administrateur chiffré. Il ne contient aucune clé ni phrase en clair. |
| Données et autorisations publiques fusionnées | `data/[nom-compatible-Web]-public.json` | GitHub | Contient les données chiffrées et les clés de données enveloppées individuellement pour les navigateurs autorisés. |
| Original en clair | Nom d’origine | Hors GitHub | Sert à créer, mettre à jour ou rechiffrer la base. |
| Copie facultative de récupération | `admin-recovery-SECRET.txt` | Hors GitHub | Contient la phrase de récupération. Il est préférable de la copier dans un gestionnaire de mots de passe. |

La phrase est affichée une seule fois lors de la première mise en service. Sa perte empêche définitivement d’administrer le coffre depuis un nouvel appareil. Le retrait d’un utilisateur renouvelle la clé de la base et exige son original en clair.

## Publication

1. Ouvre `administration.html` et crée le coffre.
2. Sauvegarde la phrase de récupération.
3. Publie `encrypted-data-public.json` dans `data/`.
4. Chiffre un original puis publie les deux fichiers du dossier `PUBLIC-GITHUB` contenu dans le ZIP.

Voir [CUSTOMIZATION.fr.md](CUSTOMIZATION.fr.md) pour personnaliser l’interface.

## Attention au glisser-déposer GitHub

Le navigateur peut omettre les noms commençant par un point. Après un glisser-déposer, vérifie la présence de `.github/workflows/` et `.gitignore`. Sinon, utilise **Add file → Create new file** et saisis le chemin complet.

Pour bloquer le déploiement si un contrôle critique échoue, choisis **Settings → Pages → Source: GitHub Actions**.

## Vérifications

```bash
npm test
npm run check:private
```
