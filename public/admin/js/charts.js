// Chart.js helpers for dashboard visualizations
const Charts = {
  categoryChart: null,

  renderCategoryChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Reset chart container
    const ctx = canvas.getContext('2d');
    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    if (!data || data.length === 0) {
      // Draw empty placeholder message or just do nothing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const categories = data.map(d => d.category);
    const counts = data.map(d => d.provider_count);

    // Render horizontal bar chart with Verandah accent color (#0F6E56)
    this.categoryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [{
          label: 'Providers Count',
          data: counts,
          backgroundColor: '#0F6E56',
          borderRadius: 6,
          borderSkipped: false,
          barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#0F3732',
            titleFont: { family: 'Inter', size: 12, weight: '500' },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 8,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(15, 55, 50, 0.04)',
              drawBorder: false
            },
            ticks: {
              color: '#888780',
              font: { family: 'Inter', size: 11 },
              precision: 0,
              stepSize: 1
            }
          },
          y: {
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              color: '#1F2A28',
              font: { family: 'Inter', size: 12, weight: '500' }
            }
          }
        }
      }
    });
  }
};

window.Charts = Charts;
