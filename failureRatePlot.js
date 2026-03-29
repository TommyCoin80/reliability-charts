// ── Plot factory ──────────────────────────────────────────────────────────
function failureRatePlot(selector, data, options = {}) {
  const {
    palette   = PALETTE,
    margin    = { top: 24, right: 32, bottom: 44, left: 56 },
    totalW    = 780,
    totalH    = 380,
    title     = "Failure Probability Over Time",
    subtitle  = "Component reliability degradation by group · 95% confidence interval",
    xLabel    = "Days",
    yLabel    = "Failure Probability",
    stepCurve = false,
  } = options;

  // ── Create DOM structure inside the selected container ───────────────────
  const container = d3.select(selector);

  const card = container.append("div").attr("class", "card");

  const headerEl = card.append("div").attr("class", "header");
  headerEl.append("h1").text(title);
  headerEl.append("p").text(subtitle);

  const chartDiv = card.append("div");
  const legendEl = card.append("div").attr("class", "legend");

  const tooltip = container.append("div").attr("class", "tooltip");

  // ── Group data ───────────────────────────────────────────────────────────
  const grouped  = d3.group(data, d => d.group);
  const groupKeys = [...grouped.keys()];

  // Resolve colour — fall back to a generated hue if group not in palette
  const fallbackScale = d3.scaleOrdinal(d3.schemeTableau10);
  const color = key => palette[key] ?? fallbackScale(key);

  // ── Layout ──────────────────────────────────────────────────────────────
  const W = totalW - margin.left - margin.right;
  const H = totalH - margin.top - margin.bottom;

  const svg = chartDiv.append("svg")
    .attr("width", totalW)
    .attr("height", totalH);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // ── Scales ──────────────────────────────────────────────────────────────
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.day)])
    .range([0, W]);

  const yMax = d3.max(data, d => d.hi ?? d.p);
  const y = d3.scaleLinear()
    .domain([0, yMax * 1.1])
    .range([H, 0])
    .nice();

  // ── Grid ────────────────────────────────────────────────────────────────
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-W).tickFormat(""));

  // ── Axes ────────────────────────────────────────────────────────────────
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${H})`)
    .call(d3.axisBottom(x)
      .ticks(7)
      .tickFormat(d => d));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y)
      .ticks(5)
      .tickFormat(d => `${(d * 100).toFixed(0)}%`));

  // axis labels
  g.append("text")
    .attr("x", W / 2).attr("y", H + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563").attr("font-size", 11)
    .text(xLabel);

  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -H / 2).attr("y", -44)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563").attr("font-size", 11)
    .text(yLabel);

  // ── Path generators ─────────────────────────────────────────────────────
  const curve = stepCurve ? d3.curveStepAfter : d3.curveCatmullRom.alpha(0.5);

  const areaGen = d3.area()
    .x(d  => x(d.day))
    .y0(d => y(d.lo))
    .y1(d => y(d.hi))
    .curve(curve);

  const lineGen = field => d3.line()
    .x(d => x(d.day))
    .y(d => y(d[field]))
    .curve(curve);

  // ── Draw one series per group ────────────────────────────────────────────
  groupKeys.forEach(key => {
    const series = grouped.get(key);
    const c = color(key);

    // CI band
    g.append("path")
      .datum(series)
      .attr("class", "ci-band")
      .attr("fill", c)
      .attr("d", areaGen);

    // CI boundary lines
    ["hi", "lo"].forEach(field => {
      g.append("path")
        .datum(series)
        .attr("class", field === "hi" ? "ci-upper" : "ci-lower")
        .attr("stroke", c)
        .attr("d", lineGen(field)(series));
    });

    // Main line with draw animation
    const mainPath = g.append("path")
      .datum(series)
      .attr("class", "line-main")
      .attr("stroke", c)
      .attr("d", lineGen("p")(series));

    const len = mainPath.node().getTotalLength();
    mainPath
      .attr("stroke-dasharray", `${len} ${len}`)
      .attr("stroke-dashoffset", len)
      .transition().duration(1600).ease(d3.easeCubicInOut)
      .attr("stroke-dashoffset", 0);
  });

  // ── Hover interaction ────────────────────────────────────────────────────
  // One dot per group
  const dots = {};
  groupKeys.forEach(key => {
    dots[key] = g.append("circle")
      .attr("r", 5)
      .attr("fill", color(key))
      .attr("stroke", "#1a1d27")
      .attr("stroke-width", 2.5)
      .style("opacity", 0);
  });

  // Vertical crosshair rule
  const rule = g.append("line")
    .attr("y1", 0).attr("y2", H)
    .attr("stroke", "#3d4168")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .style("opacity", 0);

  const bisect = d3.bisector(d => d.day).left;
  const pct    = v => `${(v * 100).toFixed(1)}%`;

  g.append("rect")
    .attr("width", W).attr("height", H)
    .attr("fill", "transparent")
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event);
      const x0 = x.invert(mx);

      // Snap each group to its nearest point
      const snapped = groupKeys.map(key => {
        const series = grouped.get(key);
        const i  = bisect(series, x0, 1);
        const d0 = series[i - 1], d1 = series[i] || d0;
        return x0 - d0.day > d1.day - x0 ? d1 : d0;
      });

      // Move dots
      groupKeys.forEach((key, i) => {
        const d = snapped[i];
        dots[key].attr("cx", x(d.day)).attr("cy", y(d.p)).style("opacity", 1);
      });

      // Move rule to first group's snapped x
      rule.attr("x1", x(snapped[0].day)).attr("x2", x(snapped[0].day)).style("opacity", 1);

      // Build tooltip rows
      const rows = groupKeys.map((key, i) => {
        const d = snapped[i];
        const c = color(key);
        return `
          <div class="t-row">
            <div class="t-dot" style="background:${c};"></div>
            <span class="t-label">Group ${key}</span>
            <span class="t-val" style="color:${c};">${pct(d.p)}</span>
          </div>
          <div class="t-ci">95% CI: ${pct(d.lo)} – ${pct(d.hi)}</div>
        `;
      }).join('<hr class="t-sep">');

      const [px, py] = [event.pageX, event.pageY];
      tooltip
        .style("opacity", 1)
        .style("left", `${px + 14}px`)
        .style("top",  `${py - 80}px`)
        .html(`<div class="t-date">Day ${snapped[0].day}</div>${rows}`);
    })
    .on("mouseleave", () => {
      groupKeys.forEach(key => dots[key].style("opacity", 0));
      rule.style("opacity", 0);
      tooltip.style("opacity", 0);
    });

  // ── Legend (dynamic) ─────────────────────────────────────────────────────
  groupKeys.forEach(key => {
    const c = color(key);
    legendEl.append("div")
      .attr("class", "legend-item")
      .html(`<div class="legend-line" style="background:${c};"></div>Group ${key}`);
  });

  return svg;
}
