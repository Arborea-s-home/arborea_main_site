// tutorial.js
import { getPath } from './path_utils.js';

const TUTORIAL_STORAGE_KEY = 'arborea_tutorial_seen_v1';

export class Tutorial {
  constructor() {
    // Appena parte, segna come "visto" così non si riapre ai reload successivi
    try { localStorage.setItem(TUTORIAL_STORAGE_KEY, '1'); } catch {}

    this.steps = [
      // STEP 0 — testo aggiornato
      {
        title: "Welcome to ARBOREA",
        content:
          `Welcome to the main page of <strong>ARBOREA</strong> (ARchaeoBOtanical geoReferenced rEcords of Ancient Italy), a new digital tool designed to compile, harmonize, and georeference archaeobotanical data from Central Italy.<br/><br/>
           You're currently on the main page of the site. Here you can see our current dataset in a grouped fashion. See the next step to see how to further explore our data.`,
        target: null,
        position: "center",
        image: "images/homepage.png"
      },

      // STEP 1 — stesso testo, ma punta SOLO allo switcher regioni/province
      {
        title: "Group by Regions / Provinces",
        content:
          "Use this switch to aggregate counts by <strong>modern regions</strong> or <strong>provinces</strong>. The map and the graph update accordingly.",
        target: "#admin-boundary-switch",
        position: "right"
      },

      // STEP 2 — merge degli ex step 2/3, nessuna immagine, box alla destra
      {
        title: "Graph view & feature selection",
        content:
          `The <strong>Graph</strong> view is enabled by default. Use the view toggle here to switch between the <em>Graph</em> and the classic <em>List</em> (Region → Province → Site).<br/><br/>
           Then open a category in the left panel and toggle the <strong>feature switches</strong> you want to display — green means active. The map (green choropleth) and the timeline bars adapt to your selection.`,
        // puntiamo al box del grafico (donut). Se cambi id in futuro, aggiorna qui.
        target: "#sites-pie",
        position: "right"
      },

      // STEP 3 — (ex 4) invariato
      {
        title: "Drill-down on the doughnut",
        content:
          "Click a <strong>region</strong> slice to drill down into its <strong>provinces</strong>. The action buttons above the chart light up when a region/province is selected. Ctrl/Cmd-click (or double click) opens the related detail page directly.",
        target: "#sites-pie",
        position: "left"
      },

      // STEP 4 — (ex 5) invariato
      {
        title: "Open detail pages",
        content:
          "After selecting a region, <strong>Region samples</strong> becomes available. After selecting a province, <strong>Province samples</strong> does the same. A site table appears below the chart to browse entries.",
        target: ".graph-actions",
        position: "left"
      },

      // STEP 5 — (ex 6) Timeline invariata
      {
        title: "Interactive Timeline",
        content:
          "Use the two sliders to select a <strong>chronological range</strong>. Click labels on the axis to snap the selection. Toggle <em>add undated sites</em> to include records without an explicit phase. The map and bars update immediately.",
        target: "#timeline-container",
        position: "top"
      },

      // STEP 6 — “Project Credits” → rimpiazzato con spiegazione del grafico del popup, con immagine ex step 2
      {
        title: "Understanding the popup chart",
        content:
          `Click on a region/province on the map to open a popup. The horizontal bars show each selected feature in that area as <strong>% of the overall average</strong> across all areas (<em>100% = average</em>).<br/><br/>
           The gradient helps you read at a glance: green ≈ around/below average; yellow → orange → red indicate progressively higher values vs the average. Use <strong>“Full Details”</strong> for a dedicated page with complete breakdowns.`,
        target: "#map",
        position: "top",
        image: "images/graph.png"
      },

      // STEP 7 — (ex 8) invariato
      {
        title: "Info & Documentation",
        content:
          `Click the central logo to open the info page with background, methods and acknowledgments.<br/><br/>
           Feeling lost? Rerun this tutorial by clicking on the main logo on the dashboard`,
        target: ".map-logo-container",
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
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';

    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tutorial-highlight';

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

    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = step.content;

    if (step.image) {
      this.tutorialImage.src = getPath(step.image);
      this.tutorialImage.style.display = 'block';
    } else {
      this.tutorialImage.style.display = 'none';
    }

    this.positionTutorialBox(step.position);

    if (step.target) {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => this.highlightElement(targetElement), 350);
      } else {
        this.hideHighlight();
      }
    } else {
      this.hideHighlight();
    }

    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next &rarr;';
  }

  positionTutorialBox(position) {
    this.tutorialBox.style.right = '';
    this.tutorialBox.style.left = '';
    this.tutorialBox.style.top = '';
    this.tutorialBox.style.transform = '';

    switch (position) {
      case 'top':
        this.tutorialBox.style.top = '20px';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translateX(-50%)';
        break;
      case 'right':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.right = '20px';
        this.tutorialBox.style.transform = 'translateY(-50%)';
        break;
      case 'left':
        this.tutorialBox.style.top = '50%';
        this.tutorialBox.style.left = '20px';
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

    const tutorialRect = this.tutorialBox.getBoundingClientRect();
    const highlightRect = this.highlightBox.getBoundingClientRect();
    this.highlightBox.className = 'tutorial-highlight';
    if (tutorialRect.left > highlightRect.right) {
      this.highlightBox.classList.add('arrow-right');
    } else if (tutorialRect.right < highlightRect.left) {
      this.highlightBox.classList.add('arrow-left');
    } else if (tutorialRect.top > highlightRect.bottom) {
      this.highlightBox.classList.add('arrow-bottom');
    } else {
      this.highlightBox.classList.add('arrow-top');
    }
  }

  hideHighlight() { this.highlightBox.style.opacity = '0'; }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) this.showStep(this.currentStep + 1);
    else this.close();
  }
  prevStep() { if (this.currentStep > 0) this.showStep(this.currentStep - 1); }

  close() {
    // (facoltativo) ribadisco il flag visto
    try { localStorage.setItem(TUTORIAL_STORAGE_KEY, '1'); } catch {}
    this.overlay.style.opacity = '0';
    this.highlightBox.style.opacity = '0';
    this.tutorialBox.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(this.overlay);
      document.body.removeChild(this.highlightBox);
      document.body.removeChild(this.tutorialBox);
    }, 300);
  }

  handleKeyPress(e) {
    if (e.key === 'ArrowRight') this.nextStep();
    else if (e.key === 'ArrowLeft') this.prevStep();
    else if (e.key === 'Escape') this.close();
  }
}
