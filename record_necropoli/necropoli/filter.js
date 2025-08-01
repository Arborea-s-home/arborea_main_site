import { getPath } from '../../path_utils.js';

export async function initCategoryFilter(oggettiFeatures, updateVisibleObjects) {
  const response = await fetch(getPath("data/legenda_oggetti.csv"));
  const text = await response.text();

  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  const data = lines.slice(1).map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim()]));
  });

  const categories = {};
  data.forEach(row => {
    const cat1 = row.category_1;
    const cat2 = row.category_2;
    const val = row.valore;
    const img1 = row.image_1;
    const img2 = row.image_2;

    if (!categories[cat1]) {
      categories[cat1] = {
        label: cat1,
        image: img1,
        valori: new Set(),
        subMap: new Map()
      };
    }

    categories[cat1].valori.add(val);

    const key = `${cat2}||${img2}`;
    if (!categories[cat1].subMap.has(key)) {
      categories[cat1].subMap.set(key, {
        label: cat2,
        image: img2,
        valori: new Set()
      });
    }

    categories[cat1].subMap.get(key).valori.add(val);
  });

  const activeCategory1 = new Set();
  const activeStrumenti = new Set();

  const container = document.createElement("div");
  container.id = "category-filter";
  container.className = "category-filter";
  document.body.appendChild(container);

  Object.entries(categories).forEach(([cat1, info]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "category-wrapper";

    const btn = document.createElement("button");
    btn.className = "category-btn";
    btn.title = info.label;
    btn.style.backgroundImage = `url('${getPath("images/objects/" + info.image)}')`;

    wrapper.appendChild(btn);

    const subContainer = document.createElement("div");
    subContainer.className = "subcategory-container";

    const line = document.createElement("div");
    line.className = "subcategory-line";
    wrapper.appendChild(line);
    document.body.appendChild(subContainer);

    Array.from(info.subMap.values()).forEach(sub => {
      const subBtn = document.createElement("button");
      subBtn.className = "subcategory-btn";
      subBtn.title = sub.label;
      subBtn.style.backgroundImage = `url('../../images/objects/${sub.image}')`;

      subBtn.addEventListener("click", () => {
        const wasActive = subBtn.classList.toggle("active");

        sub.valori.forEach(v => {
          if (wasActive) activeStrumenti.add(v);
          else activeStrumenti.delete(v);
        });

        applyFilter();
      });

      subContainer.appendChild(subBtn);
    });

    let hideTimeout;

    const showSub = () => {
      clearTimeout(hideTimeout);
      const rect = btn.getBoundingClientRect();
      subContainer.style.display = "flex";
      subContainer.style.top = `${rect.top + rect.height / 2}px`;
      subContainer.style.left = `${rect.right + 10}px`;
      subContainer.style.transform = "translateY(-50%)";
      line.style.display = "block";
    };

    const scheduleHideSub = () => {
      hideTimeout = setTimeout(() => {
        subContainer.style.display = "none";
        line.style.display = "none";
      }, 200);
    };

    const isMouseInGroup = () => (
      btn.matches(":hover") ||
      wrapper.matches(":hover") ||
      subContainer.matches(":hover")
    );

    const handleMouseEnter = () => clearTimeout(hideTimeout);

    const handleMouseLeave = () => {
      setTimeout(() => {
        if (!isMouseInGroup()) {
          scheduleHideSub();
        }
      }, 10);
    };

    btn.addEventListener("mouseenter", showSub);
    btn.addEventListener("mouseenter", handleMouseEnter);
    btn.addEventListener("mouseleave", handleMouseLeave);
    wrapper.addEventListener("mouseenter", handleMouseEnter);
    wrapper.addEventListener("mouseleave", handleMouseLeave);
    subContainer.addEventListener("mouseenter", handleMouseEnter);
    subContainer.addEventListener("mouseleave", handleMouseLeave);

    btn.addEventListener("click", () => {
      const isActive = btn.classList.toggle("active");

      info.valori.forEach(v => {
        if (isActive) activeStrumenti.add(v);
        else activeStrumenti.delete(v);
      });

      applyFilter();
    });

    container.appendChild(wrapper);
  });

  function applyFilter() {
    if (activeStrumenti.size === 0) {
      updateVisibleObjects(oggettiFeatures);
      return;
    }

    const filtrati = oggettiFeatures.filter(f => {
      const strumenti = (f.properties.strumento || "")
        .split(",")
        .map(s => s.trim().toLowerCase());
      return strumenti.some(str => activeStrumenti.has(str));
    });

    updateVisibleObjects(filtrati);
  }
}
