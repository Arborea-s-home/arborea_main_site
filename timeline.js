// timeline.js
import { getPath } from './path_utils.js';

export class Timeline {
  constructor() {
    this.container = document.getElementById('timeline-container');
    this.barsWrap = this.container.querySelector('.timeline-bars');
    this.axisWrap = this.container.querySelector('.timeline-axis');
    this.inputFrom = this.container.querySelector('#timeline-from');
    this.inputTo   = this.container.querySelector('#timeline-to');
    this.labelFrom = this.container.querySelector('#timeline-label-from');
    this.labelTo   = this.container.querySelector('#timeline-label-to');
    this.undatedInput = this.container.querySelector('#timeline-undated');

    // gestore elementi senza datazione 
    this.undatedInput = this.container.querySelector('#timeline-undated');
    if (this.undatedInput) {
      this.undatedInput.addEventListener('change', () => {
        window.mapManager.includeUndated = !!this.undatedInput.checked;
        window.mapManager.aggregateDataByArea();
        const selected =
          (window.dashboard?.selectedFields?.size)
            ? [...window.dashboard.selectedFields]
            : (window.mapManager.currentFields || []);
        window.mapManager.updateMap(selected);
      });
    }
    
    // Fasi dal MapManager
    this.PHASES = window.mapManager.PHASES;

    // Asse etichette
    this.axisWrap.innerHTML = '';
    this.PHASES.forEach((p, i) => {
      const lab = document.createElement('button');
      lab.className = 'timeline-tick';
      lab.textContent = p;
      lab.title = `Seleziona fino a "${p}"`;
      lab.addEventListener('click', () => {
        const from = parseInt(this.inputFrom.value, 10);
        const to = i;
        if (to < from) {
          this.inputFrom.value = to;
          this.inputTo.value = from;
        } else {
          this.inputTo.value = to;
        }
        this._onRangeChange();
      });
      this.axisWrap.appendChild(lab);
    });

    // Slider range
    this.inputFrom.min = 0; this.inputFrom.max = this.PHASES.length - 1;
    this.inputTo.min   = 0; this.inputTo.max   = this.PHASES.length - 1;
    this.inputFrom.value = 0;
    this.inputTo.value   = this.PHASES.length - 1;
    this._syncLabels();

    const clamp = () => {
      let a = parseInt(this.inputFrom.value, 10);
      let b = parseInt(this.inputTo.value, 10);
      if (a > b) [a, b] = [b, a];
      this.inputFrom.value = a;
      this.inputTo.value = b;
      this._syncLabels();
    };
    this.inputFrom.addEventListener('input', clamp);
    this.inputTo.addEventListener('input', clamp);
    this.inputFrom.addEventListener('change', () => this._onRangeChange());
    this.inputTo.addEventListener('change', () => this._onRangeChange());

    // Posiziona overlay sopra la mappa e aggiornalo al resize
    this._positionToMap();
    window.addEventListener('resize', () => this._positionToMap());
    window.addEventListener('orientationchange', () => this._positionToMap());
  }

  _positionToMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    const r = mapEl.getBoundingClientRect();

    // margini interni rispetto ai bordi della mappa
    const padX = 16, padBottom = 12;

    // Se la mappa non è ancora in layout, salta
    if (r.width <= 0 || r.height <= 0) return;

    // Ancoriamo la timeline ai bordi della mappa (via position: fixed)
    this.container.style.left   = `${Math.max(0, r.left + padX)}px`;
    this.container.style.right  = `${Math.max(0, window.innerWidth - r.right + padX)}px`;
    this.container.style.bottom = `${Math.max(0, window.innerHeight - r.bottom + padBottom)}px`;
  }

  _syncLabels() {
    const a = parseInt(this.inputFrom.value, 10);
    const b = parseInt(this.inputTo.value, 10);
    this.labelFrom.textContent = this.PHASES[a];
    this.labelTo.textContent   = this.PHASES[b];
    // CSS vars per ombreggiatura range
    this.container.style.setProperty('--range-from', a);
    this.container.style.setProperty('--range-to', b);
    this.container.style.setProperty('--range-count', this.PHASES.length);
  }

  _onRangeChange() {
    const a = parseInt(this.inputFrom.value, 10);
    const b = parseInt(this.inputTo.value, 10);
    window.mapManager.setChronoSelectionByIndices(a, b);
    this._highlightSelectedBars(a, b);
  }

  _highlightSelectedBars(a, b) {
    const bars = this.barsWrap.querySelectorAll('.timeline-bar');
    bars.forEach((el, i) => el.classList.toggle('in-range', i >= a && i <= b));

    // UI-only: evidenzia i tick nell'intervallo selezionato
    const ticks = this.axisWrap.querySelectorAll('.timeline-tick');
    ticks.forEach((el, i) => el.classList.toggle('in-range', i >= a && i <= b));
  }

  // Aggiorna le barre in base alle tipologie selezionate
  updateBars(selectedTypologies = []) {
    const counts = window.mapManager.computePhaseCounts(selectedTypologies);
    const max = Math.max(1, ...counts);
  
    this.barsWrap.innerHTML = '';
    counts.forEach((v, i) => {
      const t = v / max; // 0..1
      // palette azzurra soft: lightness 88% → 52%
      const light = Math.round(88 - (88 - 52) * t);
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      bar.style.height = `${(v / max) * 100}%`;
      bar.style.background = `hsl(218deg 85% ${light}%)`; // ✅ più scuro quando v è alto
      bar.title = `${this.PHASES[i]}: ${v} siti`;
      this.barsWrap.appendChild(bar);
    });
  
    const a = parseInt(this.inputFrom.value, 10);
    const b = parseInt(this.inputTo.value, 10);
    this._highlightSelectedBars(a, b);
  }
}

/* Bootstrap: avvia solo quando i dati mappa sono pronti */
const bootTimeline = () => {
  window.timeline = new Timeline();
  const selected = (window.dashboard?.selectedFields?.size)
    ? [...window.dashboard.selectedFields]
    : [];
  window.timeline.updateBars(selected);
  // riposiziona all'evento custom nel caso la mappa cambi layout in ritardo
  setTimeout(() => window.timeline._positionToMap(), 0);
};

if (window.mapManager?.sitiFeatures) {
  bootTimeline();
} else {
  document.addEventListener('map:data-ready', bootTimeline, { once: true });
}
