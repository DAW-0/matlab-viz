import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { validateGraph } from "../../src/model";
import { DebugWebview } from "./debugWebview";

/** Real Chromium layout and visual-export checks in an isolated editor. */
export async function run(): Promise<void> {
  const artifacts = process.env.MATLAB_VIZ_TEST_ARTIFACTS!, profile = process.env.MATLAB_VIZ_HOST_PROFILE!;
  const observations: string[] = [];
  const debug = new DebugWebview(process.env.MATLAB_VIZ_DEBUG_ENDPOINT!);
  const log = (value: string) => { observations.push(value); console.log(value); };
  const delay = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(check: () => Promise<boolean>, timeout = 15_000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) { if (await check()) return; await delay(); }
    throw new Error("Visual test condition did not complete");
  }
  try {
    const extension = vscode.extensions.getExtension("daw-0.matlab-viz")!;
    const fixturePath = process.env.MATLAB_VIZ_TEST_GRAPH ?? path.join(extension.extensionPath, ".tools/validation/0.3.5/west-control-fresh.json");
    const original = validateGraph(JSON.parse(await fs.readFile(fixturePath, "utf8")));
    original.metadata.analysisTarget = { version: 1, type: "files" };
    const storage = path.join(profile, "User", "workspaceStorage");
    const folders = await fs.readdir(storage, { withFileTypes: true });
    const workspace = folders.find((entry) => entry.isDirectory() && /^[a-f\d]{32}$/i.test(entry.name));
    assert.ok(workspace, "Isolated workspace storage missing");
    const cacheFolder = path.join(storage, workspace.name, "daw-0.matlab-viz");
    await fs.mkdir(cacheFolder, { recursive: true });
    await fs.writeFile(path.join(cacheFolder, "last-graph.json"), JSON.stringify(original));
    await vscode.workspace.getConfiguration("files").update("simpleDialog.enable", true, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("matlabViz.showGraph");
    const view = await debug.graph(), workbench = await debug.workbench();
    const geometryCheck = `
      const svg=document.getElementById('graph'), frame=svg.getBoundingClientRect();
      const nodes=[...svg.querySelectorAll('g.node')];
      const boxes=nodes.map(node=>{const r=node.querySelector('rect'),m=node.transform.baseVal.consolidate().matrix;return {x:m.e+r.x.baseVal.value,y:m.f+r.y.baseVal.value,w:r.width.baseVal.value,h:r.height.baseVal.value};});
      let overlaps=0,clipped=0,wideText=0;
      for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=boxes[a],y=boxes[b];if(x.x<y.x+y.w-.01&&x.x+x.w>y.x+.01&&x.y<y.y+y.h-.01&&x.y+x.h>y.y+.01)overlaps++;}
      for(const node of nodes){const box=node.querySelector('rect').getBoundingClientRect();if(box.left<frame.left-1||box.right>frame.right+1||box.top<frame.top-1||box.bottom>frame.bottom+1)clipped++;
        const width=node.querySelector('rect').width.baseVal.value;for(const text of node.querySelectorAll('tspan'))if(text.getComputedTextLength()>width-20)wideText++;}
      return {nodes:nodes.length,overlaps,clipped,wideText};`;
    for (const layout of ["grid", "circle", "hierarchical", "force"]) {
      await view.evaluate(`const layout=document.getElementById('layout');layout.value=${JSON.stringify(layout)};layout.dispatchEvent(new Event('change'));return true;`);
      const result = await view.evaluate(geometryCheck);
      assert.equal(result.nodes, original.nodes.length); assert.equal(result.overlaps, 0, `${layout}: overlap`);
      assert.equal(result.clipped, 0, `${layout}: Fit clipped nodes`); assert.equal(result.wideText, 0, `${layout}: labels overflow`);
      log(`${layout}: ${result.nodes} rendered nodes, no overlaps/clipping, all label lines inside their rectangles`);
    }
    const enter = async () => {
      await workbench.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await workbench.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    };
    const input = async (value: string) => {
      await waitFor(async () => workbench.evaluate(`return [...document.querySelectorAll('.quick-input-widget input')].some(input=>input.getBoundingClientRect().width>0);`));
      await workbench.evaluate(`const input=[...document.querySelectorAll('.quick-input-widget input')].find(input=>input.getBoundingClientRect().width>0);input.focus();input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
      await delay(200); await enter(); await delay(200);
    };
    const exists = async (file: string) => { try { return (await fs.stat(file)).size > 0; } catch { return false; } };
    const exportVisual = async (name: string, format: string, scope = "graph", scale = 2, menu = false) => {
      const destination = path.join(artifacts, name);
      if (menu) {
        void vscode.commands.executeCommand("matlabViz.exportGraph");
        await input(format.toUpperCase()); await input(scope === "graph" ? "Filtered graph" : "Current viewport");
        if (format === "png") await input(`${scale}×`);
      } else await view.evaluate(`window.postMessage({type:'requestExport',format:${JSON.stringify(format)},scope:${JSON.stringify(scope)},scale:${scale}},'*');return true;`);
      await input(destination);
      await waitFor(() => exists(destination));
      return destination;
    };
    // Deliberately zoom past the graph extents before exporting the whole graph.
    await view.evaluate(`document.getElementById('graph').dispatchEvent(new WheelEvent('wheel',{clientX:200,clientY:200,deltaY:-1800,cancelable:true}));return true;`);
    const fullSvg = await exportVisual("full-graph.svg", "svg", "graph", 1, true);
    const source = await fs.readFile(fullSvg, "utf8");
    const parsed = await view.evaluate(`const documentSvg=new DOMParser().parseFromString(${JSON.stringify(source)},'image/svg+xml');return {error:!!documentSvg.querySelector('parsererror'),nodes:documentSvg.querySelectorAll('[data-node-id]').length,edges:documentSvg.querySelectorAll('[data-edge-id]').length,images:documentSvg.querySelectorAll('image').length,arrows:documentSvg.querySelectorAll('[marker-end]').length};`);
    assert.equal(parsed.error, false); assert.equal(parsed.nodes, original.nodes.length); assert.equal(parsed.edges, original.edges.length);
    assert.equal(parsed.images, 0); assert.equal(parsed.arrows, original.edges.length); assert.ok(!source.includes("…"));
    log(`Export menu/save: full SVG has ${parsed.nodes} vector nodes, ${parsed.edges} arrowed edges, no bitmap or truncated labels`);
    const seed = original.nodes.find((node) => original.edges.filter((edge) => edge.source === node.id && edge.target !== node.id).length === 1)!;
    assert.ok(seed);
    await view.evaluate(`const node=[...document.querySelectorAll('g.node')].find(node=>node.dataset.nodeId===${JSON.stringify(seed.id)});node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      document.getElementById('depth').value='1';const direction=document.getElementById('direction');direction.value='dependencies';direction.dispatchEvent(new Event('change'));return true;`);
    const filtered = await view.evaluate(geometryCheck); assert.equal(filtered.nodes, 2);
    await view.evaluate(`const layout=document.getElementById('layout');layout.value='grid';layout.dispatchEvent(new Event('change'));return true;`);
    // Use trusted Chromium mouse events, not only synthetic DOM pointer events.
    const iframe = await workbench.evaluate(`return [...document.querySelectorAll('iframe')].map(frame=>{const r=frame.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).filter(r=>r.width>100&&r.height>100).sort((a,b)=>b.width*b.height-a.width*a.height)[0];`);
    assert.ok(iframe, "Graph iframe bounds missing");
    const mouse = async (type: string, x: number, y: number, pressed = false) => {
      await workbench.request("Input.dispatchMouseEvent", { type, x: iframe.x + x, y: iframe.y + y,
        button: type === "mouseMoved" ? "none" : "left", buttons: pressed ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });
    };
    const point = await view.evaluate(`const node=document.querySelector('g.node'),r=node.querySelector('rect').getBoundingClientRect();window.__testNode=node;window.__captureCount=0;window.__pointerEvents=[];const svg=document.getElementById('graph');svg.addEventListener('gotpointercapture',()=>window.__captureCount++);for(const type of ['pointerdown','pointermove','pointerup','click','gotpointercapture','lostpointercapture'])svg.addEventListener(type,event=>window.__pointerEvents.push({type,x:event.clientX,y:event.clientY,target:event.target.tagName,buttons:event.buttons}),true);return {x:r.x+r.width/2,y:r.y+r.height/2,id:node.dataset.nodeId};`);
    await mouse("mousePressed", point.x, point.y, true); await mouse("mouseReleased", point.x, point.y); await delay();
    assert.equal(await view.evaluate("return document.querySelector('g.node.selected')?.dataset.nodeId;"), point.id, "Trusted click did not select the captured node");
    const blank = await view.evaluate("const r=document.getElementById('graph').getBoundingClientRect();return {x:r.x+5,y:r.y+5};");
    await mouse("mousePressed", blank.x, blank.y, true); await mouse("mouseMoved", blank.x + 100, blank.y + 70, true); await mouse("mouseReleased", blank.x + 100, blank.y + 70); await delay();
    assert.equal(await view.evaluate("return document.querySelector('g.node.selected')?.dataset.nodeId;"), point.id);
    assert.equal(await view.evaluate("return document.getElementById('direction').value;"), "dependencies");
    const dragPoint = await view.evaluate("const node=document.querySelector('g.node.selected'),r=node.querySelector('rect').getBoundingClientRect();window.__testNode=node;return {x:r.x+r.width/2,y:r.y+r.height/2,before:node.getAttribute('transform')};");
    await mouse("mousePressed", dragPoint.x, dragPoint.y, true);
    for (let index = 1; index <= 8; index++) await mouse("mouseMoved", dragPoint.x + index * 30, dragPoint.y - index * 6, true);
    await mouse("mouseReleased", dragPoint.x + 240, dragPoint.y - 48); await delay();
    const dragResult = await view.evaluate("return {connected:window.__testNode.isConnected,transform:window.__testNode.getAttribute('transform'),captures:window.__captureCount};");
    assert.equal(dragResult.connected, true); assert.notEqual(dragResult.transform, dragPoint.before); assert.ok(dragResult.captures >= 2);
    await fs.writeFile(path.join(artifacts, "pointer-events.json"), JSON.stringify(await view.evaluate("return {events:window.__pointerEvents,captures:window.__captureCount};"), null, 2));
    log("Trusted Chromium mouse input: node click works, pan retains selection/direction, and rapid drag keeps the same node DOM/capture");
    await view.evaluate(`document.getElementById('layout').dispatchEvent(new Event('change'));return true;`);
    const relaid = await view.evaluate(geometryCheck); assert.equal(relaid.overlaps, 0); assert.equal(relaid.clipped, 0);
    const svgFile = await exportVisual("filtered.svg", "svg");
    assert.equal((await fs.readFile(svgFile, "utf8")).match(/data-node-id=/g)?.length, 2);
    const pngFile = await exportVisual("filtered-4x.png", "png", "graph", 4, true);
    const png = await fs.readFile(pngFile);
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.ok(width > 500 && height > 100);
    const imageData = `data:image/png;base64,${png.toString("base64")}`;
    const imageResult = await view.evaluate(`return new Promise((resolve,reject)=>{const image=new Image();image.onerror=reject;image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let visible=0;for(let i=4;i<pixels.length;i+=4)if(pixels[i]!==pixels[0]||pixels[i+1]!==pixels[1]||pixels[i+2]!==pixels[2])visible++;resolve({width:image.width,height:image.height,visible});};image.src=${JSON.stringify(imageData)};});`);
    assert.equal(imageResult.width, width); assert.equal(imageResult.height, height); assert.ok(imageResult.visible > 1000);
    log(`Filtered SVG contains two nodes; 4× PNG decodes at ${width}×${height} with nonblank rendered pixels`);
    const filteredScreenshot = await workbench.request("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(artifacts, "filtered-editor.png"), Buffer.from(filteredScreenshot.data, "base64"));
    const viewportSource = await fs.readFile(await exportVisual("viewport.svg", "svg", "viewport"), "utf8");
    assert.ok(viewportSource.includes('viewBox="0 0 '));
    log("Viewport-only framing is available explicitly");
    await view.evaluate(`document.getElementById('direction').value='all';document.getElementById('direction').dispatchEvent(new Event('change'));document.getElementById('layout').value='circle';document.getElementById('layout').dispatchEvent(new Event('change'));window.postMessage({type:'requestExport',format:'png',scope:'graph',scale:4},'*');return true;`);
    await waitFor(async () => workbench.evaluate(`return document.body.textContent.includes('PNG would require') && document.body.textContent.includes('Choose SVG');`));
    log("Oversized PNG gives an actionable size-limit error instead of blank or silently downscaled output");
    const screenshot = await workbench.request("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(path.join(artifacts, "editor.png"), Buffer.from(screenshot.data, "base64"));
    await fs.writeFile(path.join(artifacts, "visual-result.json"), JSON.stringify({ passed: true, observations }, null, 2));
  } catch (error) {
    log(error instanceof Error ? error.stack ?? error.message : String(error));
    try {
      const workbench = await debug.workbench();
      const screenshot = await workbench.request("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(artifacts, "failed-editor.png"), Buffer.from(screenshot.data, "base64"));
    } catch { /* Preserve the original assertion failure. */ }
    await fs.writeFile(path.join(artifacts, "visual-result.json"), JSON.stringify({ passed: false, observations }, null, 2));
    throw error;
  } finally { debug.close(); await fs.writeFile(path.join(artifacts, "visual.log"), observations.join("\n")); }
}
