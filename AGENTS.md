# AGENTS.md — Conventions de travail (pulse_project)

> **Source de vérité unique des conventions de ce dépôt.** Lue nativement par **Codex**, et par **Claude Code** via `CLAUDE.md`, qui l'importe (`@AGENTS.md`).
> **Socle commun** — les §0 à §6 sont le socle partagé par tous les projets : même texte partout, à quelques valeurs près (nom de la branche stable, contenu de la commande `porte`, outils de test), toutes rappelées en §7. La §7 est propre à ce dépôt.
> En cas de conflit entre ce fichier et le code : **s'arrêter et signaler**, ne jamais trancher en silence.

---

## 0. Règles pour les agents (Claude & Codex)

- **AGENTS.md fait foi.** Si une info manque (une règle, un choix d'archi, une valeur métier), **demander — ne jamais inventer**. Toute proposition de comblement est taguée `💡 [proposé — à valider]` dans la doc ou la PR.
- **Un agent = un ticket = une branche à la fois.** Deux agents ne travaillent jamais sur les mêmes fichiers en parallèle.
- **Revue croisée.** Faire relire le diff d'un agent par l'autre (ex. `/code-review` côté Claude) avant d'ouvrir la PR.
- **Commits : l'agent propose, le dev commite.** L'agent rédige le message de commit ; le dev le valide et commite lui-même (GitKraken). **Aucun footer `Co-Authored-By`.**
- **Jamais** de commit direct sur `main`/`dev`, **jamais** de `push`/`merge`/`tag` par un agent sans demande explicite.

### Plusieurs agents en parallèle

- **Le brief écrit le périmètre** : les fichiers que l'agent possède, et ceux auxquels il ne touche pas.
- **Un port de test par copie.** Chaque copie du dépôt (worktree) qui lance les tests fixe son port (`PORT_E2E=3101`, `3102`…). Sinon `reuseExistingServer` fait lire le serveur d'une autre copie, et la porte voit des tests verts sur un code qui n'est pas le sien.
- **Aucun relevé depuis une branche** (nombre de tests, couverture, compteurs) : il est périmé dès la fusion suivante. Les relevés se font une fois, sur `dev`, après la dernière fusion.
- **Fichiers partagés** (CHANGELOG, journal) : ajouter en fin de section ; un conflit se résout en gardant les deux côtés.
- **Numérotation partagée** (tickets, ADR) : le brief annonce le dernier numéro attribué, et on vérifie qu'un ID est libre avant de le poser. En cas de collision, celui qui est déjà fusionné garde son numéro.

---

## 1. Workflow Git

```
main  ← stable, taggué (vX.Y.Z) — PR depuis dev uniquement
  └── dev  ← intégration continue — PR depuis les branches de travail
        ├── feat/<TICKET_ID>      (ex. feat/door-first-visit)
        ├── fix/<description>     (ex. fix/autosave-resume)
        └── chore/<description>   (maintenance, docs, deps, outillage)
```

- Pas de commit direct sur `main` ni `dev` → **tout passe par PR**.
- Une PR = un ticket (ou un lot cohérent de petits tickets liés).
- Branches de travail → `dev` : **squash merge**. `dev → main` : **merge classique** (préserve l'historique). Tag à chaque release.
- **Resync obligatoire après chaque `dev → main`** :
  ```bash
  git checkout dev && git merge --ff-only main && git push origin dev
  ```
  Check qui doit passer : `git log --oneline main..dev` **vide**.
- `wip:` autorisé pour un commit de session interrompue sur une branche de travail (squashé à la PR).

---

## 2. Conventional Commits

Format : `type(scope): description courte`

| Type | Quand l'utiliser |
|---|---|
| `feat` | nouvelle fonctionnalité visible |
| `fix` | correction de bug |
| `test` | ajout/modif de tests sans changement de code prod |
| `refactor` | restructuration sans changement de comportement |
| `chore` | maintenance, deps, scripts, config |
| `docs` | documentation seule |
| `style` | formatage (rien sur la logique) |
| `perf` | optimisation de performance |

Les **scopes** et la **langue des messages** sont propres au projet → voir §7.

---

## 3. Definition of Done (par type de ticket)

Vérifier **tous** les critères du type avant de fermer un ticket.

- **Feature (logique)** — code au pattern existant · **test unitaire** (logique pure) · **test fonctionnel** (action d'état) · **scénario** si la feature entre dans une boucle · **porte verte** (§5) · doc d'état à jour.
- **Feature (UI)** — respecte le design system / tokens · **smoke test de rendu** · pas de régression sur les écrans voisins · accessibilité minimum (`alt`, contraste) · capture si pertinent.
- **Bug fix** — **test de régression écrit AVANT le fix (TDD strict)** : il échoue d'abord, c'est ce qui prouve qu'il garde (§5) · tests verts après · stack trace originale notée dans le commit si pertinent.
- **Refactor** — tests existants verts (zéro changement de comportement) · pas de nouvelle dépendance injustifiée · taille du livrable stable (±5 %).
- **Data / contenu** — **test de structure** (champs requis, IDs uniques, références valides) · nommage cohérent (§7).
- **Docs / process** — markdown lisible · liens internes valides · CHANGELOG mis à jour si impact workflow.

---

## 4. Process de Pull Request

**Branche de travail → `dev`**
1. **Porte verte** (§5) sur la branche.
2. Push la branche (`git push -u origin <branche>`).
3. PR titrée **comme un commit** (`type(scope): …`).
4. Description = lien vers le ticket + changements clés + **comment tester** (étapes) + captures si UI. Une branche apporte ses tests, ou la PR dit pourquoi elle n'en a pas besoin.
5. Revue croisée (`/code-review` côté Claude) + auto-review du diff → **squash merge**.

**`dev → main` (release)**
1. `dev` porte une suite de features cohérente (pas un mix incomplet).
2. **🚦 Gate de release obligatoire** : porte verte sur `dev` + recette E2E du projet (§7) — sine qua non.
3. CHANGELOG : `[Unreleased] → [vX.Y.Z] - AAAA-MM-JJ`.
4. PR `dev → main` → **merge classique** → `git tag vX.Y.Z && git push --tags` → **resync `dev`** (§1).

---

## 5. Tests

**Pyramide** (unitaire → fonctionnel → scénarios → UI) :
- **Unitaire** — logique pure, testable sans mock (à côté du source).
- **Fonctionnel** — actions d'état / API (fichiers dédiés par domaine).
- **Scénarios** — multi-actions qui simulent un parcours réel.
- **UI** — rendu + navigation (smoke test obligatoire sur les flux critiques).

**Couverture visée** : logique pure ~90 % · le reste ≥ 80 % (au moins un test par action ou fonction publique) · UI = smoke + flux critiques.

**La porte — une seule commande avant toute fusion.**
- `porte` enchaîne tout ce qui doit être vert (lint/format, typage s'il y en a, tests, build, e2e) et **s'arrête à la première erreur**. Commande exacte : §7.
- On fusionne **parce que la porte est verte**, pas parce que le travail est fini — même pour un petit changement.
- Si un test échoue, on corrige le code — **jamais le test**, sauf à écrire pourquoi le test avait tort.
- La même commande tourne en local, dans le hook et en CI (§6) : ce qui est vert ici est vert là-bas.

**Une garde ne vaut que cassée au moins une fois.**
- Avant d'affirmer qu'un test protège quelque chose, le faire **échouer exprès** (casser le code ou l'attente), constater le rouge, puis rétablir.
- Obligatoire pour les **assertions négatives** (« n'apparaît pas », `toHaveCount(0)`, `not.toBeVisible()`, `assert x not in …`) : sur un mauvais sélecteur, elles passent à vide.

**E2E — Playwright (standard dès qu'il y a une interface).**
- Les parcours critiques se valident en **Playwright**, en vrai navigateur, et font partie de la porte.
- Tests **déterministes** : attendre les éléments (`await expect(locator)`), jamais de `waitForTimeout` fixe ; sélecteurs par rôle / `data-testid`, pas par classe CSS.
- Port paramétrable (`PORT_E2E`, §0) et serveur forcé en IPv4 (`127.0.0.1`) : sous Windows, `localhost` peut résoudre en `::1`.
- Parcours couverts et état du portage : §7.

---

## 6. Garde-fous (enforcement)

Les règles ci-dessus sont du *contexte* qu'un agent peut ne pas suivre. Pour les rendre **imposées** :

- **Pre-commit** : formatage + lint des fichiers indexés (outil et état : §7).
- **`/code-review`** (Claude Code) avant chaque PR — il lit ce fichier et `CLAUDE.md`.
- `💡 [proposé]` **Hook `PreToolUse`** pour imposer les règles dures : bloquer `git push` sur `main`/`dev`, refuser un nom de branche hors convention, et **exiger la porte verte avant un commit/merge**. (`/hooks` ou `.claude/settings.json`.)
- **CI** : exécute la même commande `porte` à chaque PR (état : §7).

---

## 7. Spécifique à ce dépôt (pulse_project)

> **La seule section à remplacer pour réutiliser ce fichier dans un autre projet.**

- **À lire avant toute intervention : `CLAUDE.md`.** C'est le pont avec le second cerveau Notion — scope V0, branches, tests, règles de données, design system, liste « Never », Definition of Done produit. Il est **régénéré depuis Notion** : il porte le *contexte produit et les décisions*, ce fichier-ci les *conventions de travail communes*. Autorité produit : Decision Log Notion (entrée la plus récente) > pages Notion > `CLAUDE.md` > maquettes `design/`.
- **Écarts assumés avec le socle**, décidés dans le Decision Log (5 octobre 2026) — `💡 [proposé — à valider]` : à trancher là-bas si on veut les aligner, puisque `CLAUDE.md` en est régénéré :
  - **Pas de resync de `dev` sur `main`** après une release : ici, on ne fusionne jamais `main` dans `dev` (un écart signale un commit fait à tort sur `main`). La règle de resync du §1 ne s'applique pas.
  - Le préfixe **`docs/`** est accepté pour les branches, en plus de `feat/`, `fix/` et `chore/`.
- **Branches et environnements** : `main` = production Vercel (base Supabase prod), ne reçoit que `dev` ; `dev` = intégration, preview Vercel (base Supabase dev). Une preview ne pointe jamais sur les données de production. Branches de travail coupées depuis `dev`, PR vers `dev` en squash, supprimées après fusion. Une release = une PR `dev → main`, ouverte quand la boucle marche sur la classe démo et que la CI est verte.
- **Stack** : React 19 + Vite + TypeScript + Tailwind v4 ; Supabase (UE, plan Free : **exactement deux projets, dev et prod**) ; Vercel. Zéro fonction serverless en V0.
- **Porte** : `npm run porte` = `npm run verify` (lint oxlint + typecheck + Vitest + scan de secrets + build) puis `npm run test:e2e` (Playwright, portable **et** téléphone). Prérequis : le navigateur de Playwright (`npx playwright install chromium`), à réinstaller **à chaque mise à jour de Playwright** (`docs/testing.md`). Si la PR touche du SQL : **nouvelle migration et test pgTAP**, puis `npm run db:reset && npm run db:test` (Docker requis) ; la CI rejoue pgTAP et le contrat dans le job `database` (détail au point **CI**).
- **Tests** : cinq couches, décrites dans `docs/testing.md` — règles de données (pgTAP : les plus importantes, own-results-only est prouvé là et nulle part ailleurs), contrat du repository (Vitest, en mémoire **et** contre Supabase local), composants (Testing Library), parcours (Playwright).
- **E2E** : Playwright sur l'app **buildée** (`VITE_DATA_SOURCE=fake` : ni projet, ni secret, ni Docker), servie sur `127.0.0.1:4173` ; specs dans `e2e/` (porte d'entrée et reset du mot de passe, journée de test étudiant, parcours enseignant). Port par copie : **`E2E_PORT`** — équivalent du `PORT_E2E` du §0 ; quand il est fixé, `reuseExistingServer` est désactivé.
- **CI** : `ci.yml`, à chaque PR et à chaque push sur `dev` et `main`. Une CI rouge ne se fusionne jamais. Trois jobs indépendants, qui lancent les étapes **une à une** : ni `npm run porte`, ni `npm run verify`.
  - `app` : `npm ci`, puis lint → scan de secrets → typecheck → Vitest → build (`verify` fait lint → typecheck → Vitest → scan → build).
  - `e2e` : `npx playwright install --with-deps chromium`, puis `npm run test:e2e` ; avec `CI` défini : 2 workers, un nouvel essai, serveur jamais réutilisé. Rapport HTML gardé 7 jours.
  - `database` : CLI Supabase, `supabase start` (Postgres + auth ; migrations et `seed.sql` appliqués au démarrage), `supabase test db` (pgTAP), puis `npx vitest run -c vitest.integration.config.ts`. C'est le contrat de `npm run test:integration`, **sans** son `supabase db reset` : la classe démo reste intacte parce que pgTAP annule ses changements.
  - **Écart avec le §5 et le §6, non tranché** (revue du 18/11/2026, PU-18) : la même commande ne tourne pas en local, dans un hook et en CI. Le contenu est équivalent aujourd'hui, mais une modification de `verify` ou de `porte` ne se propage pas à la CI. À trancher : aligner la CI (`💡 [proposé — à valider]` le job `app` lance `npm run verify`), ou ajouter l'écart aux écarts assumés ci-dessus (Decision Log).
- **Workflows planifiés** : `keep-alive.yml` (ping quotidien : le plan Free met en pause après une semaine) et `backup.yml` (dump chiffré de prod chaque nuit, gardé 30 jours).
- **PR** : le gabarit `.github/pull_request_template.md` fait foi pour la checklist (verify, e2e portable + téléphone, SQL → migration + pgTAP, aucun test sauté, supprimé ou assoupli sans raison écrite, aucun secret ni vrai nom d'étudiant, chaînes dans `src/i18n/en.ts`, cible `dev`).
- **DoD** : celle du §3, **plus** celle de `CLAUDE.md` § *Build order* (marche sur la classe démo seedée, respecte own-results-only, tests RLS verts, Scrum Board et Decision Log à jour).
- **Pre-commit et hooks** : aucun. Ni hook git (pre-commit, pre-push), ni hook Claude Code (`PreToolUse`) : rien ne lance la porte automatiquement. `💡 [proposé]` husky + lint-staged (oxlint).
- **Scopes de commit** : `data`, `door`, `student`, `teacher`, `master`, `ui`, `i18n`, `db`, `e2e`, `ci`, `design`, `docs`. Messages **en anglais**, comme l'interface.
- **Tag de proposition** : `CLAUDE.md` emploie `💡 [Claude-proposed — to validate]`, équivalent du `💡 [proposé — à valider]` du §0 ; les deux sont valables.
- **Secrets** : clés Supabase dans les variables d'environnement Vercel et `.env.local` (ignoré) ; seule la clé anon va dans le navigateur ; `npm run check:secrets` les traque dans les fichiers suivis.
- **Docs de référence** : `CLAUDE.md` · `README.md` · `docs/testing.md` · `docs/provisioning.md` · `docs/pilot/` (runbook, répétition, connexion étudiante) · `docs/superpowers/plans/2026-10-18-v0-finish.md` · `src/ui/pulse-ui-kit/README.md` + `MOTION.md` · `supabase/README.md` · `design/README.md`.
