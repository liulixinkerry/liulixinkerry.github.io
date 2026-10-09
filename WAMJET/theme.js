(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('wamjet-theme');
  } catch (error) {}
  if (theme !== 'light' && theme !== 'dark') theme = 'dark';
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
