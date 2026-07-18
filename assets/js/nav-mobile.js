
    const hamburger = document.getElementById('navHamburger');
    const overlay = document.getElementById('navOverlay');

    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      overlay.classList.toggle('open');
      document.body.style.overflow = overlay.classList.contains('open') ? 'hidden' : '';
    });

    function closeMobileMenu() {
      hamburger.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeMobileMenu();
    });
// Scroll to section
const OFFSET = 100;

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const id = this.getAttribute('href');

    if (id === "#") return;

    const target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();

    const targetPosition = target.offsetTop - OFFSET;

    window.scrollTo({
      top: targetPosition,
      behavior: "smooth"
    });
  });
});