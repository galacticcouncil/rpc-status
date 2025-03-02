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
    const x = d3.scalePoint()
      .domain(data.map(d => d.time))
      .range([0, width]);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) * 1.1]) // Add 10% padding
      .range([height, 0]);
    
    // Create line generator
    const line = d3.line()
      .x(d => x(d.time))
      .y(d => y(d.value))
      .curve(d3.curveMonotoneX);
    
    // Add X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');
    
    // Add Y axis
    g.append('g')
      .call(d3.axisLeft(y));
    
    // Add the line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', 'steelblue')
      .attr('stroke-width', 2)
      .attr('d', line);
    
    // Add dots
    g.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.time))
      .attr('cy', d => y(d.value))
      .attr('r', 4)
      .attr('fill', 'steelblue');
      
    // Add tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background-color', 'white')
      .style('border', '1px solid #ddd')
      .style('padding', '10px')
      .style('border-radius', '5px')
      .style('pointer-events', 'none');
      
    g.selectAll('circle')
      .on('mouseover', function(event, d) {
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        tooltip.html(`Time: ${d.time}<br/>Value: ${d.value.toFixed(2)}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function() {
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });
  }
</script>

<div bind:this={chart} class="chart"></div>

<style>
  .chart {
    width: 100%;
    height: 100%;
  }
</style>
