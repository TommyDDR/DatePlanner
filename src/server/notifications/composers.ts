/**
 * Charge chaque module qui déclare un composeur d'email (`registerComposer`).
 *
 * Importé par `outbox.ts` : dès qu'un email peut partir, tous les modèles sont
 * connus. Un modèle ajouté s'ajoute ici.
 */
import './password-reset';
