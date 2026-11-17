# Kanso MDM Backend — guide d'exécution et de tests de performance

## 0. Prérequis

- Fedora/Linux avec Docker, le plugin Docker Compose (`docker compose version`), `curl`, `openssl`, `bash` ; k6 installé sur la machine pour `performance/run.sh api` (`k6 version`).
- Les ports locaux **3301** (API de test) et **55432** (PostgreSQL de test) disponibles.
- Pour utiliser les commandes ci-dessous : facultatif, mais pratique, `jq` (`sudo dnf install jq`).
- Avec Docker, inutile de démarrer séparément PostgreSQL ou NestJS sur ta machine.

```bash
docker version
docker compose version
k6 version
```

Si k6 est absent, voir <https://grafana.com/docs/k6/latest/set-up/install-k6/>. **Ne pas exécuter les tests destructifs contre la production.**

## 1. Première configuration (une seule fois)

```bash
cd ~/test-back-ei/kanso-mdm-backend
cp -n performance/.env.perf.example performance/.env.perf
chmod 600 performance/.env.perf
nano performance/.env.perf
```

Le fichier contient `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PERF_APP_PORT`, `PERF_DB_PORT`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`. Remplace **toutes** les valeurs de démonstration par des valeurs **propres aux tests**. Pour générer les secrets :

```bash
openssl rand -hex 32      # pour JWT_SECRET
openssl rand -base64 32   # pour TOTP_ENCRYPTION_KEY
```

## 2. Démarrer le projet de performance

```bash
bash performance/run.sh up
# Vérifier que les deux services sont UP :
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml ps
# Voir les logs de NestJS :
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml logs --tail=80 app
# La route de base doit répondre 200 :
curl -i http://127.0.0.1:3301/v1
```

`up` construit l'image de production, démarre `app` + `db` dans un **projet Compose séparé**, et exécute les migrations Prisma. Une image construite et des migrations réussies **ne garantissent pas** que `app` soit encore en cours d'exécution : vérifie `ps` et `curl` avant k6. La DB de test reste dans le volume `kanso-perf_perf_db_data` (nom Compose effectif à confirmer avec `docker volume ls`).

**En cas d'échec :**

```bash
sudo ss -ltnp | grep 3301 || true
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml ps -a
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml logs --tail=120 app
```

- `connection refused` : aucun processus n'écoute sur 3301 ; **ne lance pas k6** tant que `curl` ne répond pas.
- `TOTP_ENCRYPTION_KEY must be 32 bytes encoded in base64` : regénérer avec `openssl rand -base64 32`, le mettre dans `.env.perf`, puis recréer l'application :

```bash
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml up -d --force-recreate app
```

- `404` sur `/v1` : l'API est accessible mais le scénario `root` attend `200` ; vérifier la version du code et les routes.

## 3. Tests PostgreSQL — suite complète

```bash
bash performance/run.sh db
```

Exécute : `01_read`, `02_transfer`, `04_contention`, `05_isolation` à **1 / 10 / 50 / 100 clients, 1 000 transactions par combinaison** ; puis rollback intentionnel (`03_failure_rollback`), requête sur **100 000 lignes avant/après index** (`06_large_data`) et **deadlock provoqué**. Les résultats sont dans `performance/results/01_read_*.log`, `02_transfer_*.log`, `04_contention_*.log`, `05_isolation_*.log`, `large_data.log`, `deadlock.log`.

```bash
ls -lh performance/results/
grep -E 'number of failed transactions|latency average|tps =|exit_code=' performance/results/*.log
```

**Important :** les échecs de sérialisation du scénario `05_isolation` sont attendus lorsque les transactions concurrentes ciblent la même ligne, avec **une tentative seulement**. Les scripts rapportent ce comportement, ils ne mettent pas en place les retries Prisma de l'application. Les scripts `perf_*` sont des bancs SQL indépendants des modèles métier Prisma. Ne pas considérer automatiquement tous les résultats comme des validations de l'intégrité métier ; lire les erreurs et les invariants.

Inspecter les connexions SQL pendant une charge :

```bash
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml \
  exec -T db psql -U kanso_perf -d kanso_perf < performance/db/connection_pressure.sql
```

## 4. Tests API k6 — sans authentification

**Toujours faire le précontrôle** `curl -fsS http://127.0.0.1:3301/v1`.

```bash
# 100 requêtes, 10 utilisateurs virtuels
bash performance/run.sh api root -e VUS=10 -e ITERATIONS=100
# 1 000 requêtes, 100 utilisateurs virtuels
bash performance/run.sh api root -e VUS=100 -e ITERATIONS=1000
# 10 000 requêtes au total
bash performance/run.sh api root -e VUS=100 -e ITERATIONS=10000
# 401 attendu, sans cookie
bash performance/run.sh api unauthorized -e VUS=20 -e ITERATIONS=1000
```

Dans un profil `shared-iterations`, **1 000 est le total des requêtes**, et non 1 000 par utilisateur. Une réponse 401 prévue dans le scénario `unauthorized` est un **succès fonctionnel** du test de sécurité ; k6 peut néanmoins la classer comme erreur HTTP native (`http_req_failed`). Consulte `unexpected_response` et les checks, pas seulement `http_req_failed`.

### Profils de charge sur `/v1`

```bash
# Rampe 10 → 50 → 100 utilisateurs puis descente ; environ 6 min
bash performance/run.sh api root -e PROFILE=ramp
# Pic brutal ; autour de 100 secondes
bash performance/run.sh api root -e PROFILE=spike -e VUS=500
# Endurance : 30 utilisateurs actifs pendant 30 minutes
bash performance/run.sh api root -e PROFILE=soak -e VUS=30 -e DURATION=30m
# Endurance longue : 2 heures
bash performance/run.sh api root -e PROFILE=soak -e VUS=30 -e DURATION=2h
```

**Attention :** sans temps de réflexion (`THINK_TIME`), le profil maintient une charge aussi rapidement que possible ; avec `-e THINK_TIME=0.2`, chaque itération ajoute environ 200 ms de pause.

## 5. Préparer un compte, une session et un espace **de test**

**Dans un terminal dédié** (les variables `export` restent disponibles uniquement dans ce terminal) :

```bash
export PERF_EMAIL="perf-$(date +%s)@example.invalid"
read -rs -p 'Mot de passe du compte de test (8 caractères min.) : ' PERF_PASSWORD; echo
export PERF_PASSWORD
# Créer le compte ; 201 attendu
curl -fsS -X POST http://127.0.0.1:3301/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["PERF_EMAIL"],"password":os.environ["PERF_PASSWORD"]}))')"
# Se connecter et garder le cookie dans un fichier hors du dépôt
umask 077
curl -fsS -c /tmp/kanso-perf.cookies -X POST http://127.0.0.1:3301/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os;print(json.dumps({"email":os.environ["PERF_EMAIL"],"password":os.environ["PERF_PASSWORD"]}))' )" >/dev/null
# Extraire la valeur du cookie sans l'afficher
export SESSION_COOKIE="$(awk '$6=="kanso_session" {print $7}' /tmp/kanso-perf.cookies | tail -n1)"
test -n "$SESSION_COOKIE" || { echo 'Cookie absent : vérifier le login/MFA'; false; }
# Valider la session : 200 attendu
curl -sS -o /dev/null -w '%{http_code}\n' -H "Cookie: kanso_session=$SESSION_COOKIE" http://127.0.0.1:3301/v1/me
```

Si l'utilisateur a le MFA activé, le login demande un second facteur : utiliser plutôt un nouveau compte de test **sans MFA** pour les tests génériques. Le cookie est `HttpOnly` et peut être `Secure` : le header `Cookie` explicite dans k6 convient pour le benchmark HTTP local. **Évite d'afficher le cookie et ne le publie jamais.**

Récupérer l'ID de l'aidant associé à la session (pour les mandats) et créer un espace accessible :

```bash
export HELPER_ID="$(curl -fsS -H "Cookie: kanso_session=$SESSION_COOKIE" http://127.0.0.1:3301/v1/me | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')"
export SPACE_ID="$(curl -fsS -X POST http://127.0.0.1:3301/v1/spaces \
  -H 'Content-Type: application/json' -H "Cookie: kanso_session=$SESSION_COOKIE" \
  -d '{"pseudonym":"perf-space"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')"
test -n "$SPACE_ID" && echo 'Espace de test prêt'
```

Pour tester `multi-session`, créer **plusieurs comptes et connexions indépendants** et fournir un tableau JSON de **valeurs de cookies** à `SESSIONS_JSON`, et non des objets de cookie. Les sessions partagées ne simulent pas 100 identités indépendantes.

## 6. Commandes pour **tous les modes API existants**

À exécuter depuis le terminal où `SESSION_COOKIE`, `SPACE_ID`, `HELPER_ID`, `PERF_EMAIL` et `PERF_PASSWORD` ont été préparés. Ces valeurs restent réservées à l'environnement de test.

```bash
# Comparaison session unique / 100 clients
bash performance/run.sh api same-session -e SESSION_COOKIE="$SESSION_COOKIE" -e VUS=100 -e ITERATIONS=1000
# Plusieurs sessions : préparer SESSIONS_JSON='["cookie1","cookie2"]'
# bash performance/run.sh api multi-session -e SESSIONS_JSON="$SESSIONS_JSON" -e VUS=100 -e ITERATIONS=1000
# Lecture de l'espace créé
bash performance/run.sh api space-read -e SESSION_COOKIE="$SESSION_COOKIE" -e SPACE_ID="$SPACE_ID" -e VUS=100 -e ITERATIONS=1000
# Création de 100 espaces (ÉCRIT en base)
bash performance/run.sh api space-create -e SESSION_COOKIE="$SESSION_COOKIE" -e VUS=10 -e ITERATIONS=100
# Lecture d'un mandat : si aucun mandat actif pour l'aidant, 404 attendu
bash performance/run.sh api mandate-read -e SESSION_COOKIE="$SESSION_COOKIE" -e SPACE_ID="$SPACE_ID" -e EXPECT_STATUS=404 -e ITERATIONS=100
# Création d'un mandat (ÉCRIT en base) : fonctionne si la requête respecte les règles métier
# Attention : mêmes dates/ressource en concurrence peuvent donner des conflits métier.
bash performance/run.sh api mandate-create -e SESSION_COOKIE="$SESSION_COOKIE" -e SPACE_ID="$SPACE_ID" -e HELPER_ID="$HELPER_ID" -e VUS=1 -e ITERATIONS=1
# Lecture d'un mandat existant : adapter EXPECT_STATUS après avoir vérifié le résultat
bash performance/run.sh api mandate-read -e SESSION_COOKIE="$SESSION_COOKIE" -e SPACE_ID="$SPACE_ID" -e EXPECT_STATUS=200 -e ITERATIONS=100
# Connexions (potentiellement coûteuses en hash de mots de passe et créant des sessions)
bash performance/run.sh api login -e PERF_EMAIL="$PERF_EMAIL" -e PERF_PASSWORD="$PERF_PASSWORD" -e VUS=10 -e ITERATIONS=100
# Création de nouveaux comptes (ÉCRIT en base)
bash performance/run.sh api signup -e PERF_PASSWORD="$PERF_PASSWORD" -e VUS=10 -e ITERATIONS=100
# Erreurs de sécurité/validation : codes attendus 401, 404, 400
bash performance/run.sh api unauthorized -e VUS=10 -e ITERATIONS=100
bash performance/run.sh api not-found -e SESSION_COOKIE="$SESSION_COOKIE" -e ITERATIONS=100
bash performance/run.sh api invalid-payload -e SESSION_COOKIE="$SESSION_COOKIE" -e ITERATIONS=100
```

**Limites :** `mandate-create` n'est pas un test transactionnel isolé et peut entrer en conflit avec d'autres mandats ; lance-le sur une DB jetable. Les routes TOTP/recovery ne possèdent pas de modes de charge dédiés dans `scenarios.js`. `multi-session` exige un véritable jeu de cookies : la commande est volontairement un exemple à compléter, pas un test clé en main. Les tests HTTP n'assurent pas à eux seuls l'absence de bugs de concurrence métier.

Pour éviter les valeurs secrètes dans l'historique et les listes de processus, l'idéal est de lancer les scénarios depuis un poste isolé et de limiter les permissions des fichiers. `-e SESSION_COOKIE=...` peut exposer la valeur aux processus locaux.

## 7. Simuler une panne de base de données (manuel, deux terminaux)

**Terminal A** — charge sur une route **qui consulte la DB**, pendant 2 minutes :

```bash
bash performance/run.sh api same-session -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e PROFILE=soak -e VUS=10 -e DURATION=2m -e THINK_TIME=0.2
```

**Terminal B** — uniquement dans la stack **kanso-perf** :

```bash
bash performance/run.sh stop-db
sleep 5
bash performance/run.sh start-db
```

Attendre la fin du scénario et examiner les erreurs (503/500, timeout, p95) et le retour de l'API. Pour voir les logs :

```bash
docker compose --env-file performance/.env.perf -p kanso-perf -f performance/compose.perf.yml logs --tail=120 app
```

Ce test **provoque volontairement des échecs** ; il ne doit pas être exécuté sur les services de développement ordinaires ni sur la production.

## 8. Observer les ressources et les résultats

Pendant le benchmark (deuxième terminal) :

```bash
docker stats kanso-perf-app-1 kanso-perf-db-1
# Capture ponctuelle
bash performance/run.sh stats
```

Fichiers générés : `performance/results/<mode>_AAAAMMJJ_HHMMSS.json` pour k6 ; `performance/results/*.log` pour les tests SQL. Ne pas confondre un `p95=0ms` avec une excellente performance si **toutes les connexions sont refusées**. Toujours regarder `checks_succeeded`, `unexpected_response`, `http_req_failed`, puis `http_req_duration`, `p95`, `p99`, `http_reqs` et CPU/RAM.

Les thresholds actuels du scénario API : **p95 < 500 ms**, **réponses inattendues < 1 %**. Ils sont des objectifs de test, pas des garanties de production. Les tests sur `/v1` n'effectuent pas d'accès métier à PostgreSQL : pour tester Prisma et les sessions, préfère `/v1/me` et `/v1/spaces/:id`.

## 9. Tests logiciels (en plus de la performance)

Sur le dépôt (Node.js installé, dépendances disponibles) :

```bash
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run test:cov -- --runInBand
npm run check
```

Ces commandes viennent de `package.json` ; leur succès dépend de la disponibilité des dépendances et des services éventuellement requis par les tests. `npm run check` vérifie le style GTS. Ne lance pas `npm run lint` si tu ne veux pas modifier automatiquement les fichiers (`--fix`).

## 10. Nettoyer l'environnement de test

```bash
# Arrêter API + DB de performance, garder les données
bash performance/run.sh down
# DESTRUCTIF : supprimer uniquement le volume du projet de performance
CONFIRM_PERF_RESET=YES bash performance/run.sh reset-test-data
```

Le reset efface **définitivement** les données de la DB de performance (pas les autres stacks Docker). Les fichiers `performance/results/` restent sur le disque. Pour retirer le cookie temporaire : `rm -f /tmp/kanso-perf.cookies; unset SESSION_COOKIE PERF_PASSWORD`.

## 11. Ordre recommandé pour tout tester

1. `bash performance/run.sh up` ; vérifier `curl http://127.0.0.1:3301/v1` et les logs.
2. `bash performance/run.sh db` ; analyser les conflits `SERIALIZABLE` attendus.
3. `root` et `unauthorized` à 100 puis 1 000 requêtes.
4. Créer **un compte et espace de test**, vérifier `GET /v1/me`.
5. Lancer `same-session`, `space-read`, `space-create`, `not-found`, `invalid-payload`, `login`, `signup` ; éventuellement `multi-session` avec des sessions indépendantes.
6. Préparer les données métier puis `mandate-read` et `mandate-create`.
7. `PROFILE=ramp`, `PROFILE=spike`, puis `PROFILE=soak` (sur `root` **et** sur une route DB authentifiée).
8. Mesurer CPU/RAM, exporter les résultats ; réaliser le test de panne PostgreSQL **seulement** sur `kanso-perf`.
9. Arrêter proprement avec `bash performance/run.sh down`.

**Couverture réelle de cette suite :** DB SQL synthétique, principaux scénarios HTTP, profils de charge et coupure DB manuelle. **Non inclus en automatisation :** vrai test de pool Prisma saturé, injections mémoire/CPU/disque, vérifications d'atomicité métier (`ensureMember` + `mandate.create`), rejeu TOTP et codes de récupération. Ils nécessitent des fixtures et assertions dédiées ; ne pas les présenter comme déjà validés.
