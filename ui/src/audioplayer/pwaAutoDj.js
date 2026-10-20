// En la PWA el modo DJ debe quedar activo al empezar a sonar un tema, aunque
// el ajuste guardado estuviera apagado. Se decide una sola vez por sesión para
// que el botón del reproductor siga pudiendo apagarlo después.
export const shouldBootstrapPwaAutoDj = ({
  bootstrapped,
  isDesktop,
  isMobilePlayer,
  isRadio,
}) => !bootstrapped && (!isDesktop || isMobilePlayer) && !isRadio
