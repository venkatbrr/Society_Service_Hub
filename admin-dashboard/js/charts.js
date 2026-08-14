// Chart.js helpers for dashboard visualizations.
//
// Colours are read from the Verandah tokens in css/styles.css rather than
// duplicated here, so the charts cannot drift away from the rest of the console.
const Charts = {
  categoryChart: null,
  trendChart: null,

  token(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (value && value.trim()) || fallback;
  },

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

    const accent = this.token('--accent', '#0F6E56');
    const primary = this.token('--primary', '#0F3732');
    const text3 = this.token('--text-3', '#888780');
    const text1 = this.token('--text-1', '#1F2A28');

    this.categoryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [{
          label: 'Providers Count',
          data: counts,
          backgroundColor: accent,
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
          legend: { display: false },
          tooltip: {
            backgroundColor: primary,
            titleFont: { family: 'Inter', size: 12, weight: '500' },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 8,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(15, 55, 50, 0.04)', drawBorder: false },
            ticks: {
              color: text3,
              font: { family: 'Inter', size: 11 },
              precision: 0,
              stepSize: 1
            }
          },
          y: {
            grid: { display: false, drawBorder: false },
            ticks: { color: text1, font: { family: 'Inter', size: 12, weight: '500' } }
          }
        }
      }
    });
  },

  // Daily signups / orders / contributions / active residents.
  renderTrendChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = null;
    }

    if (!data || data.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const accent = this.token('--accent', '#0F6E56');
    const primary = this.token('--primary', '#0F3732');
    const caution = this.token('--caution', '#854F0B');
    const text3 = this.token('--text-3', '#888780');

    const labels = data.map(d => {
      const dt = new Date(d.day);
      return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    });

    const series = (label, key, color, dashed) => ({
      label: label,
      data: data.map(d => Number(d[key] || 0)),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      borderDash: dashed ? [4, 4] : undefined,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
      fill: false
    });

    this.trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          series('Active residents', 'active_users', accent, false),
          series('Pre-orders', 'orders', primary, false),
          series('Contributions', 'contributions', caution, false),
          series('Signups', 'signups', text3, true)
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { family: 'Inter', size: 11 },
              color: text3
            }
          },
          tooltip: {
            backgroundColor: primary,
            titleFont: { family: 'Inter', size: 12, weight: '500' },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 8,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: {
              color: text3,
              font: { family: 'Inter', size: 10 },
              maxTicksLimit: 12,
              autoSkip: true
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(15, 55, 50, 0.04)', drawBorder: false },
            ticks: {
              color: text3,
              font: { family: 'Inter', size: 11 },
              precision: 0
            }
          }
        }
      }
    });
  }
};

window.Charts = Charts;
