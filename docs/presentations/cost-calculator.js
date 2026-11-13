'use strict';
(() => {
    const form = document.getElementById('cost-form');
    const inputs = Array.from(form.querySelectorAll('input'));
    const results = document.getElementById('results');
    const calcSummary = document.getElementById('calc-summary');
    const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
    const number = new Intl.NumberFormat('en-IN');
    inputs.forEach(input => {
      const error = document.createElement('span');
      error.className = 'error';
      error.id = input.id + '-error';
      input.after(error);
      const hint = input.parentElement.querySelector('small');
      hint.id = input.id + '-hint';
      input.setAttribute('aria-describedby', hint.id + ' ' + error.id);
    });
    function readValues() {
      const values = {};
      let valid = true;
      for (const input of inputs) {
        const value = Number(input.value);
        const kind = input.dataset.kind;
        let error = '';
        if (input.value.trim() === '' || !Number.isFinite(value)) error = 'Required: enter a finite number; use 0 only if known.';
        else if (value < 0) error = 'Cannot be negative.';
        else if ((kind === 'count' || kind === 'positive-count') && !Number.isSafeInteger(value)) error = 'Enter a whole, safely representable count.';
        else if ((kind === 'positive' || kind === 'positive-count') && value <= 0) error = 'Must be greater than zero.';
        else if (kind === 'tax' && value > 100) error = 'Use a percentage from 0 to 100.';
        input.setAttribute('aria-invalid', String(Boolean(error)));
        document.getElementById(input.id + '-error').textContent = error;
        if (error) valid = false;
        values[input.id] = value;
      }
      const assigned = values.marketing + values.utility + values.authentication + values.service + values.exempt;
      if (valid && (!Number.isSafeInteger(assigned) || assigned !== values.outbound)) {
        const error = 'Chargeable category counts + exempt messages must equal outbound volume (' + number.format(values.outbound) + '). Currently ' + number.format(assigned) + '.';
        document.getElementById('outbound-error').textContent = error;
        document.getElementById('outbound').setAttribute('aria-invalid', 'true');
        valid = false;
      }
      return valid ? values : null;
    }
    function calculate(v) {
      const meta = v.marketing * v['marketing-rate'] + v.utility * v['utility-rate'] +
        v.authentication * v['authentication-rate'] + v.service * v['service-rate'];
      const operations = v.backend + v.support;
      const taxFactor = v.tax / 100;
      const routes = [
        { name: 'Direct Meta', provider: 0, note: 'Business/API eligibility and custom integration required for the owned number. Tech Provider approval is a separate gate for onboarding other sellers. No BSP subscription; operating costs are still modeled.' },
        { name: '360dialog list-price illustration', provider: v.sellers * v['dialog-rate'] * v.eur + v['dialog-extra'], note: 'Direct list-price arithmetic only. Independent-seller partner fees, allowances, and eligibility require a written quote.' },
        { name: 'Wati workspace illustration', provider: v.workspaces * v['wati-rate'] + v['wati-extra'], note: document.getElementById('wati-plan').value === '2699' ? 'Not integration-ready: Growth lists no webhooks. Price does not make this a suitable sync route.' : 'Confirm exact Coexistence/echo webhook coverage, multi-seller rights, and message rate-card differences. Pro lists limited webhooks.' },
        { name: 'Twilio handling illustration', provider: (v.inbound + v.outbound) * v['twilio-rate'] * v.usd + v['twilio-extra'], note: 'Not shortlisted for retained-app scope: standard signup requires deleting the app account. A separate supported route would need confirmation.' }
      ];
      return routes.map(route => {
        const subtotal = meta + operations + route.provider;
        const tax = subtotal * taxFactor;
        const monthly = subtotal + tax;
        const setupWithTax = v.setup * (1 + taxFactor);
        return { ...route, meta, operations, subtotal, tax, monthly, setupWithTax, firstMonth: monthly + setupWithTax };
      });
    }
    function updateCosts() {
      results.replaceChildren();
      const values = readValues();
      if (!values) {
        calcSummary.classList.add('invalid');
        calcSummary.textContent = 'Incomplete estimate. Correct the highlighted inputs; no cost totals are shown.';
        return;
      }
      const rows = calculate(values);
      if (rows.some(row => [row.provider, row.meta, row.operations, row.subtotal, row.tax, row.monthly, row.setupWithTax, row.firstMonth].some(value => !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER))) {
        calcSummary.classList.add('invalid');
        calcSummary.textContent = 'Incomplete estimate. These inputs exceed reliable numeric limits; reduce the amounts or volumes.';
        return;
      }
      calcSummary.classList.remove('invalid');
      calcSummary.textContent = 'Illustrative scenario, not a complete quote: ' + number.format(values.sellers) + ' numbers; ' + number.format(values.inbound) + ' inbound + ' + number.format(values.outbound) +
        ' outbound messages/month. Modeled Meta fees: ' + inr.format(rows[0].meta) + '. FX: USD ' + values.usd + ', EUR ' + values.eur +
        ' INR. Uniform tax assumption: ' + values.tax + '%. Unquoted charges remain excluded unless entered.';
      const max = Math.max(...rows.map(row => row.monthly), 1);
      rows.forEach((row, index) => {
        const card = document.createElement('article');
        card.className = 'card result';
        card.dataset.route = String(index);
        const heading = document.createElement('h3');
        heading.textContent = row.name;
        const badge = document.createElement('span');
        badge.className = 'tag warn';
        badge.textContent = 'Illustrative / quote required';
        const amount = document.createElement('p');
        amount.className = 'metric';
        amount.dataset.monthly = String(row.monthly);
        amount.textContent = inr.format(row.monthly);
        const period = document.createElement('p');
        period.className = 'small';
        period.textContent = 'Monthly equivalent, including entered tax assumption';
        const bar = document.createElement('div');
        bar.className = 'cost-bar';
        bar.setAttribute('aria-hidden', 'true');
        const fill = document.createElement('span');
        fill.style.width = (row.monthly / max * 100) + '%';
        bar.append(fill);
        const dl = document.createElement('dl');
        dl.className = 'breakdown';
        const breakdown = [
          ['Meta delivered-message fees', row.meta], ['Provider subscription / handling', row.provider],
          ['Backend + maintenance allowance', row.operations], ['Subtotal before tax', row.subtotal],
          ['Modeled monthly tax', row.tax], ['One-time setup incl. modeled tax', row.setupWithTax],
          ['First-month economic estimate', row.firstMonth]
        ];
        breakdown.forEach(([label, value]) => {
          const term = document.createElement('dt');
          const detail = document.createElement('dd');
          term.textContent = label;
          detail.textContent = inr.format(value);
          dl.append(term, detail);
        });
        const note = document.createElement('p');
        note.className = 'small';
        note.textContent = row.note;
        if (index === 2) note.textContent += ' Quarterly base subscription cash before tax: ' + inr.format(values.workspaces * values['wati-rate'] * 3) + '. Other charges are additional.';
        card.append(heading, badge, amount, period, bar, dl, note);
        results.append(card);
      });
    }
    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('input', () => {
      document.getElementById('preset-description').textContent = 'Custom / edited assumptions. Counts are totals across the modeled API numbers; no free-tier allocation is inferred.';
      updateCosts();
    });
    document.getElementById('wati-plan').addEventListener('change', event => {
      document.getElementById('wati-rate').value = event.target.value;
      updateCosts();
    });
    const presets = {
      pilot: { sellers: 1, inbound: 5000, outbound: 6000, marketing: 500, utility: 1000, service: 3500, exempt: 1000 },
      small: { sellers: 5, inbound: 1000, outbound: 1200, marketing: 100, utility: 200, service: 0, exempt: 900 },
      medium: { sellers: 20, inbound: 2000, outbound: 2400, marketing: 200, utility: 400, service: 800, exempt: 1000 },
      large: { sellers: 100, inbound: 5000, outbound: 6000, marketing: 500, utility: 1000, service: 3500, exempt: 1000 }
    };
    function applyPreset(name) {
      const preset = presets[name];
      document.getElementById('sellers').value = String(preset.sellers);
      document.getElementById('workspaces').value = String(preset.sellers);
      for (const key of ['inbound', 'outbound', 'marketing', 'utility', 'service', 'exempt']) {
        document.getElementById(key).value = String(preset[key] * preset.sellers);
      }
      document.getElementById('authentication').value = '0';
      document.getElementById('preset-description').textContent = name === 'pilot'
        ? 'Pilot: one Wooru-owned number for a few food sellers; ' + number.format(preset.inbound) + ' inbound and ' +
          number.format(preset.outbound) + ' outbound messages/month are hypothetical across the whole community. One-number service exemption assumed; quote and actual traffic required.'
        : name[0].toUpperCase() + name.slice(1) + ': ' + preset.sellers +
          ' seller numbers, each with ' + number.format(preset.inbound) + ' inbound and ' + number.format(preset.outbound) +
          ' outbound messages/month. Uniform traffic and per-number service exemptions assumed; rate/budget inputs are unchanged.';
      updateCosts();
    }
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => applyPreset(button.dataset.preset)));
    document.getElementById('reset').addEventListener('click', () => {
      form.reset();
      applyPreset('pilot');
    });
    let savedDetails = [];
    function preparePrint() {
      if (savedDetails.length === 0) savedDetails = Array.from(document.querySelectorAll('details')).map(detail => ({ detail, open: detail.open }));
      savedDetails.forEach(({ detail }) => { detail.open = true; });
      form.querySelectorAll('.print-value').forEach(value => value.remove());
      form.querySelectorAll('input, select').forEach(input => {
        const value = document.createElement('span');
        value.className = 'print-value';
        value.textContent = input instanceof HTMLSelectElement ? input.selectedOptions[0].textContent : (input.value || 'Not entered / incomplete');
        input.after(value);
      });
    }
    function finishPrint() {
      savedDetails.forEach(({ detail, open }) => { detail.open = open; });
      savedDetails = [];
    }
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', finishPrint);
    applyPreset('pilot');
})();
