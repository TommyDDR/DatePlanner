# Connexion Google

_Source : research.md, R5._

## Décision

OAuth 2.0 / OpenID Connect, code d'autorisation avec PKCE : `state`, vérificateur et destination scellés dans le cookie signé `dp_google`, effacé dans tous les cas. Jeton d'identité accepté seulement si `aud`, `iss`, l'échéance et `email_verified` conviennent. Reconnaissance par `googleId`, puis rattachement par adresse. Rattacher Google à un compte local dont l'adresse n'a jamais été prouvée efface son mot de passe et ferme ses sessions. Client OAuth distinct de celui de laserit.fr.

## Pourquoi

Sans vérification d'adresse à l'inscription, un tiers pourrait créer un compte à l'adresse d'autrui et en garder l'accès après que le vrai titulaire s'y connecte par Google : la pré-appropriation est fermée au rattachement. Le jeton arrive par un appel TLS direct authentifié par le secret client : sa signature n'a pas à être vérifiée (OIDC § 3.1.3.7). Écartée : une bibliothèque d'authentification, lourde pour deux méthodes déjà écrites et testées.
