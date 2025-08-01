import { getPath } from "../../path_utils.js";

class Tutorial {
  constructor() {
    this.steps = [
      {
        title: "Similar Objects",
        content: `Here you can explore objects with high similarity based on shared attributes. Similarity is calculated via a weighted algorithm – learn more in the <a href='${getPath("./info/info.html")}' target='_blank'>Info page</a>.`,
        target: "#similar-objects-section summary",
        position: "left"
      },
      {
        title: "Radar Diagram",
        content: "This radar chart shows which attributes contribute most to object similarity. Each axis represents one attribute",
        target: null,
        position: "center",
        image: getPath("images/radar.png")
      },
      {
        title: "Customize the Algorithm",
        content: "Use the 'Customize' button to open the panel and adjust the weight of each attribute. This allows you to explore different affinity results and tailor the analysis to your perspective",
        target: "#affinity-settings-panel",
        position: "left"
      }
    ];
    this.currentStep = 0;
    this.init();
  }

  init() {
    this.createTutorialElements();
    this.showStep(0);
    document.addEventListener('keydown', this.handleKeyPress.bind(this));
  }

  createTutorialElements() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';

    // Highlight
    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tutorial-highlight';

    // Tutorial box
    this.tutorialBox = document.createElement('div');
    this.tutorialBox.className = 'tutorial-box';

    this.tutorialTitle = document.createElement('h3');
    this.tutorialTitle.className = 'tutorial-title';

    this.tutorialContent = document.createElement('div');
    this.tutorialContent.className = 'tutorial-content';

    this.tutorialImage = document.createElement('img');
    this.tutorialImage.className = 'tutorial-image';

    this.tutorialNav = document.createElement('div');
    this.tutorialNav.className = 'tutorial-nav';

    this.prevButton = document.createElement('button');
    this.prevButton.className = 'tutorial-button tutorial-prev';
    this.prevButton.innerHTML = '&larr; Previous';
    this.prevButton.addEventListener('click', () => this.prevStep());

    this.nextButton = document.createElement('button');
    this.nextButton.className = 'tutorial-button tutorial-next';
    this.nextButton.innerHTML = 'Next &rarr;';
    this.nextButton.addEventListener('click', () => this.nextStep());

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tutorial-button tutorial-close';
    this.closeButton.innerHTML = 'Close Tutorial';
    this.closeButton.addEventListener('click', () => this.close());

    this.tutorialNav.appendChild(this.prevButton);
    this.tutorialNav.appendChild(this.nextButton);
    this.tutorialNav.appendChild(this.closeButton);

    this.tutorialBox.appendChild(this.tutorialTitle);
    this.tutorialBox.appendChild(this.tutorialContent);
    this.tutorialBox.appendChild(this.tutorialImage);
    this.tutorialBox.appendChild(this.tutorialNav);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.tutorialBox);
  }

  showStep(stepIndex) {
    this.currentStep = stepIndex;
    const step = this.steps[stepIndex];

    // Contenuto
    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = step.content;

    // Immagine
    if (step.image) {
      this.tutorialImage.src = step.image;
      this.tutorialImage.style.display = 'block';
    } else {
      this.tutorialImage.style.display = 'none';
    }

    // Posizionamento
    this.positionTutorialBox(step.position);

    // Evidenziazione
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => this.highlightElement(el), 300);
      } else {
        this.hideHighlight();
      }
    } else {
      this.hideHighlight();
    }

    // Aperture temporanee
    const affiniSection = document.querySelector('#similar-objects-section');
    const settingsPanel = document.querySelector('#affinity-settings-panel');

    if (affiniSection) affiniSection.open = (stepIndex === 1 || stepIndex === 2);
    if (settingsPanel) settingsPanel.style.display = (stepIndex === 2) ? 'block' : 'none';

    // Pulsanti
    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next &rarr;';
  }

  positionTutorialBox(position) {
    switch (position) {
      case 'top':
        this.tutorialBox.style.top = '20px';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translateX(-50%)';
        break;
      case 'right':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.right = '20px';
        this.tutorialBox.style.left = 'auto';
        this.tutorialBox.style.transform = 'translateY(-50%)';
        break;
      case 'left':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.left = '20px';
        this.tutorialBox.style.right = 'auto';
        this.tutorialBox.style.transform = 'translateY(-50%)';
        break;
      case 'center':
      default:
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translate(-50%, -50%)';
    }
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    this.highlightBox.style.width = `${rect.width + 20}px`;
    this.highlightBox.style.height = `${rect.height + 20}px`;
    this.highlightBox.style.top = `${rect.top - 10}px`;
    this.highlightBox.style.left = `${rect.left - 10}px`;
    this.highlightBox.style.opacity = '1';
  }

  hideHighlight() {
    this.highlightBox.style.opacity = '0';
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.close();
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  close() {
    this.overlay.remove();
    this.highlightBox.remove();
    this.tutorialBox.remove();

    const popup = document.getElementById("radar-popup");
    if (popup) popup.remove();

    const settingsPanel = document.querySelector('#affinity-settings-panel');
    if (settingsPanel) settingsPanel.style.display = 'none';

    const affiniSection = document.querySelector('#similar-objects-section');
    if (affiniSection) affiniSection.open = false;
  }

  handleKeyPress(e) {
    if (e.key === 'ArrowRight') this.nextStep();
    else if (e.key === 'ArrowLeft') this.prevStep();
    else if (e.key === 'Escape') this.close();
  }
}

window.addEventListener('load', () => {
  new Tutorial();
});
