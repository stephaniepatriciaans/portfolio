import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// ===========================================================================
// LOAD AND PROCESS DATA
// ===========================================================================
async function loadData() {
  return await d3.csv('loc.csv', d => ({
    ...d,
    line: +d.line,
    depth: +d.depth,
    length: +d.length,
    date: new Date(d.date + 'T00:00' + d.timezone),
    datetime: new Date(d.datetime),
  }));
}

function processCommits(data) {
  return d3.groups(data, d => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      return {
        id: commit,
        url: 'https://github.com/vis-society/lab-7/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
        lines
      };
    })
    .sort((a, b) => a.datetime - b.datetime); // Sort by datetime
}

// Global variables
let data;
let commits = [];
let filteredCommits = [];
let xScale, yScale;
let commitProgress = 100;
let timeScale;
let commitMaxTime;

// Color scale for technologies
let colors = d3.scaleOrdinal(d3.schemeTableau10);


// ===========================================================================
// RENDER SCATTER PLOT
// ===========================================================================
function renderScatterPlot(commitsData) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  xScale = d3.scaleTime()
    .domain(d3.extent(commitsData, d => d.datetime))
    .range([margin.left, width - margin.right])
    .nice();

  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([height - margin.bottom, margin.top]);

  const [minLines, maxLines] = d3.extent(commitsData, d => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const svg = d3.select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`);

  // Gridlines
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-(width - margin.left - margin.right)))
    .style('opacity', 0.1);

  // Axes
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .attr('class', 'x-axis')
    .call(
      d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat('%b %d'))
        .ticks(d3.timeDay.every(1))
    );

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).tickFormat(d => `${String(d).padStart(2,'0')}:00`));

  // Dots group
  const dots = svg.append('g').attr('class', 'dots');

  const sortedCommits = d3.sort(commitsData, d => -d.totalLines);
  dots.selectAll('circle')
    .data(sortedCommits, d => d.id)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      showTooltip(commit);
      updateTooltipPosition(event);
    })
    .on('mousemove', event => updateTooltipPosition(event))
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      hideTooltip();
    });

  // Brush
  createBrushSelector(svg);
}

// ===========================================================================
// SCATTER PLOT
// ===========================================================================
function updateScatterPlot(commitsData) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commitsData, d => d.datetime));

  const [minLines, maxLines] = d3.extent(commitsData, d => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d3.timeFormat('%b %d'))
    .ticks(d3.timeDay.every(1));

  // X-axis
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(commitsData, d => -d.totalLines);
  dots
    .selectAll('circle')
    .data(sortedCommits, d => d.id)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      showTooltip(commit);
      updateTooltipPosition(event);
    })
    .on('mousemove', event => updateTooltipPosition(event))
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      hideTooltip();
    });
}


// ===========================================================================
// TOOLTIP FUNCTIONS
// ===========================================================================
function showTooltip(commit) {
  if (!commit) return;
  
  const tooltip = document.getElementById('commit-tooltip');
  
  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id.substring(0, 7);
  document.getElementById('commit-date').textContent = commit.datetime?.toLocaleDateString('en', { dateStyle: 'full' });
  
  // Tooltip-specific time element
  const timeElements = document.querySelectorAll('#commit-tooltip dd');
  timeElements[2].textContent = commit.datetime?.toLocaleTimeString('en', { timeStyle: 'short' });
  
  document.getElementById('commit-author').textContent = commit.author;
  document.getElementById('commit-lines').textContent = commit.totalLines;
  
  tooltip.hidden = false;
}

function hideTooltip() {
  document.getElementById('commit-tooltip').hidden = true;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX + 15}px`;
  tooltip.style.top = `${event.clientY + 15}px`;
}


// ===========================================================================
// BRUSH FUNCTIONS
// ===========================================================================
function createBrushSelector(svg) {
  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', d => isCommitSelected(selection, d));
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter(d => isCommitSelected(selection, d))
    : [];
  document.getElementById('selection-count').textContent = `${selectedCommits.length || 'No'} commits selected`;
  return selectedCommits;
}


// ===========================================================================
// LANGUAGE BREAKDOWN
// ===========================================================================
function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter(d => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap(d => d.lines);

  const breakdown = d3.rollup(
    lines,
    v => v.length,
    d => {
      const ext = d.file.split('.').pop();
      return ext === 'js' ? 'JavaScript'
           : ext === 'css' ? 'CSS'
           : ext === 'html' ? 'HTML'
           : ext;
    }
  );

  container.innerHTML = '';
  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}


