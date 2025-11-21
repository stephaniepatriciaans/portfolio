import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';


// ============================================================
// Parsing + data loading
// ============================================================

function parseDateTime(row) {
  if (row.datetime) {
    const d0 = new Date(row.datetime);
    if (!Number.isNaN(+d0)) return d0;
  }

  const date = row.date || '';
  const time = row.time || '00:00:00';
  let tz = row.timezone || 'Z';

  if (/^[+-]\d{4}$/.test(tz)) {
    tz = tz.replace(/([+-]\d{2})(\d{2})/, '$1:$2');
  }

  const candidate = new Date(`${date}T${time}${tz}`);
  if (!Number.isNaN(+candidate)) return candidate;

  const fallback = new Date(date);
  return Number.isNaN(+fallback) ? new Date(0) : fallback;
}

async function loadData() {
  const csvUrl = new URL('./loc.csv', import.meta.url);
  const rows = await d3.csv(csvUrl);

  return rows.map((row) => {
    const datetime = parseDateTime(row);
    return {
      ...row,
      line: +row.line || 0,
      depth: +row.depth || 0,
      length: +row.length || 0,
      datetime,
      date: new Date(datetime.toDateString()),
      author: row.author || row.committer || '',
      file: row.file || row.path || row.filename || '',
      type: row.type || row.language || '',
      time:
        row.time ||
        `${String(datetime.getHours()).padStart(2, '0')}:${String(
          datetime.getMinutes(),
        ).padStart(2, '0')}`,
      timezone: row.timezone || 'Z',
    };
  });
}

function processCommits(lines) {
  return d3
    .groups(lines, (d) => d.commit)
    .map(([commit, groupLines]) => {
      const first = groupLines[0] || {};
      const datetime = first.datetime ?? new Date(0);
      const hourFrac =
        datetime.getHours() +
        datetime.getMinutes() / 60 +
        datetime.getSeconds() / 3600;

      const ret = {
        id: commit,
        url:
          'https://github.com/stephaniepatriciaans/portofolio/commit/' + commit,
        author: first.author ?? '',
        date: first.date ?? new Date(0),
        time: first.time ?? '',
        timezone: first.timezone ?? 'Z',
        datetime,
        hourFrac,
        totalLines: groupLines.length,
      };

      Object.defineProperty(ret, 'lines', {
        value: groupLines,
        enumerable: false,
      });

      return ret;
    })
    .filter((d) => !Number.isNaN(+d.datetime));
}


// ============================================================
// Summary stats
// ============================================================

function renderCommitInfo(lines, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(lines.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  const filesCount = d3.group(lines, (d) => d.file).size;
  dl.append('dt').text('Number of files');
  dl.append('dd').text(filesCount);

  const fileLengths = d3.rollups(
    lines,
    (v) => d3.max(v, (r) => r.line),
    (d) => d.file,
  );
  const maxLen = d3.max(fileLengths, (d) => d[1]) || 0;
  const avgFileLen = d3.mean(fileLengths, (d) => d[1]) || 0;

  dl.append('dt').text('Max file length (lines)');
  dl.append('dd').text(maxLen.toFixed(0));

  dl.append('dt').text('Average file length (lines)');
  dl.append('dd').text(avgFileLen.toFixed(1));

  const periodOf = (h) =>
    h < 6 ? 'at night' : h < 12 ? 'in the morning' : h < 18 ? 'in the afternoon' : 'in the evening';
  const workByPeriod = d3.rollups(
    lines,
    (v) => v.length,
    (d) => periodOf(new Date(d.datetime).getHours()),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];

  dl.append('dt').text('Most active time of day');
  dl.append('dd').text(maxPeriod ?? '—');
}


// ============================================================
// Tooltip
// ============================================================

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
  const time = document.getElementById('commit-time-tooltip');

  link.href = c.url;
  link.textContent = c.id?.slice(0, 8) ?? '';
  date.textContent =
    c.datetime?.toLocaleString('en', { dateStyle: 'full' }) ?? '';
  author.textContent = c.author ?? '';
  lines.textContent = c.totalLines ?? 0;
  const hh = String(Math.floor(c.hourFrac || 0)).padStart(2, '0');
  const mm = String(Math.round(((c.hourFrac || 0) % 1) * 60)).padStart(2, '0');
  time.textContent = `${hh}:${mm}`;
}


// ============================================================
// Globals
// ============================================================

let allLines = [];
let allCommits = [];
let filteredCommits = [];

let cutTime = null;

