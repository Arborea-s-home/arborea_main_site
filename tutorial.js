import { getPath } from './path_utils.js';

export class Tutorial {
    constructor() {
      this.steps = [
        {
          title: "Welcome to the Mycenean and Minoan Tombs Atlas",
          content: "This interactive map allows you to explore archaeological features of Mycenean and Minoan tombs across Greece. Use the dashboard to filter data and click on regions for detailed information.",
          target: null,
          position: "center",
          image: "images/homepage.png"
        },
        {
          title: "Select Archaeological Features",
          content: "Use this toggle to select between Greek modern and ancient historical regions. Then select the categories you want to display on the map using the tool below and see the results on map.",
          target: "#tutorial-group",
          position: "right"
        },
        {
          title: "Explore Mapped Necropolises",
          content: "In this section you will find a practical tool to fully explore the data of all mapped funeral attestations. A wide range of visualization and analysis tools are natively given. Click on a site (or group of sites) to begin exploring.",
          target: "#mapped-sites-container",
          position: "right"
        },
        {
          title: "Data Sources",
          content: `All data comes from verified sources. Check the <a href="${getPath('info/info.html')}" target="_blank" style="text-decoration: underline;">info page</a> for complete references and licensing information.`,
          target: ".dashboard-footer",
          position: "top"
        },
        {
          title: "Data Visualization",
          content: "Click on any region to see a graph showing the importance of each selected archaeological feature. This importance is calculated by comparing the absolute presence of each feature against the weighted average of the same phenomenon across all regions.",
          target: null,
          position: "center",
          image: getPath("images/graph.png")
        },
        {
          title: "Info Page",
          content: "Click on the central logo to view the detailed information page containing all you need to know about the project.",
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
      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.className = 'tutorial-overlay';
      
      // Create highlight box
      this.highlightBox = document.createElement('div');
      this.highlightBox.className = 'tutorial-highlight';
      
      // Create tutorial box
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
      
      // Update content
      this.tutorialTitle.textContent = step.title;
      this.tutorialContent.innerHTML = step.content;
      
      // Handle image
      if (step.image) {
        this.tutorialImage.src = getPath(step.image);
        this.tutorialImage.style.display = 'block';
      } else {
        this.tutorialImage.style.display = 'none';
      }
      
      // Position tutorial box
      this.positionTutorialBox(step.position);
      
      // Highlight target element if exists
      if (step.target) {
        const targetElement = document.querySelector(step.target);
        if (targetElement) {
          // Scrolla l'elemento nel viewport prima di evidenziarlo
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
          // Ritarda leggermente l'highlight per aspettare che scroll finisca
          setTimeout(() => {
            this.highlightElement(targetElement);
          }, 400); // Puoi aumentare se il layout è lento a scrollare
        } else {
          this.hideHighlight();
        }
      }
      
      // Update button states
      this.prevButton.disabled = stepIndex === 0;
      this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Finish' : 'Next &rarr;';
    }
  
    positionTutorialBox(position) {
      const boxRect = this.tutorialBox.getBoundingClientRect();
      
      switch(position) {
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
      
      // Add arrow
      const tutorialRect = this.tutorialBox.getBoundingClientRect();
      const highlightRect = this.highlightBox.getBoundingClientRect();
      
      // Clear previous arrow classes
      this.highlightBox.className = 'tutorial-highlight';
      
      // Determine arrow position
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