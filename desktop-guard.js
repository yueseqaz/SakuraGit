(() => {
  // Installed at document start, before React or a dialog can receive input.
  const contextMenu = (event) => event.preventDefault();
  const keyDown = (event) => {
    const modifier = event.metaKey || (event.ctrlKey && !event.altKey);
    if (
      event.key === 'F5' ||
      (modifier && (event.key.toLowerCase() === 'r' || event.code === 'KeyR'))
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener('contextmenu', contextMenu, true);
  window.addEventListener('keydown', keyDown, true);
  return () => {
    window.removeEventListener('contextmenu', contextMenu, true);
    window.removeEventListener('keydown', keyDown, true);
  };
})();