const sliderEl = document.querySelector('#commit-progress');
const timeEl = document.querySelector('#commit-time');

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 44, left: 56 };
const usable = {
  left: margin.left,
  right: width - margin.right,
  top: margin.top,
  bottom: height - margin.bottom,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

let xScale;
let yScale;
let rScale;
let svg;
let dotsG;
let timeScale;


// ============================================================
// File + language views
// ============================================================

function updateFileDisplay(commitsSubset) {
  const container = d3.select('#files');
  if (!container.node()) return;

  const commitsToUse =
    commitsSubset && commitsSubset.length ? commitsSubset : allCommits;

  const allLinesForCommits = commitsToUse.flatMap((c) => c.lines ?? []);

  const files = d3
    .groups(
      allLinesForCommits,
      (d) => d.file || d.path || d.filename || '(unknown file)',
    )
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => d3.descending(a.lines.length, b.lines.length));

  const fileDivs = container
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        div.append('dt').append('code');
        div.append('dd');
      }),
    );

  fileDivs.select('dt > code').text((d) => d.name);
  fileDivs
    .select('dd')
    .text((d) => `${d.lines.length} lines`);
}

function updateLanguageBreakdown(commitsSubset) {
  const container = document.getElementById('language-breakdown');
  if (!container) return;

  const commitsToUse =
    commitsSubset && commitsSubset.length ? commitsSubset : allCommits;

  const lines = commitsToUse.flatMap((c) => c.lines ?? []);
  if (!lines.length) {
    container.innerHTML = '';
    return;
  }

  // "language" from file extension
  const extLabel = (file) => {
    const name = file || '';
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
    switch (ext) {
      case 'js':
        return 'JavaScript';
      case 'ts':
        return 'TypeScript';
      case 'html':
        return 'HTML';
      case 'css':
        return 'CSS';
      case 'json':
        return 'JSON';
      case 'md':
        return 'Markdown';
      default:
        return ext ? ext.toUpperCase() : 'Other';
    }
  };

  const breakdown = Array.from(
    d3.rollup(
      lines,
      (v) => v.length,
      (d) => extLabel(d.file || d.path || d.filename || ''),
    ),
  ).sort((a, b) => d3.descending(a[1], b[1]));

  const total = lines.length;
  const maxCount = d3.max(breakdown, (d) => d[1]) || 1;

  container.innerHTML = '';
  for (const [lang, count] of breakdown) {
    const pct = d3.format('.1~%')(count / total);
    const width = Math.round((count / maxCount) * 160);
    container.innerHTML += `
      <dt>${lang}</dt>
      <dd>${count} lines (${pct})
        <span class="bar" style="display:inline-block;height:6px;width:${width}px;background:var(--accent);border-radius:4px;margin-left:.5rem;"></span>
      </dd>
    `;
  }
}


// ============================================================
// Scatterplot
// ============================================================

function setupScales() {
  const dateExtent = d3.extent(allCommits, (d) => d.datetime);
  xScale = d3
    .scaleTime()
    .domain(dateExtent)
    .range([usable.left, usable.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usable.bottom, usable.top]);

  const [minLines, maxLines] = d3.extent(allCommits, (d) => d.totalLines);
  rScale = d3
    .scaleSqrt()
    .domain([minLines ?? 0, maxLines ?? 1])
    .range([2, 30]);

  timeScale = d3.scaleTime().domain(dateExtent).range([0, 100]);
}

