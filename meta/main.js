import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

/** Robust datetime parser for elocuent CSV rows. */
function parseDateTime(row) {
  if (row.datetime) {
    const d0 = new Date(row.datetime);
    if (!Number.isNaN(+d0)) return d0;
  }

  // Build from separate columns: date (YYYY-MM-DD), time (HH:MM[:SS]), timezone (+0700 / -0800 / Z)
  const date = row.date || '';
  const time = row.time || '00:00:00';
  let tz = row.timezone || 'Z'; // default UTC if missing

  // Normalize timezone from +0700 -> +07:00 
  if (/^[+-]\d{4}$/.test(tz)) tz = tz.replace(/([+-]\d{2})(\d{2})/, '$1:$2');
  const candidate = new Date(`${date}T${time}${tz}`);
  if (!Number.isNaN(+candidate)) return candidate;

  // Last resort: parse just date (becomes local midnight)
  const fallback = new Date(date);
  return Number.isNaN(+fallback) ? new Date(0) : fallback;
}

// ---------- Load & normalize CSV ----------
async function loadData() {
  const csvUrl = new URL('./loc.csv', import.meta.url);
  const rows = await d3.csv(csvUrl);

  // Normalize & typecast
  const data = rows.map((row) => {
    const datetime = parseDateTime(row);
    return {
      ...row,
      line: +row.line || 0,
      depth: +row.depth || 0,
      length: +row.length || 0,
      datetime,
      date: new Date(datetime.toDateString()),
      author: row.author || row.committer || '', // tolerate different column names
      type: row.type || row.language || 'Other', // language column name may vary
      time: row.time || `${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}`,
      timezone: row.timezone || 'Z',
    };
  });

  return data;
}

// ---------- Convert lines -> commits ----------
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0] || {};
      const datetime = first.datetime ?? new Date(0);
      const hourFrac = datetime.getHours() + datetime.getMinutes() / 60;
      const ret = {
        id: commit,
        url: 'https://github.com/stephaniepatriciaans/portofolio/commit/' + commit,
        author: first.author ?? '',
        date: first.date ?? new Date(0),
        time: first.time ?? '',
        timezone: first.timezone ?? 'Z',
        datetime,
        hourFrac,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', { value: lines, enumerable: false });
      return ret;
    })
    // drop commits that failed to parse time entirely
    .filter((d) => !Number.isNaN(+d.datetime));
}

// ---------- Summary Stats ----------
function renderCommitInfo(lines, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(lines.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Distinct files
  const filesCount = d3.group(lines, (d) => d.file).size;
  dl.append('dt').text('Files');
  dl.append('dd').text(filesCount);

  // Average file length (avg of max line number per file)
  const fileLengths = d3.rollups(
    lines,
    (v) => d3.max(v, (r) => r.line),
    (d) => d.file
  );
  const avgFileLen = d3.mean(fileLengths, (d) => d[1]) || 0;
  dl.append('dt').text('Avg file length (lines)');
  dl.append('dd').text(Math.round(avgFileLen));

  // Busiest period of day (avoid unsupported Intl options)
  const periodOf = (h) =>
    h < 6 ? 'Night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';

  const workByPeriod = d3.rollups(
    lines,
    (v) => v.length,
    (d) => periodOf(new Date(d.datetime).getHours())
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Busiest time');
  dl.append('dd').text(maxPeriod ?? '—');
}

// ---------- Tooltip helpers ----------
function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}
function updateTooltipPosition(evt) {
  const el = document.getElementById('commit-tooltip');
  el.style.left = `${evt.clientX + 12}px`;
  el.style.top = `${evt.clientY + 12}px`;
}
function renderTooltipContent(c) {
  if (!c) return;
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');
  const time = document.getElementById('commit-time');

  link.href = c.url;
  link.textContent = c.id?.slice(0, 8) ?? '';
  date.textContent = c.datetime?.toLocaleString('en', { dateStyle: 'full' }) ?? '';
  author.textContent = c.author ?? '';
  lines.textContent = c.totalLines ?? 0;
  const hh = String(Math.floor(c.hourFrac || 0)).padStart(2, '0');
  const mm = String(Math.round(((c.hourFrac || 0) % 1) * 60)).padStart(2, '0');
  time.textContent = `${hh}:${mm}`;
}

// ---------- Scatterplot + Brush ----------
function renderScatterPlot(commits) {
  if (!commits.length) {
    d3.select('#chart').append('p').text('No commits found to visualize.');
    return;
  }

  const width = 1000, height = 600;
  const margin = { top: 10, right: 10, bottom: 36, left: 48 };
  const usable = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  // Scales
  const xScale = d3.scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usable.left, usable.right])
    .nice();

  const yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([usable.bottom, usable.top]);

  // Axes
  svg.append('g')
    .attr('transform', `translate(0,${usable.bottom})`)
    .call(d3.axisBottom(xScale));

  svg.append('g')
    .attr('transform', `translate(${usable.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'));

  // Gridlines (y)
  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usable.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usable.width));

  // Dot radius scale — sqrt so perceived area ~ lines edited
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines ?? 0, maxLines ?? 1]).range([2, 30]);

  // Render dots (sort so smaller end up on top for hover)
  const dotsG = svg.append('g').attr('class', 'dots');
  const sorted = d3.sort(commits, (d) => -d.totalLines);

  const dots = dotsG.selectAll('circle')
    .data(sorted)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (evt, d) => {
      d3.select(evt.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(d);
      updateTooltipVisibility(true);
      updateTooltipPosition(evt);
    })
    .on('mousemove', (evt) => updateTooltipPosition(evt))
    .on('mouseleave', (evt) => {
      d3.select(evt.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Brush
  function isCommitSelected(selection, c) {
    if (!selection) return false;
    const [[x0, y0], [x1, y1]] = selection;
    const cx = xScale(c.datetime);
    const cy = yScale(c.hourFrac);
    return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
  }

  function renderSelectionCount(selection) {
    const sel = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
    document.querySelector('#selection-count').textContent = `${sel.length || 'No'} commits selected`;
    return sel;
  }

  function renderLanguageBreakdown(selection) {
    const container = document.getElementById('language-breakdown');
    const selectedCommits = selection ? commits.filter((d) => isCommitSelected(selection, d)) : [];
    const source = selectedCommits.length ? selectedCommits : commits;
    const lines = source.flatMap((d) => d.lines);
    if (selectedCommits.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    const breakdown = Array.from(
        d3.rollup(lines, v => v.length, d => d.type)
      ).sort((a, b) => d3.descending(a[1], b[1]));
      
      container.innerHTML = '';
      for (const [lang, count] of breakdown) {
        const proportion = count / lines.length;
        const pct = d3.format('.1~%')(proportion);
        container.innerHTML += `<dt>${lang}</dt><dd>${count} lines (${pct})</dd>`;
      }
      
  }

  function brushed(evt) {
    const sel = evt.selection;
    dots.classed('selected', (d) => isCommitSelected(sel, d));
    renderSelectionCount(sel);
    renderLanguageBreakdown(sel);
  }

  const brush = d3.brush().on('start brush end', brushed);
  svg.call(brush);

  d3.select('#selection-count')
    .insert('button', null)
    .text('Clear selection')
    .style('margin-left', '0.5rem')
    .on('click', () => svg.call(brush.move, null));

  // Keep tooltips working: dots above brush overlay
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// ---------- Run ----------
const lines = await loadData();
const commits = processCommits(lines);
renderCommitInfo(lines, commits);
renderScatterPlot(commits);