// ===========================================================================
// COMMIT INFO STATS
// ===========================================================================
function renderCommitInfo(commitsData) {
  const lines = commitsData.flatMap(d => d.lines);
  
  let dl = d3.select('#stats').select('dl.stats');
  
  if (dl.empty()) {
    dl = d3.select('#stats').append('dl').attr('class','stats');
    
    dl.append('dt').html('Total <abbr title="Lines of Code">LOC</abbr>');
    dl.append('dd').attr('class', 'total-loc');
    
    dl.append('dt').text('Total commits');
    dl.append('dd').attr('class', 'total-commits');
    
    dl.append('dt').text('Number of files');
    dl.append('dd').attr('class', 'num-files');
    
    dl.append('dt').text('Max file length (lines)');
    dl.append('dd').attr('class', 'max-file-length');
    
    dl.append('dt').text('Average file length (lines)');
    dl.append('dd').attr('class', 'avg-file-length');
    
    dl.append('dt').text('Most active time of day');
    dl.append('dd').attr('class', 'active-time');
  }
  
  // Update values
  dl.select('.total-loc').text(lines.length);
  dl.select('.total-commits').text(commitsData.length);
  
  const numFiles = d3.group(lines, d => d.file).size;
  dl.select('.num-files').text(numFiles);
  
  const fileLengths = d3.rollups(lines, v => d3.max(v, d => d.line), d => d.file);
  dl.select('.max-file-length').text(d3.max(fileLengths, d => d[1]) || 0);
  dl.select('.avg-file-length').text(fileLengths.length > 0 ? d3.mean(fileLengths, d => d[1]).toFixed(1) : 0);
  
  const workByPeriod = d3.rollups(
    lines,
    v => v.length,
    d => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' })
  );
  dl.select('.active-time').text(d3.greatest(workByPeriod, d => d[1])?.[0] || 'N/A');
}


// ===========================================================================
// FILE DISPLAY
// ===========================================================================
function updateFileDisplay(filteredCommits) {
  let colors = d3.scaleOrdinal(d3.schemeTableau10);
  let lines = filteredCommits.flatMap(d => d.lines);
  let files = d3
    .groups(lines, d => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

    let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, d => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').call(dt => {
            dt.append('code');
            dt.append('small');
          });
          div.append('dd');
        })
      
    );
    

  // Filename and line count
  filesContainer.select('dt > code').text(d => d.name);
  filesContainer.select('dd').text(d => `${d.lines.length} lines`);

  // Unit visualization
  filesContainer
  .select('dd')
  .selectAll('div.loc')       
  .data(d => d.lines)           
  .join('div')      
  .attr('class', 'loc')
  .attr('style', (d) => `--color: ${colors(d.type)}`);
}


// ===========================================================================
// TIME SLIDER HANDLER
// ===========================================================================
function onTimeSliderChange() {
  const slider = document.getElementById("commit-progress");
  const timeDisplay = document.getElementById("commit-time");
  
  // CommitProgress from slider
  commitProgress = +slider.value;

  // CommitMaxTime using timeScale.invert()
  commitMaxTime = timeScale.invert(commitProgress);

  // <time> element
  timeDisplay.textContent = commitMaxTime.toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short"
  });

  // Filter commits
  filteredCommits = commits.filter(d => d.datetime <= commitMaxTime);

  // Visualizations
  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
  renderCommitInfo(filteredCommits);
}


// ===========================================================================
// SCROLLYTELLING
// ===========================================================================
function onStepEnter(response) {
  const commit = response.element.__data__;
  commitMaxTime = commit.datetime;
  filteredCommits = commits.filter(d => d.datetime <= commitMaxTime);
  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
  renderCommitInfo(filteredCommits);
}


// ===========================================================================
// MAIN EXECUTION
// ===========================================================================
data = await loadData();
commits = processCommits(data);
filteredCommits = commits;

// Setup time scale
timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, d => d.datetime),
    d3.max(commits, d => d.datetime),
  ])
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);

// Render initial visualizations
renderCommitInfo(commits);
renderScatterPlot(commits);
updateFileDisplay(commits);

// Setup slider
const slider = document.getElementById("commit-progress");
slider.addEventListener("input", onTimeSliderChange);
onTimeSliderChange(); 

// Setup scrollytelling
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((d, i) => `
    On ${d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    })},
    I edited ${d.totalLines} lines across ${
      d3.rollups(
        d.lines,
        (D) => D.length,
        (d) => d.file
      ).length
    } files.
    Then I looked over all I had made, and I saw that it was very good.
  `);

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);