/* Shared Atlas language state; no simulation or inference runs in the browser. */
(() => {
  const render = language => {
    window.AtlasI18n.setLanguage(language);
    document.title = `Signal Atlas · ${window.AtlasI18n.t('plEmuTitle')}`;
  };
  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => render(button.dataset.language));
  });
  render(window.AtlasI18n.language);
})();
