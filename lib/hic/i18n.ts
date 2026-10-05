// Simple key/value dictionary, not a full i18n library — consistent
// with this app's otherwise-minimal-dependency style, and the only
// place in Send HIC that needs end-user-facing localization at all (the
// public signing page's own UI chrome). The documents themselves are
// already in the right language per template; the equipment supplement
// and Henderson form stay English always, per spec — this dictionary
// only covers the signing page's own buttons/labels/messages.
const STRINGS = {
  en: {
    loading: "Loading…",
    reviewDocument: "Review your document",
    consentLabel: "I agree to use electronic records and signatures.",
    continueButton: "Continue",
    declineLink: "Decline to sign",
    declineTitle: "Decline to sign",
    declineReasonLabel: "Reason (optional)",
    declineConfirm: "Confirm decline",
    declineCancel: "Cancel",
    adoptTitle: "Adopt your signature",
    adoptSubtitle: "Choose how you'd like to sign — this will be used everywhere you need to sign or initial.",
    methodTyped: "Type",
    methodDrawn: "Draw",
    signatureLabel: "Your signature",
    initialsLabel: "Your initials",
    continueToDocument: "Continue to document",
    signTitle: "Sign your document",
    signSubtitle: "Click each highlighted box to add your signature, initials, or date.",
    clickToSign: "Click to sign",
    clickToInitial: "Click to initial",
    finishAndSign: "Finish & Sign",
    signing: "Signing…",
    completeTitleFull: "All done — thank you!",
    completeBodyFull: "Your document has been fully signed. A copy will be emailed to you shortly.",
    completeTitlePartial: "Thanks for signing!",
    completeBodyPartial: "We're waiting on the other signer to finish before the document is complete.",
    declinedTitle: "You've declined to sign",
    declinedBody: "The sender has been notified.",
    errorTitle: "Something went wrong",
  },
  es: {
    loading: "Cargando…",
    reviewDocument: "Revise su documento",
    consentLabel: "Acepto usar registros y firmas electrónicos.",
    continueButton: "Continuar",
    declineLink: "Rechazar firmar",
    declineTitle: "Rechazar firmar",
    declineReasonLabel: "Motivo (opcional)",
    declineConfirm: "Confirmar rechazo",
    declineCancel: "Cancelar",
    adoptTitle: "Adopte su firma",
    adoptSubtitle: "Elija cómo desea firmar — se usará en todos los lugares donde deba firmar o poner sus iniciales.",
    methodTyped: "Escribir",
    methodDrawn: "Dibujar",
    signatureLabel: "Su firma",
    initialsLabel: "Sus iniciales",
    continueToDocument: "Continuar al documento",
    signTitle: "Firme su documento",
    signSubtitle: "Haga clic en cada cuadro resaltado para agregar su firma, iniciales o fecha.",
    clickToSign: "Clic para firmar",
    clickToInitial: "Clic para iniciales",
    finishAndSign: "Finalizar y firmar",
    signing: "Firmando…",
    completeTitleFull: "¡Listo — gracias!",
    completeBodyFull: "Su documento ha sido firmado completamente. Pronto recibirá una copia por correo electrónico.",
    completeTitlePartial: "¡Gracias por firmar!",
    completeBodyPartial: "Estamos esperando a que el otro firmante termine para completar el documento.",
    declinedTitle: "Ha rechazado firmar",
    declinedBody: "Se ha notificado al remitente.",
    errorTitle: "Algo salió mal",
  },
} as const;

export type SigningStringKey = keyof typeof STRINGS.en;

export function t(language: "en" | "es", key: SigningStringKey): string {
  return STRINGS[language][key];
}
