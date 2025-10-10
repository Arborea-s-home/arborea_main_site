import { getPath } from '../../path_utils.js';

export class Tutorial {
  constructor() {
    this.steps = [
      // STEP 0
      {
        title: "Welcome to the Tombs Atlas",
        content: `
          <p style="color: #b02a37;"><strong>🚧 Warning:</strong> The data are currently under revision and completion. Consider all visualizations provisional.</p>
          <p>This map allows you to fully explore all <strong>taxa occurrences</strong> in the specific space-range you selected.</p>
          <p>Use the <strong>dashboard</strong> (right), the <strong>filters</strong> (left) and the <strong>timebar</strong> (down) to control map layers and filter your data.</p>
        `,
        target: null,
        position: "center",
        image: getPath("images/step0.png")
      },

      // STEP 1
      {
        title: "Explore the Map",
        content: `
          <p>By clicking on any visible <strong>site</strong>, <strong>context</strong> or <strong>object</strong> on the map, you can open a detailed pop-up view.</p>
          <ul style="margin-top:10px;">
            <li><strong>Site pop-up</strong>: quick overview of the site (name, extent/chronology), counts of contexts and samples, and shortcuts to focus or read more.</li>
            <li><strong>Context pop-up</strong>: typology and dating, number of associated samples, and actions to isolate/zoom to the context on the map.</li>
            <li><strong>Object (sample) pop-up</strong>: image and key metadata (family/species and source context), plus an expand/collapse area for extra details and a link to the dedicated detail page.</li>
          </ul>
        `,
        target: "#map",
        position: "top",
        image: getPath("images/graphs.png")

      },

      // STEP 2
      {
        title: "Filter the Samples",
        content: `
          <p>Use this panel to filter samples <strong>by family</strong> or <strong>by species</strong>.</p>
          <p>Click on each icon to observe the distribution on the map.</p>
          <p style="margin-top:8px;"><em>Use the above filters to see only <strong>carpological</strong> or <strong>xylological</strong> remains.</em></p>
        `,
        target: "#category-filter",
        position: "left"
      },

      // STEP 3
      {
        title: "Clusters Visibility",
        content: `
          <p>The toggle section allows you to pin/unpin the visibility of the <strong>sample clusters</strong>.</p>
        `,
        target: "#visualization-controls",
        position: "right"
      },

      // STEP 4
      {
        title: "Context Typologies",
        content: `
          <p>Open the typology section to see the relative importance of every context grouped by <strong>general typology</strong> as attested in the dataset.</p>
          <p>Select any <strong>slice</strong> to filter the data based on the selected typology.</p>
          <p><strong>NB:</strong> The graph updates based on your current map's view.</p>
        `,
        target: "#site-chart-section",
        position: "right"
      },

      // STEP 5
      {
        title: "Top Taxa on Map",
        content: `
          <p>See the most important taxa currently shown on map and adjust the graph using the <strong>typology / taxonomic level</strong> switchers.</p>
          <p><strong>NB:</strong> the graph automatically updates itself based on your current map's view and active filters.</p>
        `,
        target: "#samples-chart-section",
        position: "right"
      },

      // STEP 6
      {
        title: "Time Filter",
        content: `
          <p>The <strong>timebar</strong> lets you focus the analysis on a specific chronological range.</p>
          <ul style="margin-top:8px;">
            <li>Drag the two handles to set <strong>from</strong> and <strong>to</strong> phases; the shaded band marks your active selection.</li>
            <li>The line shows the <strong>number of contexts per phase</strong> and respects all other filters (typology, family/species, reliability, etc.).</li>
            <li>Toggle <em>“add undated contexts”</em> to include records without explicit phase.</li>
          </ul>
        `,
        target: "#timebar-detail",
        position: "bottom"
      },

      // STEP 7
      {
        title: "Navigation and Info",
        content: `
          <p>Click the logo above to return to the <strong>homepage</strong>.</p>
          <p>At the bottom of the dashboard, you'll find a link to the <a href="${getPath('../../info/info.html')}" target="_blank">Info page</a>, where you can read more about the dataset, algorithm, and methodology.</p>
        `,
        target: "#logo-link",
        position: "top"
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

    // Announce opening (per timebar relayout)
    try { document.dispatchEvent(new Event('tutorial:open')); } catch {}
  }

  showStep(stepIndex) {
    this.currentStep = stepIndex;
    const step = this.steps[stepIndex];

    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = step.content;

    if (step.image) {
      this.tutorialImage.src = step.image;
      this.tutorialImage.style.display = 'block';
    } else {
      this.tutorialImage.style.display = 'none';
    }

    this.positionTutorialBox(step.position);

    if (step.target) {
      const targetElement = document.querySelector(step.target);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => this.highlightElement(targetElement), 400);
      } else {
        this.hideHighlight();
      }
    } else {
      this.hideHighlight();
    }

    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next &rarr;';

    // Announce step change
    try { document.dispatchEvent(new Event('tutorial:step')); } catch {}
  }

  positionTutorialBox(position) {
    this.tutorialBox.style.top = '';
    this.tutorialBox.style.left = '';
    this.tutorialBox.style.right = '';
    this.tutorialBox.style.bottom = '';
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
      case 'bottom':
        this.tutorialBox.style.bottom = '20px';
        this.tutorialBox.style.left = '50%';
        this.tutorialBox.style.transform = 'translateX(-50%)';
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
    this.overlay.style.opacity = '0';
    this.highlightBox.style.opacity = '0';
    this.tutorialBox.style.opacity = '0';
    setTimeout(() => {
      try { document.dispatchEvent(new Event('tutorial:close')); } catch {}
      document.body.removeChild(this.overlay);
      document.body.removeChild(this.highlightBox);
      document.body.removeChild(this.tutorialBox);
    }, 300);
  }

  handleKeyPress(e) {
    if (e.key === 'ArrowRight') {
      this.nextStep();
    } else if (e.key === 'ArrowLeft') {
      this.prevStep();
    } else if (e.key === 'Escape') {
      this.close();
    }
  }
}
