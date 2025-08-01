import { getPath } from '../../path_utils.js';

export function renderSiteGraph(tombeDelSito) {
    const tipologie = {};
    tombeDelSito.forEach(t => {
      const tipo = t.properties.tipologia || "N/D";
      tipologie[tipo] = (tipologie[tipo] || 0) + 1;
    });
  
    const labels = Object.keys(tipologie);
    const data = Object.values(tipologie);
    const totalTombs = data.reduce((a, b) => a + b, 0);
  
    const colors = ['#6C8EBF','#D6B656','#82B366','#B85450','#9673A6','#D79B00','#6B9CD3','#5B8E5D','#BD7E74','#7C6B8F'];
    const borderColors = colors.map(c => shadeColor(c, -20));
    const iconPaths = labels.map(label =>
      tombIcons[label.toLowerCase()] || tombIcons['default']
    );
  
    preloadIcons(iconPaths, loadedIcons => {
      new Chart(document.getElementById("siteChartCanvas"), {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 2,
            spacing: 6,
            borderRadius: 8,
            offset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const value = ctx.raw;
                  const percentage = Math.round((value / totalTombs) * 100);
                  return `${ctx.label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        },
        plugins: [centerTextPlugin(totalTombs), iconPlugin(loadedIcons)]
      });
    });
  }
  
  // Plugin centro
  function centerTextPlugin(totalTombs) {
    return {
      id: 'centerText',
      beforeDraw(chart) {
        const { ctx } = chart;
        const centerX = chart.width / 2;
        const centerY = chart.height / 2;
  
        const icon = new Image();
        icon.src = getPath("images/icons/cementery.png"); 
        icon.onload = () => {
          const cleanedIcon = removeWhiteBackground(icon);
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY - 10, 14, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(cleanedIcon, centerX - 12, centerY - 22, 24, 24);
          ctx.restore();
  
          ctx.save();
          ctx.font = 'bold 20px Lato, sans-serif';
          ctx.fillStyle = '#2c3e50';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${totalTombs}`, centerX, centerY + 12);
          ctx.font = '12px Lato, sans-serif';
          ctx.fillText(`Tombs`, centerX, centerY + 32);
          ctx.restore();
        };
      }
    };
  }
  
  // Plugin icone
  function iconPlugin(loadedIcons) {
    return {
      id: 'sliceIcons',
      afterDatasetDraw(chart) {
        const meta = chart._metasets[0];
        const ctx = chart.ctx;
        meta.data.forEach((arc, i) => {
          const icon = loadedIcons[i];
          if (!icon) return;
          const angle = (arc.startAngle + arc.endAngle) / 2;
          const radius = (arc.outerRadius + arc.innerRadius) / 2 + 12;
          const x = arc.x + Math.cos(angle) * radius;
          const y = arc.y + Math.sin(angle) * radius;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, 2 * Math.PI);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(icon, x - 12, y - 12, 24, 24);
          ctx.restore();
        });
      }
    };
  }
  
  // Helpers
  function shadeColor(color, percent) {
    let R = parseInt(color.substring(1,3), 16);
    let G = parseInt(color.substring(3,5), 16);
    let B = parseInt(color.substring(5,7), 16);
    R = Math.min(255, Math.round(R * (100 + percent) / 100));
    G = Math.min(255, Math.round(G * (100 + percent) / 100));
    B = Math.min(255, Math.round(B * (100 + percent) / 100));
    return "#" + [R, G, B].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  
  function removeWhiteBackground(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) {
        data[i+3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    const cleanedImage = new Image();
    cleanedImage.src = canvas.toDataURL();
    return cleanedImage;
  }
  
  function preloadIcons(paths, callback) {
    const loadedIcons = [];
    let count = 0;
    paths.forEach((path, i) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = path;
      img.onload = () => {
        const cleanedIcon = removeWhiteBackground(img);
        loadedIcons[i] = cleanedIcon;
        if (++count === paths.length) callback(loadedIcons);
      };
      img.onerror = () => {
        loadedIcons[i] = null;
        if (++count === paths.length) callback(loadedIcons);
      };
    });
  }
  
  // Icone
  const tombIcons = {
    'tomba a camera': getPath("images/icons/chamber.png"),
    'tholos': getPath("images/icons/tholos.png"),
    'tomba a fossa': getPath("images/icons/shaft.png"),
    'tomba a grotticella': getPath("images/icons/pit.png"),
    'default': getPath("images/icons/grave.png")
  };