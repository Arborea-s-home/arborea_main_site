import { getPath } from '../../path_utils.js';

export class Tutorial {
    constructor() {
        this.steps = [
          {
            title: "Welcome to the Tombs Atlas",
            content: `
              <p style="display: flex; align-items: center; gap: 8px; color: #b02a37;">
              <p style="color: #b02a37;"><strong>🚧 Warning:</strong> The data are currently under revision and completion. Consider all visualizations provisional.</p>
              <p>This map allows you to fully explore the selected funerary context(s), analyze <strong>affinities</strong>, and visualize the <strong>distribution of objects</strong>.</p>
              <p>Use the dashboard to control map layers and access powerful tools. You can click on every <strong>tomb</strong> or <strong>object</strong> displayed on the map to open detailed info pop-ups.</p>
            `,
            target: null,
            position: "center",
            image: getPath("images/step0.png")
          },
          {
            title: "Explore the Map",
            content: `
              <p>By clicking on any visible <strong>tomb</strong> or <strong>object</strong> on the map, you can open a detailed pop-up view.</p>
              <p>For objects, you can access a dedicated detail page that displays <strong>associated objects</strong> from the same tomb and <strong>similar items</strong> suggested by the algorithm.</p>
              <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                <img src="${getPath('images/graph_tomb.png')}" alt="Tomb Graph" style="max-width: 45%; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" />
                <img src="${getPath('images/graph_object.png')}" alt="Object Graph" style="max-width: 45%; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" />
              </div>
            `,
            target: "#detail-map",
            position: "top"
          },
          {
              title: "Filter the Objects",
              content: `
                <p>Use this panel to filter objects <strong>by category</strong> or <strong>by subcategory</strong>.</p>
                <p>Click on each icon to observe the category's distribution on the map.</p>
              `,
              target: "#category-filter",
              position: "left"
          },
          {
              title: "View and Distribution Controls",
              content: `
                <p>The toggle section allows you to pin/unpin the visibility of the <strong>raster map</strong> and <strong>object clusters</strong>.</p>
                <p>Open the typology section to  see the <strong>relative importance</strong> of each <strong>tomb typology<strong> attested in the dataset.</p>
              `,
              target: "#visualization-controls",
              position: "right"
          },
          {
              title: "Analysis Tools",
              content: `
                <p>Activate the <strong>Affinity Analysis</strong> tool to compare a tomb with all others based on <strong>grave goods</strong>.</p>
                <p>Click on the switch, then select a tomb on the map to start the comparison.</p>
              `,
              target: "#analysis-tools",
              position: "right"
          },
          {
              title: "Reading the Results",
              content: `
                <p>Affinity levels are displayed <strong>directly on the map</strong> using a cold–hot gradient color scale. 
                The same results can be seen on the scatterplot placed in the dashboard. </p>
                <p>Also, <strong>detailed cards</strong> are generated on the dashboard, explaining how results are built and assigning
                each association a 0.1 - 100 point score </p>
                <p>Click on any such object-on-object association to view a <strong>graph of the affinity breakdown</strong>.</p>
              `,
              target: "#affinity-results",
              position: "left",
              image: getPath("images/graph_analisi.png")
          },
          {
              title: "How the Tool Works",
              content: `
                <p>In Short, "Affinity" is based on <strong>shared attributes</strong> between objects (e.g., function, material, decoration), with weights assigned based on <strong>rarity</strong>.</p>
                <p>A <strong>1:1 matching</strong> system ensures the optimal comparison and assigns bonus weight to <strong>rare triple combinations</strong>.</p>
                <p>For full details, see the <a href=\"../../info/info.html\" target=\"_blank\">project Info page</a>.</p>
              `,
              target: "#analysis-tools",
              position: "right"
          },
          {
              title: "Navigation and Info",
              content: `
                <p>Click the logo above to return to the <strong>homepage</strong>.</p>
                <p>At the bottom of the dashboard, you'll find a link to the <a href=\"../../info/info.html\" target=\"_blank\">Info page</a>, where you can read more about the dataset, algorithm, and methodology.</p>
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
    }
  
    positionTutorialBox(position) {
      this.tutorialBox.style.top = '';
      this.tutorialBox.style.left = '';
      this.tutorialBox.style.right = '';
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