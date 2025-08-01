import { getPath } from "../path_utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // Set dynamic paths for logos
  const logoHeader = document.getElementById("project-logo");
  if (logoHeader) {
    logoHeader.src = getPath("images/logo_completo.png");
  }

  const logoFooter = document.getElementById("footer-logo");
  if (logoFooter) {
    logoFooter.src = getPath("images/logo_erasmo.svg");
  }

  // Link homepage
  const homeLink = document.getElementById("home-link");
  if (homeLink) {
    homeLink.href = getPath("index.html");
  }
  // Toggle between conceptual and technical explanations
  const toggle = document.getElementById("toggleExplanation");
  const conceptual = document.getElementById("conceptual");
  const technical = document.getElementById("technical");

  if (toggle && conceptual && technical) {
    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        conceptual.classList.add("hidden");
        technical.classList.remove("hidden");
        technical.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        technical.classList.add("hidden");
        conceptual.classList.remove("hidden");
      }
    });
  }

  // Add smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Animate cards on scroll
  const observerOptions = {
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.intro-card, .explanation-card, .future-card').forEach(card => {
    observer.observe(card);
  });
});
