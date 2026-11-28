# Instructions Copilot

## But et architecture

Kanso MDM est une API NestJS pour gérer des aidants et leurs espaces pseudonymisés, les habilitations datées (mandats) et les appareils associés à ces espaces. Le modèle privilégie les pseudonymes plutôt que les données personnelles identifiantes.

- `src/main.ts` configure l’API sous le préfixe `/v1`, la validation globale stricte des DTO et le CORS avec identifiants pour le dashboard.
- `src/app.module.ts` assemble `PrismaModule`, `AuthModule` et `SpacesModule`. Les contrôleurs exposent les routes; les services portent les règles métier et l’accès à Prisma.
- `src/prisma/` fournit le client partagé. `prisma/schema.prisma` est la source du modèle PostgreSQL; les évolutions persistantes doivent aussi avoir une nouvelle migration sous `prisma/migrations/`.
- `src/auth/` gère les comptes, le TOTP et les codes de secours, ainsi que les sessions. Le navigateur reçoit un cookie de session HttpOnly; les sessions et codes sensibles sont stockés sous forme de HMAC, et les secrets TOTP sont chiffrés avec `TOTP_ENCRYPTION_KEY`. Le guard de session est celui actuellement appliqué aux routes métier; `JwtAuthGuard` valide les tokens d’accès Bearer.
- `src/spaces/` gère les espaces, les appartenances, les contacts, les mandats et l’administration des appareils. Les contacts ne contiennent qu’un identifiant opaque et un niveau de confiance, sans historique d’échanges. Les routes de mandats sont rattachées à un espace et les mandats en vigueur sont filtrés par dates et révocation.

## État fonctionnel observé

- Comptes et authentification par mot de passe, sessions, MFA TOTP et récupération sont implémentés.
- Les aidants peuvent créer un espace, dont ils deviennent membres; les espaces permettent plusieurs membres.
- Les mandats peuvent être créés et consultés lorsqu’ils sont en vigueur.
- Les membres d’un espace peuvent créer, consulter, modifier et supprimer ses contacts; les niveaux acceptés sont `connu`, `en_validation` et `inconnu`.
- Les appareils peuvent être listés, créés, renommés et révoqués par un membre de l’espace. L’API génère un code d’appairage temporaire pour un appareil `PENDING`; ne présume pas que la consommation du code ou l’activation de l’appareil existe, car ces routes ne figurent pas dans le code actuel.

## Commandes

Node 22 est indiqué comme prérequis dans le README. Configurer `.env` à partir de `.env.example`; `JWT_SECRET` (au moins 32 caractères) et `TOTP_ENCRYPTION_KEY` (32 octets encodés en base64) sont requis au démarrage. Avec Docker, `docker compose up -d --build` lance l’environnement de développement (PostgreSQL inclus); la production utilise explicitement `docker compose -f docker-compose.prod.yml ...`.

```bash
npm run build
npm run check
npm run lint                 # ESLint avec --fix (modifie les fichiers)
npm run test                 # suite Jest unitaire
npm test -- --runInBand --runTestsByPath src/auth/session-auth.guard.spec.ts
npm test -- --runInBand --runTestsByPath src/spaces/spaces.service.spec.ts
npm run test:e2e
npm run test:e2e -- --runInBand --runTestsByPath test/app.e2e-spec.ts
```

Les tests e2e utilisent l’application et PostgreSQL; préparer `.env` et la base avant de les lancer. Pour démarrer uniquement PostgreSQL en local, utiliser `npm run db:up`. Créer les migrations de développement avec `npm run db:migrate -- --name nom_de_migration`; déployer les migrations existantes avec `npm run db:deploy`.

À l’état actuel, `npm run check` échoue dans ESLint car le plugin `@typescript-eslint` référencé par la configuration n’est pas chargé.

## Conventions propres au dépôt

- Les contrôleurs utilisent les DTO avec `class-validator`; la `ValidationPipe` globale rejette les propriétés inconnues. Garder les validations des paramètres d’entrée dans les DTO.
- Les routes nécessitant une identité utilisent `SessionAuthGuard` et `@HelperId()`/`@SessionId()`. Un token MFA ne doit jamais être accepté comme token d’accès : conserver la vérification du claim `purpose`.
- Toujours limiter les lectures et écritures d’espace/appareil à l’appartenance de l’aidant, idéalement dans le filtre Prisma de l’opération. Le contrôleur traduit les résultats absents en `404`, ce qui évite de révéler les ressources d’un autre membre.
- Utiliser des `select` Prisma explicites pour les réponses; ne jamais renvoyer les empreintes, secrets chiffrés ou tokens bruts.
- Les scopes de mandat sont des chaînes de capacités au format pointé (ex. `contacts.gerer`), pas un booléen administrateur. Les dates de fin doivent être postérieures aux dates de début.
- Les erreurs de contrainte d’unicité Prisma (`P2002`) sont converties en conflits HTTP lorsque l’API expose une contrainte métier.
- Le style est Google TypeScript Style (`gts`) avec Prettier; les accolades d’objets suivent le format sans espaces utilisé par les fichiers TypeScript existants.

## Reprise — tâche KSOS-53 contacts

- Branche de travail : `KSOS-53-modèle-contact--niveau-de-confiance`. La fonctionnalité contacts est déjà implémentée localement mais n’est pas commitée; préserver les changements existants et ne pas changer de branche ni les réinitialiser sans demande.
- L’implémentation ajoute `Contact` lié à `Space`, avec uniquement `identifier` et `trustLevel` (`connu`, `en_validation`, `inconnu`), sans historique d’échanges. Les routes sont `GET/POST /v1/spaces/:spaceId/contacts` et `PATCH/DELETE /v1/spaces/:spaceId/contacts/:contactId`; elles sont protégées par session et limitées à l’appartenance à l’espace.
- Les fichiers de la fonctionnalité incluent `prisma/schema.prisma`, `prisma/migrations/20261124151400_add_contacts/migration.sql`, `src/spaces/spaces.controller.ts`, `src/spaces/spaces.service.ts`, les DTO de contact et `src/spaces/contacts.service.spec.ts`.
- Déjà vérifiés : schéma Prisma valide, client Prisma généré, `npm run build`, formatage Prettier et 19 tests ciblés pour contacts/espaces.
- La migration n’a pas été appliquée à une base. Pour reprendre : inspecter les changements non commités et poursuivre la validation éventuelle des routes HTTP; n’appliquer la migration à la base que si cela est demandé ou nécessaire à un test avec PostgreSQL.
