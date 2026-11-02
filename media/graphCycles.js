/* Original-graph cycle analysis. No DOM, MATLAB calls, grouping or mutation.
 * A cyclic strongly connected component (SCC) is NOT necessarily one simple
 * cycle. Retain every internal edge and provide one real directed witness,
 * instead of enumerating potentially exponentially many simple cycles. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MatlabVizCycles = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  function analyze(graph) {
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const outgoing = new Map([...nodes.keys()].map((id) => [id, []]));
    const incoming = new Map([...nodes.keys()].map((id) => [id, []]));
    const self = new Set();
    for (const edge of graph.edges) {
      // Validated analyzer graphs have no dangling endpoints, but keep this
      // pure boundary defensive for imported fixtures and future consumers.
      if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
      outgoing.get(edge.source).push(edge);
      incoming.get(edge.target).push(edge.source);
      if (edge.source === edge.target) self.add(edge.source);
    }

    // Iterative Kosaraju traversal: O(V + E), without a JS recursion-depth
    // limit on long dependency chains or a large mutually recursive component.
    const seen = new Set(), order = [];
    for (const id of nodes.keys()) {
      if (seen.has(id)) continue;
      seen.add(id);
      const stack = [{ id, next: 0 }];
      while (stack.length) {
        const frame = stack[stack.length - 1], edges = outgoing.get(frame.id);
        if (frame.next < edges.length) {
          const next = edges[frame.next++].target;
          if (!seen.has(next)) { seen.add(next); stack.push({ id: next, next: 0 }); }
        } else { order.push(frame.id); stack.pop(); }
      }
    }
    const assigned = new Set(), components = [], nodeToComponent = new Map();
    for (let index = order.length - 1; index >= 0; index--) {
      const root = order[index];
      if (assigned.has(root)) continue;
      assigned.add(root);
      const stack = [root], members = [];
      while (stack.length) {
        const id = stack.pop(); members.push(id);
        for (const previous of incoming.get(id)) if (!assigned.has(previous)) { assigned.add(previous); stack.push(previous); }
      }
      if (members.length === 1 && !self.has(root)) continue;
      members.sort();
      // SCCs have disjoint membership, so their smallest original node IDs are
      // unique. This is stable across input ordering, compact, and collision-free
      // without hashing or reserving any names in the original graph's ID space.
      const id = `component:${JSON.stringify(members[0])}`;
      const component = { id, nodes: members.map((member) => nodes.get(member)), edges: [], selfLinks: 0 };
      components.push(component);
      for (const member of members) nodeToComponent.set(member, id);
    }
    const byId = new Map(components.map((component) => [component.id, component])), edgeToComponent = new Map();
    for (const edge of graph.edges) {
      const id = nodeToComponent.get(edge.source);
      if (id !== undefined && id === nodeToComponent.get(edge.target)) {
        byId.get(id).edges.push(edge); edgeToComponent.set(edge.id, id);
        if (edge.source === edge.target) byId.get(id).selfLinks++;
      }
    }
    components.sort((a, b) => b.nodes.length - a.nodes.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const component of components) component.witness = witness(component, outgoing, nodeToComponent);
    return { components, byId, nodeToComponent, edgeToComponent };
  }

  function witness(component, outgoing, membership) {
    const finished = new Set(), active = new Map();
    for (const node of component.nodes) {
      if (finished.has(node.id)) continue;
      const stack = [{ id: node.id, next: 0, edge: undefined }]; active.set(node.id, 0);
      while (stack.length) {
        const frame = stack[stack.length - 1], edges = outgoing.get(frame.id);
        if (frame.next >= edges.length) { active.delete(frame.id); finished.add(frame.id); stack.pop(); continue; }
        const edge = edges[frame.next++];
        if (membership.get(edge.target) !== component.id) continue;
        if (active.has(edge.target)) {
          const start = active.get(edge.target);
          // Closing node repeats the first node. Every returned edge is an
          // actual analyzer edge in the same direction; self-links also work.
          return { nodes: [...stack.slice(start).map((item) => item.id), edge.target],
            edges: [...stack.slice(start + 1).map((item) => item.edge), edge.id] };
        }
        if (!finished.has(edge.target)) { active.set(edge.target, stack.length); stack.push({ id: edge.target, next: 0, edge: edge.id }); }
      }
    }
    return { nodes: [], edges: [] }; // Defensive only: every cyclic SCC has a witness.
  }

  function selection(index, id = "all") {
    const components = id === "all" ? index.components : index.byId.has(id) ? [index.byId.get(id)] : [];
    return { components, nodes: new Set(components.flatMap((component) => component.nodes.map((node) => node.id))),
      edges: new Set(components.flatMap((component) => component.edges.map((edge) => edge.id))) };
  }
  return { analyze, selection };
});
