# Pile technique

_Source : research.md, R1._

## Décision

Application web unique en TypeScript 5.9.3 sur Node.js 22 LTS : Next.js 16.3.4 (App Router, Server Actions), React 19.2.8, Tailwind CSS 4.3.3, Prisma 7.10.0 avec `@prisma/adapter-pg` et `pg` 8.23.0, PostgreSQL 17, Zod 4.5.4, `@node-rs/argon2` 2.2.0, Nodemailer 10.0.12 ; Vitest 4.1.11 et Playwright 1.63.0. Versions exactes, identiques à laserit.fr (`save-exact=true`). Retirées de la pile de laserit.fr : `sharp`, `dxf-parser`, `fast-xml-parser`.

## Pourquoi

Ces versions tournent déjà en production sur la même infrastructure, avec leurs pièges documentés (Prisma 7 et son URL hors du schéma, TypeScript épinglé en 5.9 pour `typescript-eslint`). La même pile rend le calendrier, le thème, les sessions, le flux en direct et la file d'emails transposables presque tels quels. Écartés : SvelteKit ou Remix (nouvelle pile à maintenir seul), un backend séparé (deux déploiements pour un service de cette taille).
