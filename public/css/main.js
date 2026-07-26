// Kleine UI-Interaktionen (Mengen-Stepper)
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.qty button[data-step]');
  if (!btn) return;
  const input = btn.parentElement.querySelector('input[type="number"]');
  if (!input) return;
  const step = parseInt(btn.dataset.step, 10);
  const min = parseInt(input.min || '1', 10);
  input.value = Math.max(min, (parseInt(input.value, 10) || min) + step);
});

// Flash nach einigen Sekunden ausblenden
window.addEventListener('DOMContentLoaded', function () {
  const flash = document.querySelector('.flash');
  if (flash) setTimeout(() => { flash.style.transition = 'opacity .4s'; flash.style.opacity = '0'; }, 4500);
});

// Konto-Dropdown schließen, wenn außerhalb geklickt wird
document.addEventListener('click', function (e) {
  document.querySelectorAll('.acct-menu.open').forEach(function (m) {
    if (!m.contains(e.target)) m.classList.remove('open');
  });
});
