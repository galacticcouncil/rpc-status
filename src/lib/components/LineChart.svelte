<!-- LineChart.svelte - Line chart component using D3 -->
<script>
  import { onMount, afterUpdate } from 'svelte';
  import * as d3 from 'd3';

  // Props
  export let data = [];

  // DOM elements
  let chart;
  let svg;

  // Chart dimensions
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  let width;
  let height;

  // Create the chart on mount
  onMount(() => {
    svg = d3.select(chart)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

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

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) * 1.1]) // Add 10% padding
      .range([height, 0]);

    // Calculate average latency
    const averageLatency = d3.mean(data, d => d.value);

    // Create smoother line generator with tension control
    const line = d3.line()
      .x(d => x(typeof d.time === 'string' ? new Date(d.time) : d.time))
      .y(d => y(d.value))
      .curve(d3.curveBasis); // Smoother curve

    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .ticks(5) // Fewer ticks for simplicity
        .tickFormat(d3.timeFormat('%H:%M'))) // Simpler time format
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(5));

    // Add the line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add average line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y(averageLatency))
      .attr('y2', y(averageLatency))
      .attr('stroke', 'red')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5');

    // Add average label
    g.append('text')
      .attr('x', width - 5)
      .attr('y', y(averageLatency) - 5)
      .attr('text-anchor', 'end')
      .attr('fill', 'red')
      .attr('font-size', '12px')
      .text(`Avg: ${averageLatency.toFixed(2)} ms`);

    // Add labels
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + margin.bottom)
      .attr('text-anchor', 'middle')
      .text('Time');

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -margin.left + 15)
      .attr('text-anchor', 'middle')
      .text('Latency (ms)');
  }
</script>

<div bind:this={chart} class="chart"></div>

<style>
    .chart {
        width: 100%;
        height: 100%;
    }
</style>
