<!-- LineChart.svelte - Line chart component using D3 with TUI CSS styling -->
<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  // Props
  export let data = [];
  export let errorThreshold = 2000; // Consider anything above 2000ms as potential error

  // DOM elements
  let chart;
  let svg;

  // Chart dimensions
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  let width;
  let height;

  // TUI specific colors
  const colors = {
    background: '#000080', // TUI blue background
    text: '#ffffff',       // TUI text color
    grid: '#aaaaaa',       // Grid lines
    line: '#00ff00',       // Line color (green)
    average: '#ffff00',    // Average line (yellow)
    error: '#ff0000'       // Error indicator (red)
  };

  // Create the chart on mount
  onMount(() => {
    svg = d3.select(chart)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background-color', 'transparent');

    // Call updateChart once to set up initial structure
    updateChart();
  });

  // Update the chart when data changes
  afterUpdate(() => {
    if (data.length > 0) {
      updateChart();
    }
  });

  // Main chart update function
  function updateChart() {
    if (!svg || !chart || !data.length) return;

    // Get current dimensions
    const chartRect = chart.getBoundingClientRect();
    width = chartRect.width - margin.left - margin.right;
    height = chartRect.height - margin.top - margin.bottom;

    // Clear existing chart
    svg.selectAll('*').remove();

    // Create chart group with margins
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => typeof d.time === 'string' ? new Date(d.time) : d.time))
      .range([0, width]);

    // Find reasonable max for y scale, excluding extreme outliers
    const validValues = data
      .filter(d => d.value !== null && d.value !== undefined && !d.error)
      .map(d => d.value);

    // Use 90th percentile + padding as max for normal view
    const normalMax = d3.quantile(validValues.sort(d3.ascending), 0.9) * 1.5 || errorThreshold;

    const y = d3.scaleLinear()
      .domain([0, normalMax])
      .range([height, 0]);

    // Add grid lines (TUI style - dotted)
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .ticks(10)
        .tickSize(-height)
        .tickFormat(''))
      .selectAll('.tick line')
      .style('stroke', colors.grid)
      .style('stroke-opacity', 0.3)
      .style('stroke-dasharray', '2,2');

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .ticks(5)
        .tickSize(-width)
        .tickFormat(''))
      .selectAll('.tick line')
      .style('stroke', colors.grid)
      .style('stroke-opacity', 0.3)
      .style('stroke-dasharray', '2,2');

    // Calculate average latency (excluding errors)
    const averageLatency = d3.mean(validValues);

    // Separate data into segments where there are no errors
    const segments = [];
    let currentSegment = [];

    data.forEach(d => {
      const isError = d.error || d.value === null || d.value > errorThreshold;

      if (!isError) {
        currentSegment.push(d);
      } else {
        if (currentSegment.length > 0) {
          segments.push([...currentSegment]);
          currentSegment = [];
        }
        // Add the error point as its own "segment" for highlighting
        segments.push([{...d, isError: true}]);
      }
    });

    // Add the last segment if it exists
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    // Create line generator for normal data
    const line = d3.line()
      .x(d => x(typeof d.time === 'string' ? new Date(d.time) : d.time))
      .y(d => y(Math.min(d.value, normalMax))) // Cap at normalMax for display
      .curve(d3.curveBasis); // Smoother curve

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .ticks(5)
        .tickFormat(d3.timeFormat('%H:%M')))
      .selectAll('text')
      .style('fill', colors.text)
      .style('font-family', '"Perfect DOS VGA", monospace')
      .style('font-size', '10px')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .style('fill', colors.text)
      .style('font-family', '"Perfect DOS VGA", monospace')
      .style('font-size', '10px');

    // Add axis lines with TUI style
    g.selectAll('.domain')
      .style('stroke', colors.text)
      .style('stroke-width', '1px');

    g.selectAll('.tick line')
      .style('stroke', colors.text)
      .style('stroke-width', '1px');

    // Draw each segment
    segments.forEach(segment => {
      if (segment.length === 0) return;

      // Check if this is an error segment
      if (segment.length === 1 && segment[0].isError) {
        // Draw error marker
        const d = segment[0];
        g.append('rect')
          .attr('x', x(typeof d.time === 'string' ? new Date(d.time) : d.time) - 5)
          .attr('y', 0)
          .attr('width', 10)
          .attr('height', height)
          .attr('fill', colors.error)
          .attr('fill-opacity', 0.3)
          .attr('stroke', 'none');

        g.append('text')
          .attr('x', x(typeof d.time === 'string' ? new Date(d.time) : d.time))
          .attr('y', 20)
          .attr('text-anchor', 'middle')
          .attr('fill', colors.error)
          .attr('font-family', '"Perfect DOS VGA", monospace')
          .attr('font-size', '10px')
          .text('X');
      } else {
        // Draw normal line segment
        g.append('path')
          .datum(segment)
          .attr('fill', 'none')
          .attr('stroke', colors.line)
          .attr('stroke-width', 2)
          .attr('d', line);
      }
    });

    // Add circles for valid data points (for clarity)
    g.selectAll('.data-point')
      .data(data.filter(d => !d.error && d.value !== null && d.value <= errorThreshold))
      .enter()
      .append('circle')
      .attr('cx', d => x(typeof d.time === 'string' ? new Date(d.time) : d.time))
      .attr('cy', d => y(d.value))
      .attr('r', 2)
      .attr('fill', colors.line);

    // Add average line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y(averageLatency))
      .attr('y2', y(averageLatency))
      .attr('stroke', colors.average)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5');

    // Add average label
    g.append('text')
      .attr('x', width - 5)
      .attr('y', y(averageLatency) - 5)
      .attr('text-anchor', 'end')
      .attr('fill', colors.average)
      .attr('font-family', '"Perfect DOS VGA", monospace')
      .attr('font-size', '10px')
      .text(`Avg: ${averageLatency.toFixed(2)} ms`);

    // Add labels
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + margin.bottom)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-family', '"Perfect DOS VGA", monospace')
      .attr('font-size', '10px')
      .text('Time');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -margin.left + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', colors.text)
      .attr('font-family', '"Perfect DOS VGA", monospace')
      .attr('font-size', '10px')
      .text('Latency (ms)');
  }
</script>

<div bind:this={chart} class="chart"></div>

<style>
    .chart {
        width: 100%;
        height: 100%;
        background-color: transparent;
    }
</style>
