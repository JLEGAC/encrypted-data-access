# État technique

## Réalisé

- deux familles de fichiers publics : `encrypted-data-public.json` et `[nom]-public.json` ;
- coffre administrateur AES-GCM protégé par une phrase aléatoire dérivée avec PBKDF2 ;
- mémorisation facultative de la clé non exportable dans IndexedDB et verrouillage après 15 minutes ;
- rotation de la clé de base lors d’une révocation ;
- noms accentués et espacés transformés automatiquement, avec blocage des collisions ;
- thèmes clair, sombre et automatique ;
- français et anglais avec anglais comme langue de secours ;
- configuration de marque dans `config/ui-config.json` ;
- workflow GitHub Actions bloquant le déploiement en cas d’échec critique ;
- tests cryptographiques, coffre, formats, collisions et ZIP.

## Publication

Le propriétaire doit remplacer les anciens fichiers de son dépôt par le contenu de cette archive, conserver `data/encrypted-data-public.json`, puis choisir GitHub Actions comme source GitHub Pages.

## Contrainte

Les opérations d’administration comparent la révision publique à la révision chargée. Il faut publier le ZIP d’une opération avant d’en commencer une autre depuis un autre appareil.
