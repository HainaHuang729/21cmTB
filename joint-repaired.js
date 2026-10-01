(() => {
  const render = language => {
    window.AtlasI18n.setLanguage(language);
    document.title = `Signal Atlas · ${window.AtlasI18n.t('repairedTitle')}`;
  };
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click',()=>render(button.dataset.language)));
  render(window.AtlasI18n.language);
})();