function renderScatterPlot() {
  svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  const [d0, d1] = xScale.domain();
  const tickEvery = d3.timeWeek.every(1);
  const tickDates = tickEvery.range(d3.timeDay.floor(d0), d3.timeDay.ceil(d1));
  const fmtMonth = d3.timeFormat('%b');
  const fmtDay = d3.timeFormat('%d');
  const labelFmt = (d) =>
    d.getDate() === 1 ? `${fmtMonth(d)} ${fmtDay(d)}` : fmtDay(d);

  svg
    .append('g')
    .attr('transform', `translate(0,${usable.bottom})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickValues(tickDates)
        .tickFormat(labelFmt)
        .tickSizeOuter(0),
    )
    .call((g) => g.selectAll('text').attr('dy', '1.1em'));

  svg
    .append('g')
    .attr('transform', `translate(${usable.left},0)`)
    .call(
      d3
        .axisLeft(yScale)
        .ticks(12)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00')
        .tickSizeOuter(0),
    );

  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usable.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usable.width));

  svg
    .append('text')
    .attr('x', (usable.left + usable.right) / 2)
    .attr('y', height - 6)
    .attr('text-anchor', 'middle')
    .attr('class', 'axis-label')
    .text('Date');

  svg
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(usable.top + usable.bottom) / 2)
    .attr('y', 16)
    .attr('text-anchor', 'middle')
    .attr('class', 'axis-label')
    .text('Time of day');

  dotsG = svg.append('g').attr('class', 'dots');

  updateScatterPlot();
}

function updateScatterPlot() {
  if (!svg || !dotsG) return;

  const dayColor = d3
    .scaleLinear()
    .domain([0, 6, 12, 18, 24])
    .range(['#4f46e5', '#6366f1', '#93c5fd', '#f59e0b', '#f97316']);

  const currentCut = cutTime || d3.max(allCommits, (d) => d.datetime);

  const sorted = d3.sort(allCommits, (d) => -d.totalLines);

  dotsG
    .selectAll('circle')
    .data(sorted, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('fill', (d) => dayColor(d.hourFrac))
    .style('fill-opacity', 0.8)
    .attr('r', (d) =>
      d.datetime <= currentCut ? rScale(d.totalLines) : 0,
    )
    .style('pointer-events', (d) =>
      d.datetime <= currentCut ? 'auto' : 'none',
    )
    .on('mouseenter', (evt, d) => {
      if (d.datetime > currentCut) return;
      d3.select(evt.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(d);
      updateTooltipVisibility(true);
      updateTooltipPosition(evt);
    })
    .on('mousemove', (evt) => updateTooltipPosition(evt))
    .on('mouseleave', (evt) => {
      d3.select(evt.currentTarget).style('fill-opacity', 0.8);
      updateTooltipVisibility(false);
    });
}

function highlightCommitInScatter(commitId) {
  if (!dotsG) return;
  dotsG
    .selectAll('circle')
    .classed('highlight', (d) => d.id === commitId);
}


// ============================================================
// Slider
// ============================================================

function onTimeSliderChange() {
  if (!sliderEl || !timeScale) return;

  const progress = Number(sliderEl.value);
  cutTime = timeScale.invert(progress);

  if (timeEl && cutTime) {
    timeEl.textContent = cutTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  filteredCommits = allCommits.filter((d) => d.datetime <= cutTime);

  updateScatterPlot();
  updateFileDisplay(filteredCommits);
  updateLanguageBreakdown(filteredCommits);
}

function setupSlider() {
  if (!sliderEl) return;

  sliderEl.min = '0';
  sliderEl.max = '100';
  sliderEl.value = '100';

  sliderEl.addEventListener('input', onTimeSliderChange);
  sliderEl.addEventListener('change', onTimeSliderChange);

  onTimeSliderChange();
}


// ============================================================
// Scrollytelling with IntersectionObserver
// ============================================================

function setupScrollytelling() {
  const storyContainer = d3.select('#scatter-story');
  if (!storyContainer.node()) return;

  const commitsForStory =
    allCommits.length > 30
      ? d3.sort(allCommits, (d) => -d.totalLines).slice(0, 20)
      : allCommits;

  const steps = storyContainer
    .selectAll('div.step')
    .data(commitsForStory)
    .join('div')
    .attr('class', 'step')
    .html((d, i) => {
      const dtStr = d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      });

      const fileCount = d3.rollups(
        d.lines ?? [],
        (v) => v.length,
        (l) => l.file || l.path || l.filename || '(unknown file)',
      ).length;

      return `
        <p>
          On <strong>${dtStr}</strong>,
          I made
          <a href="${d.url}" target="_blank" rel="noopener noreferrer">
            ${i === 0 ? 'my first big commit' : 'a commit'}
          </a>
          that touched <strong>${fileCount}</strong> file${fileCount !== 1 ? 's' : ''}.
        </p>
        <p>
          It involved <strong>${d.totalLines}</strong> lines of code.
        </p>
      `;
    });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const commit = el.__data__;
        if (!commit) return;

        steps.classed('active', (d) => d.id === commit.id);

        if (timeScale && sliderEl) {
          sliderEl.value = String(timeScale(commit.datetime));
          onTimeSliderChange();
        }

        highlightCommitInScatter(commit.id);
      });
    },
    { threshold: 0.6 },
  );

  steps.each(function () {
    observer.observe(this);
  });
}


// ============================================================
// Boot
// ============================================================

const lines = await loadData();
const commits = processCommits(lines);

allLines = lines;
allCommits = commits;

cutTime = d3.max(allCommits, (d) => d.datetime);
filteredCommits = allCommits.slice();

renderCommitInfo(allLines, allCommits);
setupScales();
renderScatterPlot();
updateFileDisplay(filteredCommits);
updateLanguageBreakdown(filteredCommits);
setupSlider();
setupScrollytelling();