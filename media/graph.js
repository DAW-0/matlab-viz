(() => {
  const vscode = acquireVsCodeApi();
  const svg = document.getElementById("graph");
  const summary = document.getElementById("summary");
  const details = document.getElementById("details");
  const main = document.getElementById("graph-main");
  const detailsResizer = document.getElementById("details-resizer");
  const search = document.getElementById("search");
  const layout = document.getElementById("layout");
  const grouping = document.getElementById("grouping");
  const groupingApi = globalThis.MatlabVizGrouping;
  let groupIndex = { groups: new Map(), membership: new Map() };
  let expandedGroups = new Set();
  let positionSets = new Map();
  // Isolation is a separate coordinate space. Dragging, grouping and changing
  // layout there must never overwrite the user's full-graph arrangement.
  let cyclePositionSets = new Map();
  let renderedData = { nodes: [], edges: [] };
  const cycleApi = globalThis.MatlabVizCycles;
  const cycleMode = document.getElementById("cycle-mode");
  const cycleComponent = document.getElementById("cycle-component");
  const cyclesButton = document.getElementById("cycles");
  let cycleIndex = { components: [], byId: new Map() };
  let cycleMarks = { components: [], nodes: new Set(), edges: new Set() };
  let cycleMemberPage = 0;
  let renderedCycleMode = "off";
  const direction = document.getElementById("direction");
  const depth = document.getElementById("depth");
  const depthLabel = document.getElementById("depth-label");
  const depthText = document.getElementById("depth-text");
  const external = document.getElementById("external");
  const isolated = document.getElementById("isolated");
  const problemsButton = document.getElementById("problems");
  const entryPointReportButton = document.getElementById("entry-point-report");
  const impactReportButton = document.getElementById("impact-report");
  const comparisonButton = document.getElementById("compare-analyses");
  let comparisonData;
  let comparisonRequestId = 0;
  let comparisonAction;
  let comparisonPending = false;
  let entryPointReport;
  let reportNodePage = 0;
  // One reversible view transaction, not another analyzed graph. The original
  // view is detached before relayout so drags here cannot mutate its points.
  let reportScope;
  const reportScopeStatus = document.getElementById("report-scope-status");
  const reportScopeText = document.getElementById("report-scope-text");
  const clearDependencyPathButton = document.getElementById("clear-dependency-path");
  let dependencyPath;
  let pathRequestId = 0;
  const tooltip = document.getElementById("tooltip");
  const analysisBanner = document.getElementById("analysis-status");
  const analysisBannerText = document.getElementById("analysis-status-text");
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
  let analysisStatus;
  const initialState = vscode.getState();

  // Width is a view preference, not graph data: retain it across Refresh/new
  // results, even when the graph key changes. A narrow window only clamps the
  // displayed width; it must not overwrite a user's wider-window preference.
  const DEFAULT_DETAILS_WIDTH = 280, MIN_DETAILS_WIDTH = 220, MAX_DETAILS_WIDTH = 960;
  const MIN_CANVAS_WIDTH = 240, SEPARATOR_WIDTH = 6, COMPACT_WIDTH = 800;
  let detailsWidth = DEFAULT_DETAILS_WIDTH;
  let resizingDetails;
  let swallowDetailsClick = false;
  let canvasResizeFrame;

  function restoreDetailsWidth(value) {
    if (value?.version === 1 && Number.isFinite(value.detailsWidth)) {
      detailsWidth = Math.round(Math.max(MIN_DETAILS_WIDTH, Math.min(MAX_DETAILS_WIDTH, value.detailsWidth)));
    }
  }

  function detailsWidthLimit() {
    return Math.max(MIN_DETAILS_WIDTH, Math.min(MAX_DETAILS_WIDTH, main.clientWidth - MIN_CANVAS_WIDTH - SEPARATOR_WIDTH));
  }

  function applyDetailsWidth() {
    const maximum = detailsWidthLimit(), displayed = Math.min(detailsWidth, maximum);
    main.style.setProperty("--details-width", `${displayed}px`);
    // Pixel values expose the same bounded range to assistive technology that
    // pointer and keyboard users see. CSS removes the separator in compact mode.
    detailsResizer.setAttribute("aria-valuemin", String(MIN_DETAILS_WIDTH));
    detailsResizer.setAttribute("aria-valuemax", String(maximum));
    detailsResizer.setAttribute("aria-valuenow", String(displayed));
    detailsResizer.setAttribute("aria-valuetext", `${displayed} pixels`);
  }

  function resizeCanvasSoon() {
    // A divider move changes the canvas without a window resize. Coalesce work
    // to one animation frame and keep custom pan/zoom unchanged. Fitted views
    // are refitted, but resizing never rebuilds nodes or changes trace selection.
    if (canvasResizeFrame !== undefined) return;
    canvasResizeFrame = requestAnimationFrame(() => {
      canvasResizeFrame = undefined;
      if (viewportCustomized) updateTransform(); else fit();
    });
  }

  function setDetailsWidth(value) {
    detailsWidth = Math.round(Math.max(MIN_DETAILS_WIDTH, Math.min(detailsWidthLimit(), value)));
    applyDetailsWidth(); resizeCanvasSoon(); saveStateSoon();
  }

  function finishDetailsResize(event) {
    // Ignore secondary pointers and capture-loss callbacks after release.
    if (!resizingDetails || resizingDetails.pointerId !== event.pointerId) return;
    event.stopPropagation?.();
    resizingDetails = undefined;
    swallowDetailsClick = event.type !== "pointercancel";
    main.setAttribute("data-resizing", "false");
    if (detailsResizer.hasPointerCapture(event.pointerId)) detailsResizer.releasePointerCapture(event.pointerId);
    saveStateSoon();
  }

  detailsResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || main.clientWidth <= COMPACT_WIDTH) return;
    event.stopPropagation();
    detailsResizer.focus();
    // Start from the displayed size, not an offscreen preferred width. This
    // prevents a jump when dragging after a large window has become narrower.
    resizingDetails = { pointerId: event.pointerId, x: event.clientX, width: Math.min(detailsWidth, detailsWidthLimit()) };
    main.setAttribute("data-resizing", "true");
    detailsResizer.setPointerCapture(event.pointerId);
  });
  function moveDetailsResize(event) {
    if (!resizingDetails || resizingDetails.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (event.buttons === 0) { finishDetailsResize(event); return; }
    // Moving the divider left makes this right-hand panel wider.
    setDetailsWidth(resizingDetails.width + resizingDetails.x - event.clientX);
  }
  detailsResizer.addEventListener("pointermove", moveDetailsResize);
  detailsResizer.addEventListener("pointerup", finishDetailsResize);
  detailsResizer.addEventListener("pointercancel", finishDetailsResize);
  // Native editor tests caught a renderer path where requested handle capture
  // was not retained, with no lostpointercapture event. Capture-phase document
  // listeners keep moves/releases working over the canvas in that case and
  // prevent the same gesture from reaching graph pan/selection handlers.
  document.addEventListener("pointermove", moveDetailsResize, true);
  document.addEventListener("pointerup", finishDetailsResize, true);
  document.addEventListener("pointercancel", finishDetailsResize, true);
  document.addEventListener("pointerdown", () => { swallowDetailsClick = false; }, true);
  document.addEventListener("click", (event) => {
    if (swallowDetailsClick) { swallowDetailsClick = false; event.stopPropagation(); event.preventDefault(); }
  }, true);
  window.addEventListener("blur", () => { if (resizingDetails) finishDetailsResize(resizingDetails); });
  detailsResizer.addEventListener("lostpointercapture", (event) => {
    if (resizingDetails?.pointerId === event.pointerId && (event.buttons & 1)) {
      try { detailsResizer.setPointerCapture(event.pointerId); return; } catch { /* Pointer is no longer active. */ }
    }
    finishDetailsResize(event);
  });
  detailsResizer.addEventListener("keydown", (event) => {
    if (main.clientWidth <= COMPACT_WIDTH) return;
    const displayed = Math.min(detailsWidth, detailsWidthLimit()), step = event.shiftKey ? 50 : 10;
    let next;
    if (event.key === "ArrowLeft") next = displayed + step;
    else if (event.key === "ArrowRight") next = displayed - step;
    else if (event.key === "Home") next = MIN_DETAILS_WIDTH;
    else if (event.key === "End") next = detailsWidthLimit();
    else if (event.key === "Enter") next = DEFAULT_DETAILS_WIDTH;
    else return;
    event.preventDefault(); event.stopPropagation(); setDetailsWidth(next);
  });
  detailsResizer.addEventListener("dblclick", () => setDetailsWidth(DEFAULT_DETAILS_WIDTH));
  restoreDetailsWidth(initialState); applyDetailsWidth();
  // Sidebar toggles, toolbar wrapping, and detached-window moves can resize the
  // canvas without a window event. Observe only the canvas to avoid feedback
  // from graph drawing; no DOM sizes are changed by the observer callback.
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resizeCanvasSoon).observe(document.getElementById("canvas-wrap"));

  function captureViewState() {
    return {
      version: 1, geometryVersion: 1, graphKey,
      controls: { search: search.value, layout: layout.value, grouping: grouping.value || "none", direction: direction.value,
        cycleMode: cycleMode.value || "off", cycleComponent: cycleComponent.value || "all",
        depth: Number(depth.value), external: external.checked, isolated: isolated.checked },
      cycleMemberPage,
      selectedId, detailSelection, positions: [...positions], expandedGroups: [...expandedGroups],
      groupPositions: [...positionSets].map(([mode, points]) => [mode, [...points]]),
      cyclePositionVersion: 1,
      cyclePositions: [...cyclePositionSets].map(([mode, points]) => [mode, [...points]]),
      transform: { ...transform }, viewportCustomized, detailsWidth, analysisStatus
    };
  }

  function saveState() {
    if (!graph) return;
    // Save the seed and ONE ordinary-view backup. Membership is recomputed
    // from original links on restore, never trusted from serialized IDs.
    vscode.setState({ ...captureViewState(), reportScope: reportScope
      ? { seedId: reportScope.seedId, previousView: reportScope.previousView,
        ...(reportScope.mode === "impact" ? { mode: "impact" } : {}),
        pathTargetId: reportScope.pathTargetId } : undefined });
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
    analysisStatus = validAnalysisStatus(value.analysisStatus);
    const controls = value.controls || {};
    if (typeof controls.search === "string") search.value = controls.search;
    if (["force", "hierarchical", "circle", "grid"].includes(controls.layout)) layout.value = controls.layout;
    grouping.value = ["folder", "package"].includes(controls.grouping) ? controls.grouping : "none";
    rebuildGroups();
    expandedGroups = new Set(Array.isArray(value.expandedGroups) ? value.expandedGroups.filter((id) => groupIndex.groups.has(id)) : []);
    if (["all", "dependencies", "impact"].includes(controls.direction)) direction.value = controls.direction;
    if (Number.isInteger(controls.depth) && controls.depth >= 1 && controls.depth <= 20) depth.value = String(controls.depth);
    if (typeof controls.external === "boolean") external.checked = controls.external;
    if (typeof controls.isolated === "boolean") isolated.checked = controls.isolated;
    const validComponent = controls.cycleComponent === "all" || cycleIndex.byId.has(controls.cycleComponent);
    cycleComponent.value = validComponent ? controls.cycleComponent : "all";
    cycleMode.value = validComponent && cycleIndex.components.length && ["highlight", "isolate"].includes(controls.cycleMode) ? controls.cycleMode : "off";
    cycleMemberPage = Number.isInteger(value.cycleMemberPage) && value.cycleMemberPage >= 0 ? value.cycleMemberPage : 0;
    refreshCycleMarks();
    if (cycleMode.value === "isolate") {
      direction.value = "all";
      for (const id of cycleMarks.nodes) { const owner = groupIndex.membership.get(id); if (owner) expandedGroups.add(owner); }
    }
    selectPositionMap();
    const ids = new Set([...graph.nodes.map((node) => node.id), ...groupIndex.groups.keys()]);
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
    // Each grouping mode owns positions, so toggling grouping does not discard
    // the manually arranged ungrouped graph. Validate stored coordinates/IDs.
    if (value.geometryVersion === 1 && Array.isArray(value.groupPositions)) {
      for (const entry of value.groupPositions) {
        if (!Array.isArray(entry) || !["none", "folder", "package"].includes(entry[0]) || !Array.isArray(entry[1])) continue;
        const valid = new Set([...graph.nodes.map((node) => node.id), ...groupingApi.index(graph, entry[0]).groups.keys()]);
        positionSets.set(entry[0], new Map(entry[1].filter((point) => Array.isArray(point) && valid.has(point[0])
          && point[1] && Number.isFinite(point[1].x) && Number.isFinite(point[1].y))));
      }
    }
    if (value.geometryVersion === 1 && Array.isArray(value.cyclePositions)) {
      for (const entry of value.cyclePositions) {
        if (!Array.isArray(entry) || !["none", "folder", "package"].includes(entry[0]) || !Array.isArray(entry[1])) continue;
        const valid = new Set([...graph.nodes.map((node) => node.id), ...groupingApi.index(graph, entry[0]).groups.keys()]);
        cyclePositionSets.set(entry[0], new Map(entry[1].filter((point) => Array.isArray(point) && valid.has(point[0])
          && point[1] && Number.isFinite(point[1].x) && Number.isFinite(point[1].y))));
      }
    }
    const bank = cycleMode.value === "isolate" ? cyclePositionSets : positionSets;
    bank.set(grouping.value, positions);
    // Older isolated states stored overview-scale coordinates. Migrate them
    // once, while preserving those coordinates as the best available overview.
    const migrateIsolation = cycleMode.value === "isolate" && value.cyclePositionVersion !== 1;
    if (migrateIsolation) {
      if (!positionSets.has(grouping.value)) positionSets.set(grouping.value, new Map([...positions].map(([id, point]) => [id, { ...point }])));
      positions.clear();
    }
    const view = value.transform;
    if (value.geometryVersion === 1 && view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.k) && view.k > 0 && view.k <= 1e6) {
      transform = { x: view.x, y: view.y, k: view.k };
      viewportCustomized = !migrateIsolation && value.viewportCustomized === true;
    }
    const selection = value.detailSelection;
    const scope = value.reportScope;
    if (scope && (scope.mode === undefined || scope.mode === "impact") && reportAvailable(scope.seedId) && scope.previousView?.version === 1
      && scope.previousView.graphKey === graphKey && !scope.previousView.reportScope
      && ["all", "dependencies", "impact"].includes(scope.previousView.controls?.direction)) {
      reportScope = { seedId: scope.seedId, previousView: scope.previousView,
        ...(scope.mode === "impact" ? { mode: "impact" } : {}),
        nodeIds: trace(scope.seedId, scope.mode === "impact" ? "impact" : "dependencies", Infinity) };
      // Persist only the target identity. The host reconstructs route evidence
      // from the current original graph when the editor is restored.
      if (reportScope.nodeIds.has(scope.pathTargetId)) reportScope.pathTargetId = scope.pathTargetId;
      direction.value = "report";
    }
    if (selection && ((selection.kind === "node" && ids.has(selection.id))
      || (selection.kind === "edge" && currentGraph().edges.some((edge) => edge.id === selection.id))
      || (selection.kind === "group" && groupIndex.groups.has(selection.id))
      || (selection.kind === "entryPointReport" && (selection.mode === undefined || selection.mode === "impact") && graph.nodes.some(node => node.id === selection.id && !node.unresolved))
      || (selection.kind === "dependencyPath" && reportScope?.nodeIds.has(selection.id))
      || (selection.kind === "comparison" && (selection.scope === undefined || selection.scope === "all"
        || ["dependencies", "impact"].includes(selection.scope) && reportAvailable(selection.id)))
      || selection.kind === "cycles" || selection.kind === "groups" || selection.kind === "problems")) detailSelection = selection;
    return true;
  }

  function validAnalysisStatus(value) {
    return value && ["failed", "cancelled"].includes(value.kind) && typeof value.message === "string"
      && typeof value.occurredAt === "string" ? { kind: value.kind, message: value.message, occurredAt: value.occurredAt } : undefined;
  }

  function showAnalysisStatus(value) {
    analysisStatus = validAnalysisStatus(value);
    analysisBanner.hidden = !analysisStatus;
    // textContent keeps MATLAB errors and source paths as plain text, even if
    // their contents resemble markup. A failed attempt never changes graphKey.
    analysisBannerText.textContent = analysisStatus
      ? `Latest analysis ${analysisStatus.kind}. Showing the previous graph (generated ${graph.metadata.generatedAt || "time not recorded"}). ${analysisStatus.message}` : "";
    saveStateSoon();
  }

  function graphTerms() {
    if (graph.metadata.graphType === "call-hierarchy") return { items: "symbols", edges: "calls", heading: "Function call", outgoing: ["callee", "callees"], incoming: ["caller", "callers"], forward: "Callees", backward: "Callers" };
    if (graph.metadata.graphType === "references") return { items: "symbols", edges: "reference links", heading: "Symbol reference", outgoing: ["referenced symbol", "referenced symbols"], incoming: ["referencing container", "referencing containers"], forward: "Referenced symbols", backward: "Referencing containers" };
    return { items: "files", edges: "dependencies", heading: "File dependency", outgoing: ["dependency", "dependencies"], incoming: ["impacted file", "impacted files"], forward: "Dependencies", backward: "Impact" };
  }

  function updateExternalPolicy() {
    const policy = graph.metadata.analysisIncludeExternal;
    const label = document.getElementById("external-policy");
    label.textContent = `Analysis externals: ${policy === true ? "enabled" : policy === false ? "disabled" : "not recorded (Refresh to record)"}`;
    const boundary = graphTerms().items === "files" ? "the selected root" : "the open workspace folders";
    label.title = `External means outside ${boundary}. This is the policy used for the displayed result, not the current setting. Change External analysis settings, then Refresh. Enabled does not guarantee that every external dependency can be resolved.`;
  }

  function restoreDetails() {
    if (detailSelection?.kind === "node") showNode(graph.nodes.find((node) => node.id === detailSelection.id));
    else if (detailSelection?.kind === "edge") {
      const edge = renderedData.edges.find((edge) => edge.id === detailSelection.id) || graph.edges.find((edge) => edge.id === detailSelection.id);
      if (edge) showEdge(edge); else resetDetails();
    }
    else if (detailSelection?.kind === "problems") showProblems();
    else if (detailSelection?.kind === "group") showGroup(groupIndex.groups.get(detailSelection.id));
    else if (detailSelection?.kind === "groups") showGroups();
    else if (detailSelection?.kind === "cycles") showCycles();
    else if (detailSelection?.kind === "entryPointReport") requestEntryPointReport(detailSelection.id, detailSelection.mode);
    else if (detailSelection?.kind === "dependencyPath") {
      if (dependencyPath?.targetId === detailSelection.id) showDependencyPath();
      else showPendingDependencyPath();
    }
    else if (detailSelection?.kind === "comparison") requestComparison(detailSelection.scope ? "compare" : "info", detailSelection.scope);
  }

  function element(name, attributes = {}) {
    const value = document.createElementNS(NS, name);
    for (const [key, item] of Object.entries(attributes)) value.setAttribute(key, String(item));
    return value;
  }

  function nodeSize(node) {
    const label = node.relativePath || node.label;
    if (!sizes.has(node.id) || sizes.get(node.id).label !== label) sizes.set(node.id, { ...geometry.labelBox(label,
      labelContext ? (value) => labelContext.measureText(value).width : undefined), label });
    return sizes.get(node.id);
  }

  function currentGraph() {
    if (!graph) return { nodes: [], edges: [] };
    const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    let allowed = reportScope ? reportScope.nodeIds : new Set(graph.nodes
      .filter((node) => external.checked || !node.external)
      .filter((node) => isolated.checked || (degree.get(node.id) || 0) > 0)
      .map((node) => node.id));
    if (!reportScope && selectedId && direction.value !== "all") {
      const traced = trace(selectedId, direction.value, Number(depth.value) || 3);
      allowed = new Set([...allowed].filter((id) => traced.has(id)));
    }
    if (!reportScope && cycleMode.value === "isolate") allowed = new Set([...allowed].filter((id) => cycleMarks.nodes.has(id)));
    const data = {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)
        && (reportScope || cycleMode.value !== "isolate" || cycleMarks.edges.has(edge.id)))
    };
    return groupingApi.project(data, groupIndex, expandedGroups, graphTerms().items);
  }

  function rebuildCycles() {
    // Always analyze the unprojected result. Group A -> B -> A can be drawn
    // from unrelated A1 -> B1 and B2 -> A2 edges without ANY original cycle.
    cycleIndex = cycleApi.analyze(graph);
    cycleComponent.replaceChildren();
    const all = document.createElement("option"); all.value = "all"; all.textContent = "All cyclic components"; cycleComponent.appendChild(all);
    cycleIndex.components.forEach((component, index) => {
      const option = document.createElement("option"); option.value = component.id;
      option.textContent = `Component ${index + 1} (${component.nodes.length} ${graphTerms().items})`;
      option.title = component.nodes[0].relativePath || component.nodes[0].label; cycleComponent.appendChild(option);
    });
    cycleComponent.value = "all"; cycleMode.value = "off"; cycleMemberPage = 0;
    cyclesButton.textContent = `Cycles (${cycleIndex.components.length})`;
    cycleComponent.disabled = cycleMode.disabled = cycleIndex.components.length === 0;
    refreshCycleMarks();
  }

  function refreshCycleMarks() {
    cycleMarks = cycleApi.selection(cycleIndex, cycleComponent.value || "all");
    const count = cycleMarks.components.length === 1 ? cycleMarks.components[0].nodes.length : 0;
    cycleMemberPage = Math.max(0, Math.min(cycleMemberPage, Math.max(0, Math.ceil(count / 100) - 1)));
  }

  function cyclicNode(node) {
    return cycleMode.value !== "off" && (node.members ? node.members.some((member) => cycleMarks.nodes.has(member.id)) : cycleMarks.nodes.has(node.id));
  }

  function cyclicEdgeCount(edge) {
    if (cycleMode.value === "off") return 0;
    return edge.originalEdges ? edge.originalEdges.filter((original) => cycleMarks.edges.has(original.id)).length : Number(cycleMarks.edges.has(edge.id));
  }

  function applyCycleView() {
    // The complete report scope must not be silently intersected with cycles.
    if (reportScope) { updateDepthControl(); return; }
    const wasIsolated = renderedCycleMode === "isolate";
    refreshCycleMarks();
    selectPositionMap();
    if (cycleMode.value === "isolate") {
      // Isolation is an independent view, not a trace seeded at an arbitrary
      // selection. Reveal its ORIGINAL members rather than hiding every loop
      // inside summary nodes. Visibility filters remain explicit and respected.
      direction.value = "all";
      const expanded = new Set(expandedGroups);
      for (const id of cycleMarks.nodes) { const owner = groupIndex.membership.get(id); if (owner) expanded.add(owner); }
      setExpandedGroups(expanded);
      render(true);
    } else {
      if (wasIsolated) {
        // Isolation can reveal previously collapsed members. Give only those
        // new overview nodes local slots near their old group anchor; a missing
        // coordinate must not trigger a global layout of already arranged nodes.
        const data = currentGraph(); data.nodes.forEach(nodeSize);
        const fixed = data.nodes.filter((node) => positions.has(node.id)), missing = new Map();
        for (const node of data.nodes) if (!positions.has(node.id)) {
          const owner = groupIndex.membership.get(node.id);
          if (!missing.has(owner)) missing.set(owner, []);
          missing.get(owner).push(node);
        }
        if (fixed.length || positions.size) for (const [owner, nodes] of missing) {
          geometry.placeCluster(nodes, positions.get(owner) || centerOf(fixed), fixed, positions, sizes);
          fixed.push(...nodes);
        }
      }
      render();
    }
    pointerNodeId = undefined; updateDepthControl();
    if (cycleMode.value === "isolate" || wasIsolated) fit();
    else if (cycleMode.value === "highlight" && cycleComponent.value !== "all") {
      const data = currentGraph(), nodes = data.nodes.filter(cyclicNode), ids = new Set(nodes.map((node) => node.id));
      if (nodes.length) {
        const edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && cyclicEdgeCount(edge));
        const rect = svg.getBoundingClientRect();
        transform = geometry.fit(geometry.bounds({ nodes, edges }, positions, sizes), rect.width, rect.height);
        viewportCustomized = true; updateTransform();
      }
    }
    showCycles();
  }

  function selectPositionMap() {
    const bank = cycleMode.value === "isolate" ? cyclePositionSets : positionSets;
    positions = bank.get(grouping.value) || new Map();
    bank.set(grouping.value, positions);
  }

  function showCycles() {
    detailSelection = { kind: "cycles" }; details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = `Cyclic components (${cycleIndex.components.length})`; details.appendChild(heading);
    const explanation = document.createElement("p"); explanation.textContent = "Computed from original analyzed links, never grouped arrows. A component can contain several loops; the example is one actual directed loop. Missing dependencies or analysis limits can omit cycles. Reference-graph cycles do not prove runtime recursion."; details.appendChild(explanation);
    if (!cycleIndex.components.length) {
      const empty = document.createElement("p"); empty.textContent = "No directed cycles found in the loaded analysis. This is not proof that the complete repository is acyclic."; details.appendChild(empty); saveStateSoon(); return;
    }
    const original = currentGraph().original, visible = new Set(original.nodes.map((node) => node.id));
    const visibleEdges = new Set(original.edges.map((edge) => edge.id));
    const status = document.createElement("p"); status.textContent = `${[...cycleMarks.nodes].filter((id) => visible.has(id)).length}/${cycleMarks.nodes.size} selected component members and ${[...cycleMarks.edges].filter((id) => visibleEdges.has(id)).length}/${cycleMarks.edges.size} internal links currently visible. Filters/tracing may hide part of a loop; highlighting never implies a complete visible loop.`; details.appendChild(status);
    const button = (label, action) => { const value = document.createElement("button"); value.textContent = label; value.addEventListener("click", action); details.appendChild(value); return value; };
    button("Highlight selection", () => { cycleMode.value = "highlight"; applyCycleView(); });
    button("Isolate selection", () => { cycleMode.value = "isolate"; applyCycleView(); });
    button("Turn cycle view off", () => { cycleMode.value = "off"; applyCycleView(); });
    if (cycleMarks.components.length !== 1) {
      for (const component of cycleIndex.components.slice(0, 50)) {
        const number = cycleIndex.components.indexOf(component) + 1;
        button(`Component ${number}: ${component.nodes.length} ${graphTerms().items}, ${component.edges.length} internal links`, () => {
          cycleComponent.value = component.id; cycleMemberPage = 0;
          if (cycleMode.value === "off") cycleMode.value = "highlight"; applyCycleView();
        });
      }
      if (cycleIndex.components.length > 50) {
        const more = document.createElement("p"); more.textContent = "First 50 components listed here; use the toolbar selector to inspect any component."; details.appendChild(more);
      }
    } else {
      const component = cycleMarks.components[0];
      const info = document.createElement("p"); info.textContent = `${component.nodes.length} ${graphTerms().items}; ${component.edges.length} internal ${graphTerms().edges}; ${component.selfLinks} self-links${isFunctionGraph() && component.selfLinks ? " (direct recursion)" : ""}.`; details.appendChild(info);
      const byId = new Map(component.nodes.map((node) => [node.id, node]));
      const path = component.witness.nodes, example = document.createElement("p");
      example.textContent = `Example directed loop${path.length > 51 ? " (first 50 nodes; truncated)" : ""}: ${path.slice(0, path.length > 51 ? 50 : 51).map((id) => byId.get(id)?.relativePath || byId.get(id)?.label || id).join(" → ")}`;
      details.appendChild(example);
      const page = document.createElement("p"); page.textContent = `Members ${cycleMemberPage * 100 + 1}–${Math.min(component.nodes.length, (cycleMemberPage + 1) * 100)} of ${component.nodes.length}. Source navigation does not execute MATLAB.`; details.appendChild(page);
      if (cycleMemberPage > 0) button("Previous 100 members", () => { cycleMemberPage--; showCycles(); });
      for (const node of component.nodes.slice(cycleMemberPage * 100, (cycleMemberPage + 1) * 100)) {
        const open = button(`${node.unresolved ? "Unresolved" : "Open"}: ${node.relativePath || node.label}`, () => openNode(node));
        open.disabled = Boolean(node.unresolved);
      }
      if ((cycleMemberPage + 1) * 100 < component.nodes.length) button("Next 100 members", () => { cycleMemberPage++; showCycles(); });
    }
    const exports = document.createElement("p"); exports.textContent = "SVG/PNG export the current highlighted/isolated view. JSON/DOT/CSV retain the complete original analysis, not this selection."; details.appendChild(exports);
    button("Export graph…", () => vscode.postMessage({ type: "export" }));
    saveStateSoon();
  }

  function rebuildGroups() {
    groupIndex = groupingApi.index(graph, grouping.value);
    for (const id of ["groups", "collapse-groups", "expand-groups"]) document.getElementById(id).disabled = !groupIndex.groups.size;
  }

  function isSelected(id) {
    if (!selectedId) return false;
    if (id === selectedId) return true;
    const owner = groupIndex.membership.get(selectedId);
    if (owner === id && !expandedGroups.has(id)) return true;
    return groupIndex.membership.get(id) === selectedId;
  }

  function findNode(id) {
    return renderedData.nodes.find((node) => node.id === id) || graph.nodes.find((node) => node.id === id)
      || groupIndex.groups.get(id);
  }

  function openNode(node) {
    if (groupIndex.groups.has(node.id)) toggleGroup(node.id);
    else if (node.unresolved) showNode(node);
    else vscode.postMessage({ type: "openFile", path: node.path, line: node.line, character: node.character });
  }

  function toggleGroup(id) {
    if (!groupIndex.groups.has(id)) return;
    const next = new Set(expandedGroups), expanding = !next.has(id);
    if (expanding) next.add(id); else next.delete(id);
    setExpandedGroups(next);
    // An isolated cluster has no arrows to lead the eye to its members. Focus
    // the revealed block, not the entire repository; other world positions stay
    // untouched. Collapse restores its summary anchor and only pans if needed
    // to keep that summary visible, without zooming further in.
    focusGroup(id, !expanding);
  }

  function centerOf(nodes, fallback = { x: 0, y: 0 }) {
    const known = nodes.filter((node) => positions.has(node.id));
    if (!known.length) return { ...fallback };
    known.forEach(nodeSize);
    const box = geometry.bounds({ nodes: known, edges: [] }, positions, sizes, 0);
    return { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
  }

  function setExpandedGroups(next) {
    // Repeated bulk actions must be true no-ops: no Force iterations, Fit,
    // viewport resets or DOM replacement when the expansion set is unchanged.
    if (next.size === expandedGroups.size && [...next].every((id) => expandedGroups.has(id))) return false;
    const before = renderedData, oldIds = new Set(before.nodes.map((node) => node.id));
    expandedGroups = next;
    const after = currentGraph(); after.nodes.forEach(nodeSize);
    const fixed = after.nodes.filter((node) => oldIds.has(node.id) && positions.has(node.id));
    // Retain each summary's last position so expand/collapse cycles cannot
    // spread the overview over time. Older saved views without hidden anchors
    // fall back to the members' current center.
    for (const node of after.nodes.filter((node) => node.group && !oldIds.has(node.id))) {
      const members = before.nodes.filter((member) => groupIndex.membership.get(member.id) === node.id);
      geometry.placeCluster([node], positions.get(node.id) || centerOf(members), fixed, positions, sizes);
      fixed.push(node);
    }
    for (const id of next) {
      const members = after.nodes.filter((node) => !oldIds.has(node.id) && groupIndex.membership.get(node.id) === id);
      if (!members.length) continue;
      geometry.placeCluster(members, { ...(positions.get(id) || centerOf(members)) }, fixed, positions, sizes);
      fixed.push(...members);
    }
    pointerNodeId = undefined; hideTooltip(); render(); restoreDetails();
    return true;
  }

  function focusGroup(id, onlyIfOutside = false) {
    const data = currentGraph(), nodes = data.nodes.filter((node) => node.id === id || groupIndex.membership.get(node.id) === id);
    if (!nodes.length) return;
    const ids = new Set(nodes.map((node) => node.id));
    const edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const rect = svg.getBoundingClientRect();
    const box = geometry.bounds({ nodes, edges }, positions, sizes);
    if (onlyIfOutside && box.minX * transform.k + transform.x >= 0 && box.minY * transform.k + transform.y >= 0
      && (box.minX + box.width) * transform.k + transform.x <= rect.width
      && (box.minY + box.height) * transform.k + transform.y <= rect.height) return;
    const focused = geometry.fit(box, rect.width, rect.height);
    if (onlyIfOutside) {
      focused.k = Math.min(focused.k, transform.k);
      focused.x = rect.width / 2 - (box.minX + box.width / 2) * focused.k;
      focused.y = rect.height / 2 - (box.minY + box.height / 2) * focused.k;
    }
    transform = focused;
    viewportCustomized = true; updateTransform();
  }

  function showGroups() {
    detailSelection = { kind: "groups" }; details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = `Groups (${groupIndex.groups.size})`; details.appendChild(heading);
    const explanation = document.createElement("p"); explanation.textContent = "One group per leaf folder or innermost MATLAB package. Non-package code uses folders. Expanding reveals the original nodes; grouping does not change the analysis."; details.appendChild(explanation);
    for (const group of [...groupIndex.groups.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      const button = document.createElement("button"); button.textContent = `${expandedGroups.has(group.id) ? "Collapse" : "Expand"}: ${group.label} (${group.members.length} ${graphTerms().items})`;
      button.setAttribute("aria-expanded", String(expandedGroups.has(group.id)));
      button.addEventListener("click", () => toggleGroup(group.id)); details.appendChild(button);
    }
    saveStateSoon();
  }

  function showGroup(group) {
    if (!group) return;
    detailSelection = { kind: "group", id: group.id }; details.replaceChildren();
    const data = currentGraph(), visible = new Set((data.original || data).nodes.map((node) => node.id));
    const members = group.members.filter((node) => visible.has(node.id)), ids = new Set(members.map((node) => node.id));
    const internal = (data.original || data).edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).length;
    const heading = document.createElement("h2"); heading.textContent = group.label; details.appendChild(heading);
    const text = document.createElement("p"); text.textContent = `${group.type} group: ${members.length}/${group.members.length} ${graphTerms().items} currently included; ${internal} internal ${graphTerms().edges}. Tracing this group starts at every member and follows original links. Search only highlights; data exports remain ungrouped.`; details.appendChild(text);
    const flags = document.createElement("p"); flags.textContent = `${members.filter((node) => node.external).length} external; ${members.filter((node) => node.missing).length} missing. Location: ${group.location}`; details.appendChild(flags);
    const button = document.createElement("button"); button.textContent = expandedGroups.has(group.id) ? "Collapse group" : "Expand group";
    button.setAttribute("aria-expanded", String(expandedGroups.has(group.id)));
    button.addEventListener("click", () => toggleGroup(group.id)); details.appendChild(button);
    for (const node of members) {
      const inspect = document.createElement("button"); inspect.textContent = `Inspect: ${node.relativePath || node.label}`;
      inspect.addEventListener("click", () => {
        selectedId = node.id;
        if (!setExpandedGroups(new Set([...expandedGroups, group.id]))) render();
        pointerNodeId = undefined; focusGroup(group.id); showNode(node);
      }); details.appendChild(inspect);
    }
    saveStateSoon();
  }

  function placeCount(label, edge) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    if (a && b) { const point = geometry.linkCountPoint(edge, positions, sizes); label.setAttribute("x", point.x); label.setAttribute("y", point.y); }
  }

  function trace(start, mode, maximumDepth) {
    const adjacency = new Map();
    const originalIds = new Set(graph.nodes.map(node => node.id));
    for (const edge of graph.edges) {
      // An absent endpoint is incomplete evidence, not a traversable bridge.
      // This matches host reports and prevents a malformed/dangling link from
      // pulling unrelated files into a dependency or impact scope.
      if (!originalIds.has(edge.source) || !originalIds.has(edge.target)) continue;
      const from = mode === "dependencies" ? edge.source : edge.target;
      const to = mode === "dependencies" ? edge.target : edge.source;
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push(to);
    }
    // Trace the original relationships, not aggregate links: crossing a
    // collapsed cluster must not shortcut multiple file-level dependency hops.
    const seeds = groupIndex.groups.get(start)?.members.map((node) => node.id) || [start];
    const found = new Set(seeds);
    const queue = seeds.map((id) => ({ id, depth: 0 }));
    for (let head = 0; head < queue.length; head++) {
      const item = queue[head];
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
    if (reportScope) {
      direction.value = "report"; cycleMode.value = "off";
      external.checked = true; isolated.checked = true;
    }
    reportScopeStatus.hidden = !reportScope;
    clearDependencyPathButton.hidden = !reportScope?.pathTargetId;
    clearDependencyPathButton.textContent = `Clear ${pathLabel()}`;
    const seed = reportScope && graph.nodes.find(node => node.id === reportScope.seedId);
    reportScopeText.textContent = seed ? `${scopeIsImpact() ? "Impact report scope" : "Report scope"}: ${seed.relativePath || seed.label} — all analyzed ${scopeIsImpact() ? "incoming dependents; original arrow directions preserved" : "outgoing dependencies"}. Display filters are paused.${dependencyPath ? ` One ${dependencyPath.hops}-link route highlighted.` : ""}` : "";
    grouping.disabled = external.disabled = isolated.disabled = cyclesButton.disabled = Boolean(reportScope);
    cycleMode.disabled = cycleComponent.disabled = Boolean(reportScope) || cycleIndex.components.length === 0;
    direction.disabled = Boolean(reportScope) || cycleMode.value === "isolate";
    direction.title = reportScope ? "Showing the complete analyzed report scope. Return to previous view to use ordinary tracing."
      : cycleMode.value === "isolate" ? "Cycle isolation selects component members. Switch to Highlight cycles or Cycles Off to use ordinary tracing." : "Trace original relationships from the selected node or group.";
    depthText.textContent = functionGraph ? "Analysis depth" : "Trace depth";
    depth.disabled = Boolean(reportScope) || !functionGraph && (direction.value === "all" || cycleMode.value === "isolate");
    depthLabel.title = reportScope ? `Report scope includes all analyzed ${scopeIsImpact() ? "dependent" : "dependency"} hops, without a display-depth limit. Return to previous view to use ordinary filters.`
      : functionGraph
      ? "Maximum caller/callee analysis depth. Refresh rebuilds the hierarchy to this depth."
      : cycleMode.value === "isolate" ? "Cycle isolation includes component members independently of trace depth. Switch to Highlight cycles or Cycles Off to trace."
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

  function reportAvailable(id) {
    return graph && (!graph.metadata.graphType || graph.metadata.graphType === "files")
      && graph.nodes.some(node => node.id === id && !node.unresolved);
  }

  function requestComparison(action, scope = detailSelection?.scope) {
    if (!graph || detailSelection?.kind !== "comparison") return;
    comparisonRequestId++; comparisonAction = action; comparisonPending = true;
    if (action === "compare") detailSelection.scope = scope || "all";
    showComparison(); saveStateSoon();
    vscode.postMessage({ type: "comparisonAction", graphKey, requestId: comparisonRequestId, action,
      scope, nodeId: detailSelection.id });
  }

  function showComparison() {
    details.replaceChildren();
    const text = (tag, value, parent = details) => { const item = document.createElement(tag); item.textContent = value; parent.appendChild(item); return item; };
    const button = (label, action) => { const item = text("button", label); item.disabled = comparisonPending; item.addEventListener("click", action); return item; };
    text("h2", "Analysis comparison");
    text("p", "Compare complete original file analysis evidence, independently of graph filters. Saving a baseline or comparing does not run MATLAB or change the graph.");
    text("p", "After editing code, Refresh the analysis before comparing. This compares saved analysis evidence, not live file contents.");
    if (comparisonPending) text("p", "Working on baseline/comparison…");
    if (comparisonData?.error) text("p", `${comparisonData.result ? "Previous comparison retained; latest operation failed. " : ""}${comparisonData.error}`);
    text("p", comparisonData?.baselinePath ? `Baseline file: ${comparisonData.baselinePath}` : "No baseline selected. Save the current complete analysis or load a previously saved baseline.");
    button("Save current analysis as baseline", () => requestComparison("save"));
    button("Load analysis baseline", () => requestComparison("load"));
    button("Clear baseline selection (keep file)", () => requestComparison("clear")).disabled ||= !comparisonData?.baselinePath;
    button("Compare entire analysis", () => requestComparison("compare", "all")).disabled ||= !comparisonData?.baselinePath;
    const selected = graph.nodes.find(node => node.id === detailSelection?.id && !node.unresolved);
    text("p", selected ? `Selected for scope comparison: ${selected.relativePath || selected.path}` : "Select an original file node, then reopen Compare analyses to compare its dependency or impact scope.");
    for (const [mode, label] of [["dependencies", "Compare selected dependency scope"], ["impact", "Compare selected impact scope"]]) {
      button(label, () => requestComparison("compare", mode)).disabled ||= !selected || !comparisonData?.baselinePath;
    }
    const result = comparisonData?.result, report = result?.report;
    if (!report) return;
    text("p", `Baseline analysis: ${report.baseline.analysis.generatedAt}; baseline saved: ${report.baseline.savedAt}. Current analysis: ${report.current.generatedAt}.`);
    text("p", "Recorded evidence differences only—not a source-content diff, runtime test, or regression verdict. Unchanged metadata does not mean unchanged code.");
    for (const format of ["md", "json"]) button(`Export comparison (${format === "md" ? "Markdown" : "JSON"})`, () => {
      comparisonRequestId++; comparisonAction = "export"; comparisonPending = true; showComparison();
      vscode.postMessage({ type: "comparisonAction", graphKey, requestId: comparisonRequestId, action: "export", comparisonId: result.id, format });
    });
    const coverage = text("details", ""); coverage.open = true;
    text("summary", `Recorded coverage differences (${report.coverageDifferences.length})`, coverage);
    if (!report.coverageDifferences.length) text("p", "No recorded field differences. Other options, path state and exclusions may still differ.", coverage);
    for (const item of report.coverageDifferences) text("p", `${item.field}: ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)}`, coverage);
    const limits = text("details", ""); text("summary", "Coverage and interpretation limits", limits);
    for (const item of report.limitations) text("p", item, limits);
    const list = (title, items, describe) => {
      const section = text("details", ""); text("summary", `${title} (${items.length})`, section);
      for (const item of items.slice(0, 100)) text("p", describe(item), section);
      if (items.length > 100) text("p", "First 100 shown; both comparison exports retain every record.", section);
    };
    const delta = (title, value) => {
      text("h3", title);
      text("p", `Nodes: ${value.nodes.added.length} added · ${value.nodes.removed.length} removed · ${value.nodes.changed.length} metadata changed · ${value.nodes.unchanged} unchanged metadata.`);
      text("p", `Relationships: ${value.links.added.length} added · ${value.links.removed.length} removed · ${value.links.changed.length} evidence changed · ${value.links.unchanged} unchanged.`);
      list("Added nodes", value.nodes.added, node => `${node.path}${node.unresolved ? " (unresolved name)" : ""}`);
      list("Removed nodes", value.nodes.removed, node => `${node.path}${node.unresolved ? " (unresolved name)" : ""}`);
      list("Node metadata changes", value.nodes.changed, item => `${item.after.path}: ${item.fields.join(", ")}. Before: ${JSON.stringify(item.before)}; after: ${JSON.stringify(item.after)}`);
      const link = item => `${item.source} → ${item.target} (${item.kind}): ${JSON.stringify(item.records)}`;
      list("Added relationships", value.links.added, link); list("Removed relationships", value.links.removed, link);
      list("Relationship evidence changes", value.links.changed, item => `${link(item.after)}; before: ${JSON.stringify(item.before.records)}`);
    };
    delta("Entire analysis", report);
    if (report.scope) {
      text("h3", `Selected ${report.scope.mode} scope: ${report.scope.selectedFile.relativePath || report.scope.selectedFile.path}`);
      if (report.scope.status === "compared") {
        text("p", `Scope nodes: ${report.scope.beforeNodes} → ${report.scope.afterNodes}; original links: ${report.scope.beforeLinks} → ${report.scope.afterLinks}. All analyzed hops; arrows are unchanged.`);
        delta("Scope differences", report.scope);
      } else text("p", "Selected file was absent from the baseline. Its previous scope is unavailable, not assumed empty; no scope delta was invented.");
    }
    list("Notices newly reported", report.notices.added, item => JSON.stringify(item));
    list("Notices no longer reported (not proven resolved)", report.notices.removed, item => JSON.stringify(item));
    list("Product records added", report.products.added, item => JSON.stringify(item));
    list("Product records removed", report.products.removed, item => JSON.stringify(item));
    list("All baseline notices (including unchanged)", report.analysisNotices.baseline, item => JSON.stringify(item));
    list("All current notices (including unchanged)", report.analysisNotices.current, item => JSON.stringify(item));
  }

  function isImpactReport(report = entryPointReport) { return report?.kind === "file-impact"; }
  function reportSeed(report = entryPointReport) { return isImpactReport(report) ? report?.selectedFile : report?.entryPoint; }
  function scopeIsImpact() { return reportScope?.mode === "impact"; }
  function pathLabel() { return scopeIsImpact() ? "impact path" : "dependency path"; }
  function reportSelection(id, impact) { return { kind: "entryPointReport", id, ...(impact ? { mode: "impact" } : {}) }; }

  function requestEntryPointReport(id, mode) {
    if (!reportAvailable(id)) return;
    const impact = mode === "impact";
    detailSelection = reportSelection(id, impact);
    reportNodePage = 0;
    saveStateSoon();
    if (reportSeed()?.id === id && isImpactReport() === impact) { showEntryPointReport(); return; }
    details.replaceChildren();
    const pending = document.createElement("p"); pending.textContent = `Preparing ${impact ? "impact" : "entry-point"} report from the saved analysis…`; details.appendChild(pending);
    vscode.postMessage({ type: impact ? "impactReport" : "entryPointReport", nodeId: id, graphKey });
  }

  function showPendingDependencyPath() {
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = scopeIsImpact() ? "Impact path" : "Dependency path";
    const pending = document.createElement("p"); pending.textContent = "Reconstructing one shortest route from the saved analysis…";
    details.append(heading, pending);
  }

  function requestDependencyPath(targetId, showDetails = true) {
    if (!reportScope?.nodeIds.has(targetId)) return;
    // A monotonically increasing request ID prevents a delayed response from
    // resurrecting a route after Clear, Return, or another target selection.
    pathRequestId++;
    dependencyPath = undefined;
    reportScope.pathTargetId = targetId;
    if (showDetails) { detailSelection = { kind: "dependencyPath", id: targetId }; showPendingDependencyPath(); }
    render();
    vscode.postMessage({ type: scopeIsImpact() ? "impactDependencyPath" : "entryPointDependencyPath", graphKey, seedId: reportScope.seedId,
      nodeId: targetId, requestId: pathRequestId });
  }

  function clearDependencyPath() {
    if (!reportScope) return;
    pathRequestId++;
    dependencyPath = undefined;
    reportScope.pathTargetId = undefined;
    if (detailSelection?.kind === "dependencyPath") {
      // The route panel has no independent selection to restore. Reopen the
      // target's ordinary details without altering the saved scope layout.
      showNode(graph.nodes.find(node => node.id === detailSelection.id));
    }
    render();
  }

  function fitDependencyPath() {
    if (!dependencyPath) return;
    const nodeIds = new Set(dependencyPath.nodes.map(node => node.id));
    const data = currentGraph();
    const nodes = data.nodes.filter(node => nodeIds.has(node.id));
    if (!nodes.length) return;
    const edges = data.edges.filter(edge => dependencyPath.edges.some(item => item.id === edge.id));
    const rect = svg.getBoundingClientRect();
    transform = geometry.fit(geometry.bounds({ nodes, edges }, positions, sizes), rect.width, rect.height);
    viewportCustomized = false;
    updateTransform();
  }

  function showDependencyPath() {
    const route = dependencyPath;
    if (!route || !reportScope || (route.entryPointId || route.selectedFileId) !== reportScope.seedId) return;
    detailSelection = { kind: "dependencyPath", id: route.targetId };
    details.replaceChildren();
    const text = (tag, value) => { const item = document.createElement(tag); item.textContent = value; details.appendChild(item); return item; };
    text("h2", scopeIsImpact() ? "Impact path" : "Dependency path");
    text("p", `${route.hops} analyzed link${route.hops === 1 ? "" : "s"} from ${route.nodes[0]?.relativePath || route.nodes[0]?.label} to ${route.nodes.at(-1)?.relativePath || route.nodes.at(-1)?.label}.`);
    text("p", route.interpretation);
    text("button", `Fit ${pathLabel()}`).addEventListener("click", fitDependencyPath);
    text("button", `Clear ${pathLabel()}`).addEventListener("click", clearDependencyPath);
    // Each hop keeps the original relationship kind and details. The final
    // unresolved name can be inspected but never treated as a navigable file.
    route.nodes.forEach((node, index) => {
      const title = text("h3", `${index}. ${node.relativePath || node.label}`);
      title.title = node.path;
      if (index) {
        const edge = route.edges[index - 1];
        text("p", `Via ${edge.kind}${edge.details ? ` — ${edge.details}` : ""}`);
      }
      if (node.unresolved) text("p", "Unresolved name; no file location established.");
      else if (node.missing) text("p", "Missing file according to the saved analysis; not rechecked.");
      text("button", "Inspect node").addEventListener("click", () => { selectedId = node.id; showNode(node); render(); });
    });
    saveStateSoon();
  }

  function showReportScope() {
    if (!entryPointReport || !reportAvailable(reportSeed().id)) return;
    const seedId = reportSeed().id, impact = isImpactReport();
    if (reportScope?.seedId === seedId && scopeIsImpact() === impact) { fit(); return; }
    pathRequestId++; dependencyPath = undefined;
    const previousView = reportScope?.previousView || JSON.parse(JSON.stringify(captureViewState()));
    reportScope = { seedId, previousView, ...(impact ? { mode: "impact" } : {}),
      nodeIds: trace(seedId, impact ? "impact" : "dependencies", Infinity) };
    // Use fresh coordinates and original members, not a repository-sized or
    // cycle-isolated arrangement. The backup retains every previous mode bank.
    grouping.value = "none"; expandedGroups = new Set(); rebuildGroups();
    positionSets = new Map(); cyclePositionSets = new Map(); positions = new Map(); positionSets.set("none", positions);
    cycleMode.value = "off"; cycleComponent.value = "all"; refreshCycleMarks();
    search.value = ""; selectedId = seedId; direction.value = "report";
    dragging = panning = pointerNodeId = undefined;
    detailSelection = reportSelection(seedId, impact);
    updateDepthControl(); render(true); fit(); showEntryPointReport();
  }

  function returnFromReportScope() {
    if (!reportScope) return;
    const previous = reportScope.previousView, latestStatus = analysisStatus;
    pathRequestId++; dependencyPath = undefined;
    reportScope = undefined;
    positionSets = new Map(); cyclePositionSets = new Map(); positions = new Map();
    dragging = panning = pointerNodeId = undefined;
    resetDetails(); restoreState(previous); updateDepthControl(); render(); restoreDetails(); updateTransform();
    // Latest-attempt status is independent of layout: returning must not erase
    // a failure/cancellation that happened while the report view was open.
    showAnalysisStatus(latestStatus);
  }

  function showEntryPointReport() {
    const report = entryPointReport;
    if (!report) return;
    const impact = isImpactReport(report), seed = reportSeed(report);
    details.replaceChildren();
    const text = (tag, value, parent = details) => { const item = document.createElement(tag); item.textContent = value; parent.appendChild(item); return item; };
    text("h2", impact ? "File impact report" : "Entry-point dependency report");
    text("p", seed.relativePath || seed.path);
    text("p", `Saved analysis: ${report.analysis.generatedAt || "time not recorded"} · ${report.analysis.mode} · externals ${report.analysis.analysisIncludeExternal === true ? "enabled" : report.analysis.analysisIncludeExternal === false ? "disabled" : "not recorded"}`);
    const c = report.counts;
    text("p", `${c.nodes}/${c.repositoryNodes} original nodes (including ${impact ? "selected file" : "entry"}) · ${c.edges}/${c.repositoryEdges} links · ${c.unresolvedNames} unresolved names · ${c.missingFiles} missing files`);
    if (impact) text("p", `${c.directDependents} direct dependents · ${c.totalDependents} total dependents (excluding selected file). Minimum hops lead from each dependent toward the selected file. This is potential change exposure, not predicted breakage.`);
    text("p", `${c.reachableNotices} reachable notices · ${c.outsideNotices} outside · ${c.unattributedNotices} unattributed (${c.repositoryNotices} total)`);
    text("p", `${report.products.filter(item => item.disposition === "reachable").length} product records linked to this scope; all product evidence is included in exports, not license validation.`);
    text("p", `${impact ? "All direct/transitive analyzed dependents; original arrows are preserved" : "All analyzed outgoing dependencies"}; independent of display depth, grouping, search and visibility. Generating/exporting this report does not change the graph or run MATLAB. Showing its scope changes only the view.`);
    const show = text("button", reportScope?.seedId === seed.id && scopeIsImpact() === impact ? "Fit report scope" : "Show report scope in graph");
    show.addEventListener("click", showReportScope);
    if (reportScope) text("button", "Return to previous view").addEventListener("click", returnFromReportScope);
    for (const format of ["md", "json"]) {
      const button = text("button", `Export report (${format === "md" ? "Markdown" : "JSON"})`);
      button.addEventListener("click", () => vscode.postMessage({ type: impact ? "exportImpactReport" : "exportEntryPointReport", nodeId: seed.id, graphKey, format }));
    }
    const limits = text("details", ""); text("summary", "Coverage limits — review before interpreting zero notices", limits);
    for (const value of report.limitations) text("p", value, limits);
    for (const [scope, label] of [["reachable", "Reachable notices"], ["outside", "Outside-trace notices (not declared irrelevant)"], ["unattributed", "Unattributed notices (review for coverage limits)"]]) {
      const notices = report.notices.filter(item => item.disposition === scope);
      const section = text("details", ""); section.open = scope !== "outside";
      text("summary", `${label} (${notices.length})`, section);
      if (!notices.length) text("p", "None associated by exact graph evidence; this is not runtime validation.", section);
      for (const { item } of notices.slice(0, 100)) text("p", `${item.severity}: ${item.file || "General analysis notice"} — ${item.message}`, section);
      if (notices.length > 100) text("p", "First 100 shown. Both report exports retain every notice.", section);
    }
    text("h3", `${impact ? "Selected file and dependent nodes" : "Reachable original nodes"} (${report.nodes.length})`);
    const start = reportNodePage * 50;
    for (const { node, depth: hops } of report.nodes.slice(start, start + 50)) {
      const row = text("button", `${node.relativePath || node.label} · ${hops} hops${node.unresolved ? " · unresolved name" : node.missing ? " · missing file" : ""}`);
      row.disabled = Boolean(node.unresolved); row.addEventListener("click", () => openNode(node));
    }
    if (report.nodes.length > 50) {
      text("p", `Nodes ${start + 1}–${Math.min(start + 50, report.nodes.length)} of ${report.nodes.length}; exports include all nodes and original links.`);
      for (const [label, delta] of [["Previous nodes", -1], ["Next nodes", 1]]) {
        const button = text("button", label); button.disabled = reportNodePage + delta < 0 || (reportNodePage + delta) * 50 >= report.nodes.length;
        button.addEventListener("click", () => { reportNodePage += delta; showEntryPointReport(); });
      }
    }
    saveStateSoon();
  }

  function calculateLayout(kind) {
    const data = currentGraph();
    if (!data.nodes.length) return;
    data.nodes.forEach(nodeSize);
    const arrange = (part) => {
      if (kind === "circle") geometry.circle(part.nodes, positions, sizes);
      else if (kind === "grid") geometry.grid(part.nodes, positions, sizes);
      else if (kind === "hierarchical") geometry.hierarchical(part, positions, sizes);
      else { forceLayout(part); geometry.separate(part.nodes, positions, sizes); }
    };
    if (cycleMode.value === "isolate" || reportScope) {
      const rect = svg.getBoundingClientRect();
      geometry.compactComponents(data, positions, sizes, arrange, rect.width / Math.max(1, rect.height));
    } else arrange(data);
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
    updateDepthControl();
    entryPointReportButton.disabled = !reportAvailable(selectedId);
    impactReportButton.disabled = !reportAvailable(selectedId);
    comparisonButton.disabled = Boolean(graph.metadata.graphType && graph.metadata.graphType !== "files");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    nodeElements.clear(); edgeElements.clear();
    const data = currentGraph();
    renderedData = data;
    renderedCycleMode = cycleMode.value;
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
    const original = data.original || data;
    const unresolvedCount = graph.nodes.filter((node) => node.unresolved).length;
    const itemLabel = unresolvedCount && graphTerms().items === "files" ? "files/names" : graphTerms().items, edgeLabel = graphTerms().edges;
    const unresolvedSummary = unresolvedCount ? ` · ${original.nodes.filter((node) => node.unresolved).length}/${unresolvedCount} unresolved names` : "";
    const groupSummary = groupIndex.groups.size ? ` · ${data.nodes.filter((node) => node.group).length} collapsed groups · ${data.edges.length} displayed links · ${data.internalEdges} internal ${edgeLabel}` : "";
    summary.textContent = `${original.nodes.length}/${graph.nodes.length} ${itemLabel} · ${original.edges.length}/${graph.edges.length} ${edgeLabel}${groupSummary}${unresolvedSummary} · ${cycleIndex.components.length} cyclic components${cycleMode.value !== "off" ? ` (${cycleMode.value})` : ""} · ${graph.products.length} product references · ${problemSummary()} · ${graph.metadata.mode} · ${graph.metadata.durationSeconds.toFixed(1)} s`;
    summary.title = summary.textContent;
    if (reportScope) { summary.textContent += ` · ${scopeIsImpact() ? "impact report scope (all analyzed dependent hops)" : "report scope (all analyzed dependency hops)"}`; summary.title = summary.textContent; }
    if (detailSelection?.kind === "group") showGroup(groupIndex.groups.get(detailSelection.id));
    else if (detailSelection?.kind === "cycles") showCycles();
  }

  function drawEdge(edge) {
    const value = geometry.edgeGeometry(edge, positions, sizes);
    if (!value) return;
    const cyclic = cyclicEdgeCount(edge);
    const pathEdge = dependencyPath?.edges.some(item => item.id === edge.id);
    const line = element(value.d ? "path" : "line", { class: `edge${cyclic ? " cyclic" : ""}${dependencyPath ? pathEdge ? " dependency-path" : " path-dim" : isSelected(edge.source) || isSelected(edge.target) ? " highlight" : ""}`, "data-edge-id": edge.id,
      ...(edge.count ? { "data-link-count": edge.count } : {}), ...(cyclic ? { "data-cyclic-links": cyclic } : {}) });
    for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
    edgeElements.set(edge.id, line);
    line.addEventListener("click", (event) => { event.stopPropagation(); showEdge(edge); });
    line.addEventListener("mouseenter", (event) => showTooltip(event, `${edge.count ? `${edge.count} original ${graphTerms().edges}` : edge.kind}${cyclic ? `; ${cyclic} highlighted cyclic links` : ""}`));
    line.addEventListener("mouseleave", hideTooltip);
    world.appendChild(line);
    if (edge.count) {
      const label = element("text", { class: "link-count", "data-count-for": edge.id, "text-anchor": "middle" });
      label.textContent = String(edge.count); placeCount(label, edge); world.appendChild(label);
    }
  }

  function drawNode(node, query) {
    const point = positions.get(node.id), size = nodeSize(node);
    const matches = !query || `${node.label} ${node.relativePath} ${node.path} ${node.searchText || ""}`.toLowerCase().includes(query);
    const pathNode = dependencyPath?.nodes.some(item => item.id === node.id);
    const group = element("g", { transform: `translate(${point.x},${point.y})`, "data-node-id": node.id, ...(node.group ? { "data-group-id": node.id, tabindex: 0, role: "button", "aria-label": `${node.relativePath}; Enter to expand` } : {}), class: `node${node.group ? " cluster" : ""}${node.external ? " external" : ""}${cyclicNode(node) ? " cyclic" : ""}${node.missing ? " missing" : ""}${isSelected(node.id) ? " selected" : ""}${pathNode ? " dependency-path" : dependencyPath ? " path-dim" : matches ? "" : " dim"}` });
    nodeElements.set(node.id, group);
    group.appendChild(element("rect", { x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height }));
    const text = element("text", { "text-anchor": "middle", "xml:space": "preserve" });
    size.lines.forEach((line, index) => {
      const span = element("tspan", { x: 0, y: (index - (size.lines.length - 1) / 2) * 16 + 4 });
      span.textContent = line; text.appendChild(span);
    });
    group.appendChild(text);
    group.addEventListener("click", (event) => { event.stopPropagation(); if (suppressClick) { suppressClick = false; return; } selectedId = node.id; showNode(node); render(!reportScope && direction.value !== "all"); });
    group.addEventListener("dblclick", (event) => { event.stopPropagation(); openNode(node); });
    if (node.group) group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleGroup(node.id); }
    });
    group.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopPropagation(); suppressClick = false;
      pointerNodeId = node.id;
      dragging = { id: node.id, start: screenToWorld(event.clientX, event.clientY), x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
    });
    group.addEventListener("mouseenter", (event) => showTooltip(event, node.group ? `${node.relativePath}\n${node.internalEdges.length} internal ${graphTerms().edges}; double-click or Enter to expand` : `${node.kind}\n${node.path}`));
    group.addEventListener("mouseleave", hideTooltip);
    world.appendChild(group);
  }

  function showNode(node) {
    if (!node) return;
    if (node.group || groupIndex.groups.has(node.id)) { showGroup(node.group || groupIndex.groups.get(node.id)); return; }
    detailSelection = { kind: "node", id: node.id };
    saveStateSoon();
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = node.label; details.appendChild(heading);
    const list = document.createElement("dl");
    const fields = [[node.unresolved ? "Unresolved name" : "Path", node.path], ["Type", node.kind]];
    if (node.line !== undefined) fields.push(["Line", String(node.line + 1)]);
    if (node.containerName) fields.push(["Container", node.containerName]);
    fields.push(["External", node.unresolved ? "Unknown" : node.external ? "Yes" : "No"],
      ["Missing", node.unresolved ? "Not established" : node.missing ? "Yes" : "No"]);
    for (const [name, value] of fields) {
      const term = document.createElement("dt"); term.textContent = name;
      const description = document.createElement("dd"); description.textContent = value;
      list.append(term, description);
    }
    details.appendChild(list);
    if (node.unresolved) {
      const explanation = document.createElement("p");
      explanation.textContent = "MATLAB reported this dependency name without establishing a file path. It may be a variable, unavailable class/function, or missing asset. No file location is guessed; file navigation is unavailable.";
      details.appendChild(explanation);
    }
    const counts = document.createElement("p");
    // Count connected symbols/containers, not source occurrences: one reference
    // edge may group many lines, and duplicate edges must not inflate neighbors.
    const outgoing = new Set(graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.target)).size;
    const incoming = new Set(graph.edges.filter((edge) => edge.target === node.id).map((edge) => edge.source)).size;
    const terms = graphTerms();
    counts.textContent = `${outgoing} ${terms.outgoing[outgoing === 1 ? 0 : 1]} · ${incoming} ${terms.incoming[incoming === 1 ? 0 : 1]}`;
    details.appendChild(counts);
    const button = document.createElement("button"); button.textContent = node.unresolved ? "No resolved file" : node.line === undefined ? "Open file" : "Open symbol"; button.disabled = Boolean(node.unresolved); button.addEventListener("click", () => openNode(node)); details.appendChild(button);
    if (reportAvailable(node.id)) {
      const report = document.createElement("button"); report.textContent = "Entry-point dependency report";
      report.addEventListener("click", () => requestEntryPointReport(node.id)); details.appendChild(report);
      const impact = document.createElement("button"); impact.textContent = "Impact report";
      impact.addEventListener("click", () => requestEntryPointReport(node.id, "impact")); details.appendChild(impact);
    }
    if (reportScope?.nodeIds.has(node.id)) {
      const path = document.createElement("button"); path.textContent = `Show ${pathLabel()}`;
      path.addEventListener("click", () => requestDependencyPath(node.id)); details.appendChild(path);
    }
    const component = cycleIndex.nodeToComponent.get(node.id);
    if (component) {
      const inspect = document.createElement("button"); inspect.textContent = "Inspect cyclic component";
      inspect.addEventListener("click", () => { cycleComponent.value = component; cycleMode.value = "highlight"; cycleMemberPage = 0; applyCycleView(); });
      details.appendChild(inspect);
    }
  }

  function showEdge(edge) {
    if (!edge) return;
    detailSelection = { kind: "edge", id: edge.id };
    saveStateSoon();
    const source = renderedData.nodes.find((node) => node.id === edge.source), target = renderedData.nodes.find((node) => node.id === edge.target);
    details.replaceChildren();
    const heading = document.createElement("h2"); heading.textContent = graphTerms().heading; details.appendChild(heading);
    if (edge.originalEdges) {
      heading.textContent = `Grouped ${graphTerms().edges} (${edge.count})`;
      const explanation = document.createElement("p"); explanation.textContent = `${source?.label} → ${target?.label}. Counts are original graph links, not source occurrences. Internal links are summarized inside collapsed groups.`; details.appendChild(explanation);
      if (cycleMode.value !== "off") {
        const cyclic = document.createElement("p"); cyclic.textContent = `${cyclicEdgeCount(edge)}/${edge.count} original links are internal to the selected cyclic components; the aggregate arrow itself does not prove a cycle.`; details.appendChild(cyclic);
      }
      // Explicit originals make mixed relationship types and direction auditable.
      for (const original of edge.originalEdges) {
        const from = graph.nodes.find((node) => node.id === original.source), to = graph.nodes.find((node) => node.id === original.target);
        const row = document.createElement("p"); row.textContent = `${from?.relativePath || original.source} → ${to?.relativePath || original.target}: ${original.kind}${original.details ? ` (${original.details})` : ""}`; details.appendChild(row);
      }
      return;
    }
    const paragraph = document.createElement("p"); paragraph.textContent = `${source?.relativePath || edge.source} → ${target?.relativePath || edge.target}`; details.appendChild(paragraph);
    const kind = document.createElement("p"); kind.textContent = graph.metadata.graphType === "references"
      ? "The source container contains references to the target symbol; one link can group multiple source occurrences."
      : graph.metadata.graphType === "call-hierarchy" ? "The source function calls the target function." : "The source file depends on the target file."; details.appendChild(kind);
    const relationship = document.createElement("p"); relationship.textContent = `Relationship type: ${edge.kind}`; details.appendChild(relationship);
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
        scope, transform, width: svg.clientWidth, height: svg.clientHeight, selectedId,
        selectedIds: new Set(data.nodes.filter((node) => isSelected(node.id)).map((node) => node.id)), search: search.value, fontFamily,
        cyclicNodeIds: new Set(data.nodes.filter(cyclicNode).map((node) => node.id)),
        cyclicEdgeCounts: new Map(data.edges.map((edge) => [edge.id, cyclicEdgeCount(edge)])),
        cycleDescription: reportScope ? `${scopeIsImpact() ? "Impact" : "Entry-point"} report scope: ${graph.nodes.find(node => node.id === reportScope.seedId)?.relativePath || reportScope.seedId}. All analyzed ${scopeIsImpact() ? "incoming dependents; original arrow directions preserved; potential change exposure only" : "outgoing dependencies"}; no runtime-completeness claim. JSON/DOT/CSV graph exports retain the complete original analysis.`
          : cycleMode.value === "off" ? "" : `Cycle view: ${cycleMode.value}; ${cycleMarks.components.length} original cyclic components selected. Filters may hide members; projected grouped arrows are not themselves proof of a cycle.`,
        dependencyPathNodeIds: dependencyPath ? new Set(dependencyPath.nodes.map(node => node.id)) : undefined,
        dependencyPathEdgeIds: dependencyPath ? new Set(dependencyPath.edges.map(edge => edge.id)) : undefined,
        pathDescription: dependencyPath?.interpretation,
        colors: { background: css("--vscode-editor-background", "#fff"), text: css("--vscode-editor-foreground", "#222"),
          node: css("--vscode-charts-blue", "#1976d2"), edge: css("--vscode-descriptionForeground", "#888"),
          selected: css("--vscode-focusBorder", "#c05a00"), cyclic: css("--vscode-charts-purple", "#b86dda"), external: css("--vscode-charts-yellow", "#a17700"), missing: css("--vscode-errorForeground", "#d32f2f"), path: css("--vscode-charts-green", "#4fbf75") }
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
    for (const edge of renderedData.edges) {
      if (edge.source !== dragging.id && edge.target !== dragging.id) continue;
      const line = edgeElements.get(edge.id), value = geometry.edgeGeometry(edge, positions, sizes);
      if (line && value) for (const [name, item] of Object.entries(value)) if (name !== "bounds") line.setAttribute(name, item);
      if (edge.count) {
        const label = [...world.children].find((child) => child.getAttribute("data-count-for") === edge.id);
        if (label) placeCount(label, edge);
      }
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
    if (pointerNodeId) { const node = findNode(pointerNodeId); selectedId = pointerNodeId; showNode(node); render(!reportScope && direction.value !== "all"); return; }
    if (event.target === svg || event.target === world) { const traced = !reportScope && direction.value !== "all"; selectedId = undefined; direction.value = "all"; resetDetails(); updateDepthControl(); render(traced); }
  });
  svg.addEventListener("dblclick", (event) => {
    const node = graph && findNode(pointerNodeId);
    if (node && !suppressClick) { event.stopPropagation(); openNode(node); }
  });
  svg.addEventListener("wheel", (event) => { event.preventDefault(); viewportCustomized = true; const rect = svg.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const next = Math.max(1e-12, Math.min(8, transform.k * Math.exp(Math.max(-20, Math.min(20, -event.deltaY * .001))))); transform.x = x - ((x - transform.x) / transform.k) * next; transform.y = y - ((y - transform.y) / transform.k) * next; transform.k = next; updateTransform(); }, { passive: false });
  search.addEventListener("input", () => render());
  layout.addEventListener("change", () => { calculateLayout(layout.value); render(); fit(); });
  grouping.addEventListener("change", () => {
    if (reportScope) { grouping.value = "none"; return; }
    // The old map is already retained in positionSets. Mode changes start
    // collapsed; repeated modes reuse positions without touching source data.
    selectPositionMap();
    expandedGroups = new Set(); rebuildGroups();
    if (cycleMode.value === "isolate") for (const id of cycleMarks.nodes) { const owner = groupIndex.membership.get(id); if (owner) expandedGroups.add(owner); }
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) { selectedId = undefined; direction.value = "all"; }
    resetDetails(); pointerNodeId = undefined; updateDepthControl(); render(cycleMode.value === "isolate"); fit();
  });
  document.getElementById("groups").addEventListener("click", showGroups);
  cyclesButton.addEventListener("click", showCycles);
  cycleMode.addEventListener("change", applyCycleView);
  cycleComponent.addEventListener("change", () => {
    cycleMemberPage = 0; if (cycleMode.value === "off") cycleMode.value = "highlight"; applyCycleView();
  });
  for (const action of ["collapse", "expand"]) document.getElementById(`${action}-groups`).addEventListener("click", () => {
    if (setExpandedGroups(action === "expand" ? new Set(groupIndex.groups.keys()) : new Set())) fit();
  });
  direction.addEventListener("change", () => { updateDepthControl(); render(true); fit(); });
  for (const control of [depth, external, isolated]) control.addEventListener("change", () => { render(true); fit(); restoreDetails(); });
  document.getElementById("fit").addEventListener("click", fit);
  document.getElementById("refresh").addEventListener("click", () => {
    const message = { type: "refresh" };
    if (isFunctionGraph()) message.depth = Number(depth.value) || 3;
    vscode.postMessage(message);
  });
  problemsButton.addEventListener("click", showProblems);
  entryPointReportButton.addEventListener("click", () => requestEntryPointReport(selectedId));
  impactReportButton.addEventListener("click", () => requestEntryPointReport(selectedId, "impact"));
  comparisonButton.addEventListener("click", () => {
    detailSelection = { kind: "comparison", ...(reportAvailable(selectedId) ? { id: selectedId } : {}) };
    comparisonData = undefined; requestComparison("info");
  });
  clearDependencyPathButton.addEventListener("click", clearDependencyPath);
  document.getElementById("return-report-view").addEventListener("click", returnFromReportScope);
  document.getElementById("export").addEventListener("click", () => vscode.postMessage({ type: "export" }));
  document.getElementById("external-settings").addEventListener("click", () => vscode.postMessage({ type: "externalSettings" }));
  document.getElementById("status-logs").addEventListener("click", () => vscode.postMessage({ type: "openLogs" }));
  document.getElementById("status-refresh").addEventListener("click", () => document.getElementById("refresh").click());
  window.addEventListener("resize", () => {
    if (main.clientWidth <= COMPACT_WIDTH && resizingDetails) finishDetailsResize(resizingDetails);
    applyDetailsWidth(); resizeCanvasSoon();
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("message", (event) => {
    if (event.data.type === "setGraph") {
      // Serializer-supplied view state can arrive after the script starts.
      // Apply its width before layout/Fit; subsequent results keep this width.
      if (!graph && event.data.viewState) { restoreDetailsWidth(event.data.viewState); applyDetailsWidth(); }
      const incomingKey = JSON.stringify(event.data.graph.metadata);
      const sameGraph = graph && incomingKey === graphKey;
      const previousLayout = layout.value;
      const keepGrouping = graph && graph.metadata.root === event.data.graph.metadata.root
        && graph.metadata.graphType === event.data.graph.metadata.graphType;
      graph = event.data.graph;
      graphKey = incomingKey;
      if (sameGraph) { if (event.data.analysisStatus !== undefined) showAnalysisStatus(event.data.analysisStatus); render(); return; }
      entryPointReport = undefined;
      comparisonRequestId++; comparisonPending = false; comparisonData = undefined;
      reportScope = undefined;
      pathRequestId++; dependencyPath = undefined;
      // New analysis may merge/split components or change coverage. Recompute
      // from original data and reset the cycle view; same-result serializer
      // restoration below is the only path that reuses a saved cycle selection.
      rebuildCycles();
      cyclePositionSets = new Map();
      if (!keepGrouping) { grouping.value = "none"; expandedGroups = new Set(); positionSets = new Map(); }
      rebuildGroups(); expandedGroups = new Set([...expandedGroups].filter((id) => groupIndex.groups.has(id)));
      // A Refresh may remove many nodes. Prune all mode maps before saving state.
      for (const [mode, points] of positionSets) {
        const valid = new Set([...graph.nodes.map((node) => node.id), ...groupingApi.index(graph, mode).groups.keys()]);
        for (const id of points.keys()) if (!valid.has(id)) points.delete(id);
      }
      positions = positionSets.get(grouping.value) || new Map(); positionSets.set(grouping.value, positions);
      sizes.clear(); selectedId = undefined;
      dragging = undefined; panning = undefined; pointerNodeId = undefined;
      viewportCustomized = false; transform = { x: 0, y: 0, k: 1 }; analysisStatus = undefined;
      resetDetails(); search.value = ""; direction.value = "all";
      external.checked = true; isolated.checked = true;
      const functionGraph = graph.metadata.graphType === "call-hierarchy";
      if (functionGraph && graph.metadata.analysisDepth) depth.value = String(graph.metadata.analysisDepth);
      const onlyWarnings = graph.problems.length > 0 && graph.problems.every((problem) => problem.severity === "warning");
      problemsButton.hidden = graph.problems.length === 0;
      problemsButton.textContent = `${onlyWarnings ? "Warnings" : "Notices"} (${graph.problems.length})`;
      direction.options[1].textContent = graphTerms().forward;
      direction.options[2].textContent = graphTerms().backward;
      updateExternalPolicy();
      search.placeholder = graph.metadata.graphType === "files" || !graph.metadata.graphType ? "Search files…" : "Search symbols…";
      layout.value = keepGrouping ? previousLayout : functionGraph ? "hierarchical" : event.data.defaultLayout || "force";
      const restored = restoreState(event.data.viewState ?? initialState);
      showAnalysisStatus(event.data.analysisStatus !== undefined ? event.data.analysisStatus : analysisStatus);
      updateDepthControl();
      render(!restored && !keepGrouping); restoreDetails();
      if (reportScope?.pathTargetId) requestDependencyPath(reportScope.pathTargetId, detailSelection?.kind === "dependencyPath");
      if (!restored || !viewportCustomized) requestAnimationFrame(() => { if (!viewportCustomized) fit(); });
    } else if (event.data.type === "comparisonState" && event.data.graphKey === graphKey
      && detailSelection?.kind === "comparison" && event.data.requestId === comparisonRequestId) {
      comparisonPending = false;
      comparisonData = { ...event.data, ...(comparisonAction === "info" ? { result: undefined } : {}) };
      if (comparisonData.result) detailSelection.scope = comparisonData.result.report.scope?.mode || "all";
      else detailSelection.scope = undefined;
      showComparison(); saveStateSoon();
    } else if (["entryPointReport", "impactReport"].includes(event.data.type) && event.data.graphKey === graphKey) {
      if (detailSelection?.kind === "entryPointReport" && detailSelection.id === reportSeed(event.data.report)?.id
        && (detailSelection.mode === "impact") === isImpactReport(event.data.report)) {
        entryPointReport = event.data.report; showEntryPointReport();
      }
    } else if (["entryPointReportError", "impactReportError"].includes(event.data.type) && event.data.graphKey === graphKey
      && detailSelection?.kind === "entryPointReport" && detailSelection.id === event.data.nodeId
      && (detailSelection.mode === "impact") === (event.data.type === "impactReportError")) {
      details.replaceChildren(); const error = document.createElement("p"); error.textContent = event.data.message; details.appendChild(error);
    } else if (event.data.type === (scopeIsImpact() ? "impactDependencyPath" : "entryPointDependencyPath") && event.data.graphKey === graphKey
      && reportScope?.seedId === event.data.seedId && reportScope.pathTargetId === event.data.nodeId
      && pathRequestId === event.data.requestId) {
      dependencyPath = event.data.route;
      render();
      if (detailSelection?.kind === "dependencyPath" && detailSelection.id === dependencyPath.targetId) showDependencyPath();
    } else if (event.data.type === (scopeIsImpact() ? "impactDependencyPathError" : "entryPointDependencyPathError") && event.data.graphKey === graphKey
      && reportScope?.seedId === event.data.seedId && reportScope.pathTargetId === event.data.nodeId
      && pathRequestId === event.data.requestId) {
      clearDependencyPath();
      details.replaceChildren(); const error = document.createElement("p"); error.textContent = event.data.message; details.appendChild(error);
    } else if (event.data.type === "analysisStatus" && graph) showAnalysisStatus(event.data.status);
    else if (event.data.type === "requestExport") void exportVisual(event.data.format, event.data.scope, event.data.scale);
    else if (event.data.type === "showProblems") showProblems();
    else if (event.data.type === "restoreError") { summary.textContent = event.data.message; resetDetails(); }
  });
  vscode.postMessage({ type: "ready" });
})();
