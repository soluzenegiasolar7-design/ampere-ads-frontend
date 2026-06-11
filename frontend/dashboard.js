const API = 'https://ampere-ads-dashboard.onrender.com/api';

let chartDaily, chartRoas;

async function fetchJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function load() {
  const days = document.getElementById('days').value;
  await Promise.all([
    loadSummary(days).catch(e => console.error('summary:', e.message)),
    loadMetrics(days).catch(e => console.error('metrics:', e.message)),
    loadAlerts().catch(e => console.error('alerts:', e.message)),
  ]);
}

async function loadSummary(days) {
  const data = await fetchJSON(`${API}/summary?days=${days}`);
  document.getElementById('total-spend').textContent = `R$ ${fmt(data.total_spend)}`;
  document.getElementById('total-leads').textContent = data.total_leads ?? '—';
  document.getElementById('total-conv').textContent = data.total_conversions ?? '—';
  document.getElementById('roas').textContent = data.roas ? `${data.roas}×` : '—';
  document.getElementById('cpl').textContent = data.cpl ? `R$ ${data.cpl}` : '—';
  document.getElementById('cpa').textContent = data.cpa ? `R$ ${data.cpa}` : '—';
}

async function loadMetrics(days) {
  const rows = await fetchJSON(`${API}/metrics?days=${days}`);

  // Agrupa por data para o gráfico diário
  const byDate = {};
  rows.forEach(r => {
    const day = r.date.slice(0, 10);
    if (!byDate[day]) byDate[day] = { spend: 0, leads: 0 };
    byDate[day].spend += parseFloat(r.spend || 0);
    byDate[day].leads += parseInt(r.leads || 0);
  });
  const dates = Object.keys(byDate).sort();
  renderDailyChart(dates, dates.map(d => byDate[d].spend), dates.map(d => byDate[d].leads));

  // Agrupa por campanha para o gráfico de ROAS
  const byCampaign = {};
  rows.forEach(r => {
    if (!byCampaign[r.campaign_name]) byCampaign[r.campaign_name] = { spend: 0, revenue: 0 };
    byCampaign[r.campaign_name].spend += parseFloat(r.spend || 0);
    byCampaign[r.campaign_name].revenue += parseFloat(r.revenue || 0);
  });
  const campaigns = Object.keys(byCampaign);
  const roasValues = campaigns.map(c => {
    const { spend, revenue } = byCampaign[c];
    return spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;
  });
  renderRoasChart(campaigns, roasValues);

  // Tabela por campanha
  renderTable(rows);
}

async function loadAlerts() {
  const alerts = await fetchJSON(`${API}/alerts`);
  const list = document.getElementById('alerts-list');
  if (!alerts.length) { list.innerHTML = '<li style="color:#64748b">Nenhum alerta recente.</li>'; return; }
  list.innerHTML = alerts.slice(0, 10).map(a =>
    `<li><strong>${a.campaign_name}</strong> — ${a.message} <span style="color:#64748b;font-size:0.8rem">${new Date(a.triggered_at).toLocaleDateString('pt-BR')}</span></li>`
  ).join('');
}

function renderDailyChart(labels, spend, leads) {
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(document.getElementById('chart-daily'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Investimento (R$)', data: spend, backgroundColor: '#2563eb', yAxisID: 'y' },
        { label: 'Leads', data: leads, type: 'line', borderColor: '#34d399', backgroundColor: 'transparent', yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#1e2535' } },
        y: { ticks: { color: '#64748b' }, grid: { color: '#2d3748' } },
        y1: { position: 'right', ticks: { color: '#34d399' }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

function renderRoasChart(labels, values) {
  if (chartRoas) chartRoas.destroy();
  chartRoas = new Chart(document.getElementById('chart-roas'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'ROAS',
        data: values,
        backgroundColor: values.map(v => v >= 3 ? '#34d399' : v >= 1 ? '#f59e0b' : '#f87171'),
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: '#2d3748' } },
        y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#1e2535' } },
      },
    },
  });
}

function renderTable(rows) {
  const byCampaign = {};
  rows.forEach(r => {
    if (!byCampaign[r.campaign_name]) byCampaign[r.campaign_name] = { spend: 0, leads: 0, conversions: 0, revenue: 0, clicks: 0, impressions: 0 };
    const c = byCampaign[r.campaign_name];
    c.spend += parseFloat(r.spend || 0);
    c.leads += parseInt(r.leads || 0);
    c.conversions += parseInt(r.conversions || 0);
    c.revenue += parseFloat(r.revenue || 0);
    c.clicks += parseInt(r.clicks || 0);
    c.impressions += parseInt(r.impressions || 0);
  });

  const html = `<table>
    <thead><tr>
      <th>Campanha</th><th>Investimento</th><th>Leads</th><th>CPL</th><th>Conversões</th><th>ROAS</th><th>CTR</th>
    </tr></thead>
    <tbody>
    ${Object.entries(byCampaign).map(([name, c]) => {
      const roas = c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : '—';
      const cpl = c.leads > 0 ? `R$ ${(c.spend / c.leads).toFixed(2)}` : '—';
      const ctr = c.impressions > 0 ? `${(c.clicks / c.impressions * 100).toFixed(2)}%` : '—';
      const roasNum = parseFloat(roas);
      const badge = roasNum >= 3 ? 'badge-ok' : roasNum >= 1 ? 'badge-warn' : 'badge-bad';
      return `<tr>
        <td>${name}</td>
        <td>R$ ${fmt(c.spend)}</td>
        <td>${c.leads}</td>
        <td>${cpl}</td>
        <td>${c.conversions}</td>
        <td class="${badge}">${roas}×</td>
        <td>${ctr}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;
  document.getElementById('table-container').innerHTML = html;
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

document.getElementById('days').addEventListener('change', load);
document.getElementById('btn-collect').addEventListener('click', async () => {
  const btn = document.getElementById('btn-collect');
  btn.textContent = 'Coletando...';
  btn.disabled = true;
  await fetch(`${API}/collect`, { method: 'POST' }).catch(() => {});
  await load();
  btn.textContent = '▶ Coletar agora';
  btn.disabled = false;
});

document.getElementById('btn-analyze').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analyze');
  const result = document.getElementById('ai-result');
  const days = document.getElementById('days').value;

  btn.textContent = '⏳ Analisando...';
  btn.disabled = true;
  result.classList.remove('hidden');
  result.innerHTML = '<div class="ai-loading">Consultando IA, aguarde alguns segundos...</div>';

  try {
    const data = await fetchJSON(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    result.textContent = data.analysis;
  } catch (e) {
    result.textContent = `Erro ao consultar IA: ${e.message}`;
  }

  btn.textContent = '✨ Analisar campanhas';
  btn.disabled = false;
});

load();
