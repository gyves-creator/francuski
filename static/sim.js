// Simulateurs francuski.fr : calcul dans le navigateur (aucun envoi de données, aucun serveur).
// Remplace l'ancien main.js : les calculs utilisent window.CALCULATEURS_JS (scripts simulateurs-*.js) et window.RATES.
function calculerSimulateur(event, slug) {
  event.preventDefault();
  var form = event.target;
  var resultDiv = document.getElementById('sim-result-' + slug);
  if (!resultDiv) return;
  var data = {};
  new FormData(form).forEach(function (v, k) { data[k] = v; });
  var calc = (window.CALCULATEURS_JS || {})[slug];
  var result = null;
  try { result = calc && window.RATES ? calc(data) : null; } catch (e) { result = null; }
  resultDiv.classList.remove('hidden');
  resultDiv.className = 'sim-result';
  resultDiv.removeAttribute('style');
  if (!result) {
    resultDiv.style.background = '#fef2f2';
    resultDiv.style.borderColor = '#fca5a5';
    resultDiv.innerHTML = '<span style="color:#b91c1c">Vérifiez les montants saisis : certains champs sont manquants ou incorrects.</span>';
    return;
  }
  resultDiv.innerHTML =
    '<span class="result-value">' + result.resultat + '</span>' +
    '<span class="result-label">Résultat calculé</span>' +
    '<p class="result-explanation">' + result.explication + '</p>' +
    (result.details && result.details.length ? '<ul class="result-details">' + result.details.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul>' : '');
  resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
