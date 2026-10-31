(() => {
  const vscode = acquireVsCodeApi();
  const svg = document.getElementById("graph");
  const summary = document.getElementById("summary");
  const details = document.getElementById("details");
  const search = document.getElementById("search");
  const layout = document.getElementById("layout");
  const direction = document.getElementById("direction");
  const depth = document.getElementById("depth");
  const depthLabel = document.getElementById("depth-label");
  const depthText = document.getElementById("depth-text");
  const external = document.getElementById("external");
  const isolated = document.getElementById("isolated");
  const problemsButton = document.getElementById("problems");
  const tooltip = document.getElementById("tooltip");
  const NS = "http://www.w3.org/2000/svg";
  const geometry = globalThis.MatlabVizGeometry;
  const sizes = new Map();
  const nodeElements = new Map();
  const edgeElements = new Map();
  const labelCanvas = document.createElement("canvas");
  const labelContext = labelCanvas.getContext?.("2d");
  const fontFamily = typeof getComputedStyle === "function" ? getComputedStyle(document.body).fontFamily : "Arial, sans-serif";
  if (labelContext) labelContext.font = `12px ${fontFamily}`;

  let graph;
  let selectedId;
  let positions = new Map();
  let transform = { x: 0, y: 0, k: 1 };
  let world;
  let panning;
  let dragging;
  let graphKey;
  let detailSelection;
  let viewportCustomized = false;
  let stateFrame;
  let suppressClick = false;
  let dragFrame;
  let pointerNodeId;
  const initialState = vscode.getState();

  function saveState() {
    if (!graph) return;
    vscode.setState({
      version: 1, geometryVersion: 1, graphKey,
      controls: { search: search.value, layout: layout.value, direction: direction.value,
        depth: Number(depth.value), external: external.checked, isolated: isolated.checked },
      selectedId, detailSelection, positions: [...positions], transform: { ...transform }, viewportCustomized
    });
  }

  function saveStateSoon() {
    if (stateFrame !== undefined) return;
    stateFrame = requestAnimationFrame(() => { stateFrame = undefined; saveState(); });
  }

  function resetDetails() {
    detailSelection = undefined;
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = "Selection";
    const paragraph = document.createElement("p"); paragraph.textContent = "Select a node or edge.";
    details.append(heading, paragraph);
  }

  function restoreState(value) {
    if (!value || value.version !== 1 || value.graphKey !== graphKey) return false;
    const controls = value.controls || {};
    if (typeof controls.search === "string") search.value = controls.search;
    if (["force", "hierarchical", "circle", "grid"].includes(controls.layout)) layout.value = controls.layout;
    if (["all", "dependencies", "impact"].includes(controls.direction)) direction.value = controls.direction;
    if (Number.isInteger(controls.depth) && controls.depth >= 1 && controls.depth <= 20) depth.value = String(controls.depth);
    if (typeof controls.external === "boolean") external.checked = controls.external;
    if (typeof controls.isolated === "boolean") isolated.checked = controls.isolated;
    const ids = new Set(graph.nodes.map((node) => node.id));
    selectedId = ids.has(value.selectedId) ? value.selectedId : undefined;
    if (!selectedId) direction.value = "all";
    if (value.geometryVersion === 1 && Array.isArray(value.positions)) {
      for (const entry of value.positions) {
        if (Array.isArray(entry) && ids.has(entry[0]) && entry[1]
          && Number.isFinite(entry[1].x) && Number.isFinite(entry[1].y)) {
          positions.set(entry[0], { x: entry[1].x, y: entry[1].y });
        }
      }
    }
    const view = value.transform;
    if (value.geometryVersion === 1 && view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.k) && view.k > 0 && view.k <= 1e6) {
      transform = { x: view.x, y: view.y, k: view.k };
      viewportCustomized = value.viewportCustomized === true;
    }
    const selection = value.detailSelection;
    if (selection && ((selection.kind === "node" && ids.has(selection.id))
      || (selection.kind === "edge" && graph.edges.some((edge) => edge.id === selection.id))
      || selection.kind === "problems")) detailSelection = selection;
    return true;
  }

  function restoreDetails() {
    if (detailSelection?.kind === "node") showNode(graph.nodes.find((node) => node.id === detailSelection.id));
    else if (detailSelection?.kind === "edge") showEdge(graph.edges.find((edge) => edge.id === detailSelection.id));
    else if (detailSelection?.kind === "problems") showProblems();
  }

  function element(name, attributes = {}) {
    const value = document.createElementNS(NS, name);
    for (const [key, item] of Object.entries(attributes)) value.setAttribute(key, String(item));
    return value;
  }

  function nodeSize(node) {
    if (!sizes.has(node.id)) sizes.set(node.id, geometry.labelBox(node.relativePath || node.label,
      labelContext ? (value) => labelContext.measureText(value).width : undefined));
    return sizes.get(node.id);
  }

  function currentGraph() {
    if (!graph) return { nodes: [], edges: [] };
    const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    let allowed = new Set(graph.nodes
      .filter((node) => external.checked || !node.external)
      .filter((node) => isolated.checked || (degree.get(node.id) || 0) > 0)
      .map((node) => node.id));
    if (selectedId && direction.value !== "all") {
      const traced = trace(selectedId, direction.value, Number(depth.value) || 3);
      allowed = new Set([...allowed].filter((id) => traced.has(id)));
    }
    return {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target))
    };
  }

  function trace(start, mode, maximumDepth) {
    const adjacency = new Map();
    for (const edge of graph.edges) {
      const from = mode === "dependencies" ? edge.source : edge.target;
      const to = mode === "dependencies" ? edge.target : edge.source;
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push(to);
    }
    const found = new Set([start]);
    const queue = [{ id: start, depth: 0 }];
    while (queue.length) {
      const item = queue.shift();
      if (item.depth >= maximumDepth) continue;
      for (const next of adjacency.get(item.id) || []) {
        if (!found.has(next)) {
          found.add(next);
          queue.push({ id: next, depth: item.depth + 1 });
        }
      }
    }
    return found;
  }

  function isFunctionGraph() {
    return graph?.metadata.graphType === "call-hierarchy";
  }

  function updateDepthControl() {
    const functionGraph = isFunctionGraph();
    depthText.textContent = functionGraph ? "Analysis depth" : "Trace depth";
    depth.disabled = !functionGraph && direction.value === "all";
    depthLabel.title = functionGraph
      ? "Maximum caller/callee analysis depth. Refresh rebuilds the hierarchy to this depth."
      : direction.value === "all"
        ? "Select Dependencies or Impact to filter the displayed graph by trace depth."
        : "Maximum dependency or impact depth shown from the selected node. This does not rerun or expand repository analysis.";
  }

  function problemSummary() {
    if (!graph?.problems.length) return "0 notices";
    const counts = new Map();
    for (const problem of graph.problems) counts.set(problem.severity, (counts.get(problem.severity) || 0) + 1);
    return [
      ["error", "error"],
      ["warning", "warning"],
      ["information", "information notice"]
    ]
      .filter(([severity]) => counts.get(severity))
      .map(([severity, label]) => `${counts.get(severity)} ${label}${counts.get(severity) === 1 ? "" : "s"}`)
      .join(", ");
  }

  function problemFileLabel(file) {
    if (!file) return "General analysis notice";
    const normalized = file.replace(/\\/g, "/");
    const root = graph.metadata.root.replace(/\\/g, "/").replace(/\/$/, "");
    return normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)
      ? normalized.slice(root.length + 1)
      : normalized;
  }

  function showProblems() {
    detailSelection = { kind: "problems" };
    saveStateSoon();
    details.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = `Analysis notices (${graph?.problems.length || 0})`;
    details.appendChild(heading);
    if (!graph?.problems.length) {
      const empty = document.createElement("p"); empty.textContent = "No analysis notices were reported."; details.appendChild(empty);
      return;
    }
    for (const problem of graph.problems) {
      const article = document.createElement("article"); article.className = "problem";
      const title = document.createElement("h3"); title.textContent = problemFileLabel(problem.file); article.appendChild(title);
      const severity = document.createElement("p"); severity.className = `problem-severity ${problem.severity}`; severity.textContent = problem.severity; article.appendChild(severity);
      const message = document.createElement("p"); message.className = "problem-message"; message.textContent = problem.message; article.appendChild(message);
      if (problem.file) {
        const lineMatch = problem.message.match(/\bLine\s+(\d+)/i);
        const line = lineMatch ? Math.max(0, Number(lineMatch[1]) - 1) : undefined;
        const open = document.createElement("button"); open.textContent = "Open file";
        open.addEventListener("click", () => vscode.postMessage({ type: "openFile", path: problem.file, line }));
        article.appendChild(open);
      }
      details.appendChild(article);
    }
  }

  function calculateLayout(kind) {
    const data = currentGraph();
    if (!data.nodes.length) return;
    data.nodes.forEach(nodeSize);
    if (kind === "circle") geometry.circle(data.nodes, positions, sizes);
    else if (kind === "grid") geometry.grid(data.nodes, positions, sizes);
    else if (kind === "hierarchical") geometry.hierarchical(data, positions, sizes);
    else { forceLayout(data); geometry.separate(data.nodes, positions, sizes); }
  }

  function forceLayout(data) {
    if (data.nodes.length > 350) {
      geometry.hierarchical(data, positions, sizes);
      return;
    }
    const count = data.nodes.length;
    data.nodes.forEach((node, index) => {
      if (!positions.has(node.id)) {
        const angle = (index / count) * Math.PI * 2;
        positions.set(node.id, { x: Math.cos(angle) * count * 8, y: Math.sin(angle) * count * 8 });
      }
    });
    for (let iteration = 0; iteration < 100; iteration++) {
      const forces = new Map(data.nodes.map((node) => [node.id, { x: 0, y: 0 }]));
      for (let first = 0; first < count; first++) {
        for (let second = first + 1; second < count; second++) {
          const a = positions.get(data.nodes[first].id), b = positions.get(data.nodes[second].id);
          let dx = a.x - b.x, dy = a.y - b.y;
          const distance2 = Math.max(100, dx * dx + dy * dy);
          const magnitude = 7000 / distance2;
          const distance = Math.sqrt(distance2);
          dx /= distance; dy /= distance;
          forces.get(data.nodes[first].id).x += dx * magnitude;
          forces.get(data.nodes[first].id).y += dy * magnitude;
          forces.get(data.nodes[second].id).x -= dx * magnitude;
          forces.get(data.nodes[second].id).y -= dy * magnitude;
        }
      }
      for (const edge of data.edges) {
        const a = positions.get(edge.source), b = positions.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const magnitude = (distance - 230) * .018;
        forces.get(edge.source).x += (dx / distance) * magnitude;
        forces.get(edge.source).y += (dy / distance) * magnitude;
        forces.get(edge.target).x -= (dx / distance) * magnitude;
        forces.get(edge.target).y -= (dy / distance) * magnitude;
      }
      const cooling = 1 - iteration / 110;
      for (const node of data.nodes) {
        const point = positions.get(node.id), force = forces.get(node.id);
        point.x += Math.max(-15, Math.min(15, force.x)) * cooling;
        point.y += Math.max(-15, Math.min(15, force.y)) * cooling;
      }
    }
  }

  function render(reposition = false) {
    if (!graph) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    nodeElements.clear(); edgeElements.clear();
    const data = currentGraph();
    data.nodes.forEach(nodeSize);
    if (reposition || data.nodes.some((node) => !positions.has(node.id))) calculateLayout(layout.value);
    const defs = element("defs");
    const marker = element("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    marker.appendChild(element("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "context-stroke" }));
    defs.appendChild(marker);
    const filter = element("filter", { id: "shadow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
    const shadow = element("feDropShadow", { dx: 0, dy: 1, stdDeviation: 1.2, "flood-opacity": .2 });
    filter.appendChild(shadow); defs.appendChild(filter); svg.appendChild(defs);
    world = element("g", { transform: transformValue() }); svg.appendChild(world);
    if (!data.nodes.length) {
      const text = element("text", { x: 30, y: 50, class: "empty" }); text.textContent = "No nodes match the current filters."; world.appendChild(text);
    }
    const query = search.value.trim().toLowerCase();
    for (const edge of data.edges) drawEdge(edge);
    for (const node of data.nodes) drawNode(node, query);
    saveStateSoon();
    const itemLabel = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "files" : "symbols";
    const edgeLabel = graph.metadata.graphType === "references" ? "references" : graph.metadata.graphType === "call-hierarchy" ? "calls" : "dependencies";
    summary.textContent = `${data.nodes.length}/${graph.nodes.length} ${itemLabel} · ${data.edges.length}/${graph.edges.length} ${edgeLabel} · ${graph.products.length} product references · ${problemSummary()} · ${graph.metadata.mode} · ${graph.metadata.durationSeconds.toFixed(1)} s`;
  }

  function drawEdge(edge) {
    const value = geometry.edgeGeometry(edge, positions, sizes);
    if (!value) return;
    const line = element(value.d ? "path" : "line", { class: `edge${selectedId && (edge.source === selectedId || edge.target === selectedId) ? " highlight" : ""}`, "data-edge-id": edge.id });
    for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
    edgeElements.set(edge.id, line);
    line.addEventListener("click", (event) => { event.stopPropagation(); showEdge(edge); });
    line.addEventListener("mouseenter", (event) => showTooltip(event, edge.kind));
    line.addEventListener("mouseleave", hideTooltip);
    world.appendChild(line);
  }

  function drawNode(node, query) {
    const point = positions.get(node.id), size = nodeSize(node);
    const matches = !query || `${node.label} ${node.relativePath} ${node.path}`.toLowerCase().includes(query);
    const group = element("g", { transform: `translate(${point.x},${point.y})`, "data-node-id": node.id, class: `node${node.external ? " external" : ""}${node.missing ? " missing" : ""}${node.id === selectedId ? " selected" : ""}${matches ? "" : " dim"}` });
    nodeElements.set(node.id, group);
    group.appendChild(element("rect", { x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height }));
    const text = element("text", { "text-anchor": "middle", "xml:space": "preserve" });
    size.lines.forEach((line, index) => {
      const span = element("tspan", { x: 0, y: (index - (size.lines.length - 1) / 2) * 16 + 4 });
      span.textContent = line; text.appendChild(span);
    });
    group.appendChild(text);
    group.addEventListener("click", (event) => { event.stopPropagation(); if (suppressClick) { suppressClick = false; return; } selectedId = node.id; showNode(node); render(direction.value !== "all"); });
    group.addEventListener("dblclick", (event) => { event.stopPropagation(); vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character }); });
    group.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation(); suppressClick = false;
      pointerNodeId = node.id;
      dragging = { id: node.id, start: screenToWorld(event.clientX, event.clientY), x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
    });
    group.addEventListener("mouseenter", (event) => showTooltip(event, `${node.kind}\n${node.path}`));
    group.addEventListener("mouseleave", hideTooltip);
    world.appendChild(group);
  }

  function showNode(node) {
    if (!node) return;
    detailSelection = { kind: "node", id: node.id };
    saveStateSoon();
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = node.label; details.appendChild(heading);
    const list = document.createElement("dl");
    const fields = [["Path", node.path], ["Type", node.kind]];
    if (node.line !== undefined) fields.push(["Line", String(node.line + 1)]);
    if (node.containerName) fields.push(["Container", node.containerName]);
    fields.push(["External", node.external ? "Yes" : "No"], ["Missing", node.missing ? "Yes" : "No"]);
    for (const [name, value] of fields) {
      const term = document.createElement("dt"); term.textContent = name;
      const description = document.createElement("dd"); description.textContent = value;
      list.append(term, description);
    }
    details.appendChild(list);
    const counts = document.createElement("p");
    counts.textContent = `${graph.edges.filter((edge) => edge.source === node.id).length} dependencies · ${graph.edges.filter((edge) => edge.target === node.id).length} impacted files`;
    details.appendChild(counts);
    const button = document.createElement("button"); button.textContent = node.line === undefined ? "Open file" : "Open symbol"; button.addEventListener("click", () => vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character })); details.appendChild(button);
  }

  function showEdge(edge) {
    if (!edge) return;
    detailSelection = { kind: "edge", id: edge.id };
    saveStateSoon();
    const source = graph.nodes.find((node) => node.id === edge.source), target = graph.nodes.find((node) => node.id === edge.target);
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = "Dependency"; details.appendChild(heading);
    const paragraph = document.createElement("p"); paragraph.textContent = `${source?.relativePath || edge.source} → ${target?.relativePath || edge.target}`; details.appendChild(paragraph);
    const kind = document.createElement("p"); kind.textContent = edge.kind; details.appendChild(kind);
    if (edge.details) { const value = document.createElement("p"); value.textContent = edge.details; details.appendChild(value); }
  }

  function showTooltip(event, text) { tooltip.textContent = text; tooltip.hidden = false; tooltip.style.left = `${event.clientX + 12}px`; tooltip.style.top = `${event.clientY + 12}px`; }
  function hideTooltip() { tooltip.hidden = true; }
  function transformValue() { return `translate(${transform.x},${transform.y}) scale(${transform.k})`; }
  function updateTransform() { if (world) world.setAttribute("transform", transformValue()); saveStateSoon(); }
  function screenToWorld(x, y) { const rect = svg.getBoundingClientRect(); return { x: (x - rect.left - transform.x) / transform.k, y: (y - rect.top - transform.y) / transform.k }; }

  function fit() {
    const data = currentGraph();
    if (!data.nodes.length) return;
    viewportCustomized = false;
    const rect = svg.getBoundingClientRect();
    transform = geometry.fit(geometry.bounds(data, positions, sizes), rect.width, rect.height);
    updateTransform();
  }

  async function exportVisual(format, scope = "graph", scale = 2) {
    try {
      const data = currentGraph();
      const theme = getComputedStyle(document.documentElement);
      const css = (name, fallback) => theme.getPropertyValue(name).trim() || fallback;
      const result = geometry.svgDocument(data, positions, sizes, {
        scope, transform, width: svg.clientWidth, height: svg.clientHeight, selectedId, search: search.value, fontFamily,
        colors: { background: css("--vscode-editor-background", "#fff"), text: css("--vscode-editor-foreground", "#222"),
          node: css("--vscode-charts-blue", "#1976d2"), edge: css("--vscode-descriptionForeground", "#888"),
          selected: css("--vscode-focusBorder", "#c05a00"), external: css("--vscode-charts-yellow", "#a17700"), missing: css("--vscode-errorForeground", "#d32f2f") }
      });
      const metadata = { scope, nodes: data.nodes.length, edges: data.edges.length };
      if (format === "svg") {
        vscode.postMessage({ type: "saveVisual", format, data: result.source, encoding: "utf8", ...metadata });
        return;
      }
      const dimensions = geometry.rasterSize(result.width, result.height, scale);
      const image = new Image();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("PNG rendering timed out. Export SVG instead.")), 15_000);
        image.onload = () => { clearTimeout(timer); resolve(); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("Could not render SVG as PNG. Export SVG instead.")); };
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.source)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width; canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG canvas is unavailable. Export SVG instead.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const output = canvas.toDataURL("image/png");
      if (!output.startsWith("data:image/png;base64,")) throw new Error("PNG canvas exceeded the renderer's limits. Export SVG instead.");
      vscode.postMessage({ type: "saveVisual", format: "png", data: output, encoding: "base64", ...metadata, ...dimensions });
    } catch (error) {
      vscode.postMessage({ type: "exportError", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function drawDraggedNode() {
    dragFrame = undefined;
    if (!dragging) return;
    const point = positions.get(dragging.id);
    nodeElements.get(dragging.id)?.setAttribute("transform", `translate(${point.x},${point.y})`);
    for (const edge of graph.edges) {
      if (edge.source !== dragging.id && edge.target !== dragging.id) continue;
      const line = edgeElements.get(edge.id), value = geometry.edgeGeometry(edge, positions, sizes);
      if (line && value) for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
    }
    saveStateSoon();
  }
  svg.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && (event.target === svg || event.target === world)) {
      suppressClick = false; panning = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
      pointerNodeId = undefined;
      svg.setPointerCapture(event.pointerId);
    }
  });
  svg.addEventListener("pointermove", (event) => {
    if (dragging) {
      const current = screenToWorld(event.clientX, event.clientY), value = positions.get(dragging.id);
      if (Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) > 4) suppressClick = true;
      value.x += current.x - dragging.start.x; value.y += current.y - dragging.start.y; dragging.start = current;
      if (dragFrame === undefined) dragFrame = requestAnimationFrame(drawDraggedNode);
    } else if (panning) {
      if (Math.hypot(event.clientX - panning.x, event.clientY - panning.y) > 4) suppressClick = true;
      viewportCustomized = true; transform.x = panning.tx + event.clientX - panning.x; transform.y = panning.ty + event.clientY - panning.y; updateTransform();
    }
  });
  function finishPointer(event) {
    if (dragging) drawDraggedNode();
    dragging = undefined; panning = undefined;
    if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    saveState();
  }
  svg.addEventListener("pointerup", finishPointer);
  svg.addEventListener("pointercancel", finishPointer);
  svg.addEventListener("lostpointercapture", (event) => {
    // Renderer/frame transitions can drop capture while the button is still
    // held. Keep the gesture alive and reacquire on the stable SVG owner.
    if ((event.buttons & 1) && (dragging || panning)) {
      try { svg.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
    }
    finishPointer(event);
  });
  svg.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; return; }
    if (pointerNodeId) { const node = graph.nodes.find((item) => item.id === pointerNodeId); selectedId = pointerNodeId; showNode(node); render(direction.value !== "all"); return; }
    if (event.target === svg || event.target === world) { const traced = direction.value !== "all"; selectedId = undefined; direction.value = "all"; resetDetails(); updateDepthControl(); render(traced); }
  });
  svg.addEventListener("dblclick", (event) => {
    const node = graph?.nodes.find((item) => item.id === pointerNodeId);
    if (node && !suppressClick) { event.stopPropagation(); vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character }); }
  });
  svg.addEventListener("wheel", (event) => { event.preventDefault(); viewportCustomized = true; const rect = svg.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const next = Math.max(1e-12, Math.min(8, transform.k * Math.exp(Math.max(-20, Math.min(20, -event.deltaY * .001))))); transform.x = x - ((x - transform.x) / transform.k) * next; transform.y = y - ((y - transform.y) / transform.k) * next; transform.k = next; updateTransform(); }, { passive: false });
  search.addEventListener("input", () => render());
  layout.addEventListener("change", () => { calculateLayout(layout.value); render(); fit(); });
  direction.addEventListener("change", () => { updateDepthControl(); render(true); fit(); });
  for (const control of [depth, external, isolated]) control.addEventListener("change", () => { render(true); fit(); });
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("refresh").addEventListener("click", () => {
    const message = { type: "refresh" };
    if (isFunctionGraph()) message.depth = Number(depth.value) || 3;
    vscode.postMessage(message);
  });
  problemsButton.addEventListener("click", showProblems);
  document.getElementById("export").addEventListener("click", () => vscode.postMessage({ type: "export" }));
  window.addEventListener("resize", () => { if (viewportCustomized) updateTransform(); else fit(); });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("message", (event) => {
    if (event.data.type === "setGraph") {
      const incomingKey = JSON.stringify(event.data.graph.metadata);
      const sameGraph = graph && incomingKey === graphKey;
      graph = event.data.graph;
      graphKey = incomingKey;
      if (sameGraph) { render(); return; }
      positions = new Map(); sizes.clear(); selectedId = undefined;
      dragging = undefined; panning = undefined; pointerNodeId = undefined;
      viewportCustomized = false; transform = { x: 0, y: 0, k: 1 };
      resetDetails(); search.value = ""; direction.value = "all";
      external.checked = true; isolated.checked = true;
      const functionGraph = graph.metadata.graphType === "call-hierarchy";
      if (functionGraph && graph.metadata.analysisDepth) depth.value = String(graph.metadata.analysisDepth);
      const onlyWarnings = graph.problems.length > 0 && graph.problems.every((problem) => problem.severity === "warning");
      problemsButton.hidden = graph.problems.length === 0;
      problemsButton.textContent = `${onlyWarnings ? "Warnings" : "Notices"} (${graph.problems.length})`;
      direction.options[1].textContent = functionGraph ? "Callees" : "Dependencies";
      direction.options[2].textContent = functionGraph ? "Callers" : "Impact";
      search.placeholder = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "Search files…" : "Search symbols…";
      layout.value = functionGraph ? "hierarchical" : event.data.defaultLayout || "force";
      const restored = restoreState(event.data.viewState ?? initialState);
      updateDepthControl();
      render(!restored); restoreDetails();
      if (!restored || !viewportCustomized) requestAnimationFrame(() => { if (!viewportCustomized) fit(); });
    } else if (event.data.type === "requestExport") void exportVisual(event.data.format, event.data.scope, event.data.scale);
    else if (event.data.type === "showProblems") showProblems();
    else if (event.data.type === "restoreError") { summary.textContent = event.data.message; resetDetails(); }
  });
  vscode.postMessage({ type: "ready" });
})();
