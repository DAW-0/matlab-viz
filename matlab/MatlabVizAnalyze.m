function MatlabVizAnalyze(rootPath, outputPath, optionsPath)
%MATLABVIZANALYZE Export MATLAB/Simulink dependencies as MATLAB Viz JSON.
%   This function is an internal bridge used by the MATLAB Viz VS Code
%   extension. For MATLAB Projects it calls updateDependencies and exports
%   the project's Dependencies digraph. For ordinary folders it reconstructs
%   direct edges with matlab.codetools.requiredFilesAndProducts(...,'toponly').

arguments
    rootPath (1, 1) string
    outputPath (1, 1) string
    optionsPath (1, 1) string
end

started = tic;
rootPath = canonicalFolder(rootPath);
options = jsondecode(fileread(optionsPath));

mode = lower(string(options.mode));
projectDetected = isProjectFolder(rootPath);
if mode == "auto"
    if projectDetected
        mode = "project";
    else
        mode = "folder";
    end
elseif mode == "project" && ~projectDetected
    error("MatlabViz:ProjectNotFound", ...
        "Project analysis was requested, but no MATLAB Project was found at %s.", rootPath);
end

fprintf("MATLAB Viz: using %s dependency analysis for %s\n", mode, rootPath);
if mode == "project"
    [nodes, edges, products, problems, projectName] = analyzeProject(rootPath, options);
else
    [nodes, edges, products, problems] = analyzeFolder(rootPath, options);
    projectName = "";
end

metadata = struct( ...
    "schemaVersion", 1, ...
    "generatedAt", string(datetime("now", "TimeZone", "UTC", "Format", "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")), ...
    "root", rootPath, ...
    "mode", mode, ...
    "graphType", "files", ...
    "matlabVersion", string(version), ...
    "durationSeconds", toc(started), ...
    "projectName", projectName, ...
    "nodeCount", numel(nodes), ...
    "edgeCount", numel(edges));

document = struct( ...
    "metadata", metadata, ...
    "nodes", nodes, ...
    "edges", edges, ...
    "products", products, ...
    "problems", problems);

outputFolder = fileparts(outputPath);
if strlength(outputFolder) > 0 && ~isfolder(outputFolder)
    mkdir(outputFolder);
end
fileId = fopen(outputPath, "w", "n", "UTF-8");
if fileId < 0
    error("MatlabViz:OutputOpenFailed", "Could not open output file: %s", outputPath);
end
cleanup = onCleanup(@() fclose(fileId));
fwrite(fileId, jsonencode(document), "char");
fprintf("MATLAB Viz: exported %d nodes and %d edges to %s\n", numel(nodes), numel(edges), outputPath);
end

function [nodes, edges, products, problems, projectName] = analyzeProject(rootPath, options)
try
    project = openProject(rootPath, Prompt=false);
catch
    project = openProject(rootPath);
end
cleanup = onCleanup(@() close(project));

updateDependencies(project, ...
    ReanalyzeAll=logical(options.reanalyzeAll), ...
    AnalyzeReferences=logical(options.analyzeReferences), ...
    AnalyzeAddOns=logical(options.analyzeAddOns), ...
    AnalyzeModelParameters=logical(options.analyzeModelParameters));

graph = project.Dependencies;
names = string(graph.Nodes.Name);
endNodes = graph.Edges.EndNodes;
if isnumeric(endNodes)
    sourcePaths = names(endNodes(:, 1));
    targetPaths = names(endNodes(:, 2));
else
    endNodes = string(endNodes);
    sourcePaths = endNodes(:, 1);
    targetPaths = endNodes(:, 2);
end

edgeKinds = repmat("dependency", numedges(graph), 1);
edgeDetails = repmat("", numedges(graph), 1);
edgeVariables = string(graph.Edges.Properties.VariableNames);
kindVariable = firstMatchingVariable(edgeVariables, ["Type", "DependencyType", "Kind"]);
detailVariable = firstMatchingVariable(edgeVariables, ["Details", "Detail", "Description"]);
if strlength(kindVariable) > 0
    edgeKinds = safeStringColumn(graph.Edges.(kindVariable), numedges(graph), "dependency");
end
if strlength(detailVariable) > 0
    edgeDetails = safeStringColumn(graph.Edges.(detailVariable), numedges(graph), "");
end

[nodes, idByPath] = makeNodes(names, rootPath);
edges = makeEdges(sourcePaths, targetPaths, edgeKinds, edgeDetails, idByPath);
[nodes, edges] = applyScope(nodes, edges, logical(options.includeExternal), logical(options.includeIsolated));
products = emptyProducts();
problems = problemsForNodes(nodes);
projectName = string(project.Name);
end

function [nodes, edges, products, problems] = analyzeFolder(rootPath, options)
report = analyzeMatlabFileDependencies(rootPath, ...
    IncludeExternal=logical(options.includeExternal), ...
    IncludeIsolated=logical(options.includeIsolated), ...
    MaximumFiles=double(options.maximumFiles), ...
    Render=false, Print=false);
nodes = nodesFromStandaloneReport(report.nodes);
edges = edgesFromStandaloneReport(report.edges);
products = productsFromStandaloneReport(report.products);
problems = problemsFromStandaloneReport(report.problems);
end

function nodes = nodesFromStandaloneReport(nodeTable)
prototype = struct("id", "", "label", "", "path", "", "relativePath", "", ...
    "extension", "", "kind", "", "external", false, "missing", false);
nodes = repmat(prototype, height(nodeTable), 1);
for index = 1:height(nodeTable)
    filePath = normalizePath(nodeTable.AbsolutePath(index));
    nodes(index) = struct( ...
        "id", filePath, ...
        "label", string(nodeTable.Label(index)), ...
        "path", filePath, ...
        "relativePath", string(nodeTable.RelativePath(index)), ...
        "extension", lower(string(nodeTable.Extension(index))), ...
        "kind", string(nodeTable.Kind(index)), ...
        "external", logical(nodeTable.External(index)), ...
        "missing", logical(nodeTable.Missing(index)));
end
end

function edges = edgesFromStandaloneReport(edgeTable)
prototype = struct("id", "", "source", "", "target", "", "kind", "", "details", "");
edges = repmat(prototype, height(edgeTable), 1);
for index = 1:height(edgeTable)
    edges(index) = struct( ...
        "id", "edge-" + index, ...
        "source", normalizePath(edgeTable.SourcePath(index)), ...
        "target", normalizePath(edgeTable.TargetPath(index)), ...
        "kind", string(edgeTable.Kind(index)), ...
        "details", string(edgeTable.Details(index)));
end
end

function products = productsFromStandaloneReport(productTable)
prototype = struct("name", "", "version", "", "productNumber", "", ...
    "certain", false, "introducedBy", "");
products = repmat(prototype, height(productTable), 1);
for index = 1:height(productTable)
    products(index) = struct( ...
        "name", string(productTable.Product(index)), ...
        "version", string(productTable.Version(index)), ...
        "productNumber", string(productTable.ProductNumber(index)), ...
        "certain", logical(productTable.Certain(index)), ...
        "introducedBy", normalizePath(productTable.AbsoluteSource(index)));
end
end

function problems = problemsFromStandaloneReport(problemTable)
problems = repmat(struct("file", "", "message", "", "severity", "warning"), ...
    height(problemTable), 1);
for index = 1:height(problemTable)
    problems(index) = struct( ...
        "file", normalizePath(problemTable.AbsoluteSource(index)), ...
        "message", string(problemTable.Message(index)), ...
        "severity", string(problemTable.Severity(index)));
end
end

function [nodes, idByPath] = makeNodes(paths, rootPath)
paths = unique(paths(:), "stable");
prototype = struct("id", "", "label", "", "path", "", "relativePath", "", ...
    "extension", "", "kind", "", "external", false, "missing", false);
nodes = repmat(prototype, numel(paths), 1);
idByPath = dictionary(strings(0, 1), strings(0, 1));
for index = 1:numel(paths)
    filePath = normalizePath(paths(index));
    [~, name, extension] = fileparts(filePath);
    relativePath = makeRelative(filePath, rootPath);
    external = relativePath == filePath;
    id = filePath;
    nodes(index) = struct( ...
        "id", id, ...
        "label", name + extension, ...
        "path", filePath, ...
        "relativePath", relativePath, ...
        "extension", lower(extension), ...
        "kind", kindForExtension(extension), ...
        "external", external, ...
        "missing", ~isfile(filePath));
    idByPath(pathKey(filePath)) = id;
end
end

function edges = makeEdges(sourcePaths, targetPaths, kinds, details, idByPath)
prototype = struct("id", "", "source", "", "target", "", "kind", "", "details", "");
edgeCount = numel(sourcePaths);
edges = repmat(prototype, edgeCount, 1);
keep = false(edgeCount, 1);
for index = 1:edgeCount
    sourceKey = pathKey(sourcePaths(index));
    targetKey = pathKey(targetPaths(index));
    if isKey(idByPath, sourceKey) && isKey(idByPath, targetKey) && sourceKey ~= targetKey
        edges(index) = struct( ...
            "id", "edge-" + index, ...
            "source", idByPath(sourceKey), ...
            "target", idByPath(targetKey), ...
            "kind", kinds(index), ...
            "details", details(index));
        keep(index) = true;
    end
end
edges = edges(keep);
if ~isempty(edges)
    pairs = string({edges.source}).' + "\n" + string({edges.target}).' + "\n" + string({edges.kind}).';
    [~, uniqueIndices] = unique(pairs, "stable");
    edges = edges(uniqueIndices);
    for index = 1:numel(edges)
        edges(index).id = "edge-" + index;
    end
end
end

function [nodes, edges] = applyScope(nodes, edges, includeExternal, includeIsolated)
keepNodes = true(numel(nodes), 1);
if ~includeExternal
    keepNodes = ~[nodes.external].';
end
allowedIds = string({nodes(keepNodes).id});
if isempty(edges)
    keepEdges = false(0, 1);
else
    keepEdges = ismember(string({edges.source}), allowedIds) & ismember(string({edges.target}), allowedIds);
end
edges = edges(keepEdges);
if ~includeIsolated
    connectedIds = unique([string({edges.source}), string({edges.target})]);
    keepNodes = keepNodes & ismember(string({nodes.id}).', connectedIds);
end
nodes = nodes(keepNodes);
end

function problems = problemsForNodes(nodes)
problems = emptyProblems();
for index = 1:numel(nodes)
    if nodes(index).missing
        problems(end + 1, 1) = makeProblem(nodes(index).path, "Referenced file does not exist.", "warning"); %#ok<AGROW>
    end
end
end

function problem = makeProblem(file, message, severity)
problem = struct("file", string(file), "message", string(message), "severity", string(severity));
end

function values = safeStringColumn(column, count, defaultValue)
try
    values = string(column);
    values = values(:);
catch
    values = repmat(string(defaultValue), count, 1);
end
if numel(values) ~= count
    values = repmat(string(defaultValue), count, 1);
end
end

function match = firstMatchingVariable(variables, candidates)
match = "";
for candidate = candidates
    index = find(strcmpi(variables, candidate), 1);
    if ~isempty(index)
        match = variables(index);
        return;
    end
end
end

function result = samePath(paths, reference)
if ispc
    result = strcmpi(normalizePath(paths), normalizePath(reference));
else
    result = normalizePath(paths) == normalizePath(reference);
end
end

function key = pathKey(filePath)
key = normalizePath(filePath);
if ispc
    key = lower(key);
end
end

function normalized = normalizePath(filePath)
normalized = replace(string(filePath), "\", "/");
while contains(normalized, "//")
    normalized = replace(normalized, "//", "/");
end
if strlength(normalized) > 1
    normalized = strip(normalized, "right", "/");
end
end

function relative = makeRelative(filePath, rootPath)
filePath = normalizePath(filePath);
rootPath = normalizePath(rootPath);
prefix = rootPath + "/";
if ispc
    inRoot = startsWith(lower(filePath), lower(prefix));
else
    inRoot = startsWith(filePath, prefix);
end
if inRoot
    relative = extractAfter(filePath, strlength(prefix));
elseif samePath(filePath, rootPath)
    relative = ".";
else
    relative = filePath;
end
end

function kind = kindForExtension(extension)
switch lower(string(extension))
    case {".slx", ".mdl"}
        kind = "Simulink model";
    case ".mlx"
        kind = "live script";
    case ".mlapp"
        kind = "MATLAB app";
    case ".p"
        kind = "protected MATLAB code";
    case ".m"
        kind = "MATLAB code";
    otherwise
        kind = "file";
end
end

function result = isProjectFolder(rootPath)
result = ~isempty(dir(fullfile(rootPath, "*.prj"))) || ...
    isfolder(fullfile(rootPath, "resources", "project")) || ...
    isfile(fullfile(rootPath, ".SimulinkProject"));
end

function folder = canonicalFolder(folder)
if ~isfolder(folder)
    error("MatlabViz:RootNotFound", "Analysis root does not exist: %s", folder);
end
originalFolder = pwd;
cleanup = onCleanup(@() cd(originalFolder));
cd(folder);
folder = string(pwd);
end

function products = emptyProducts()
products = repmat(struct("name", "", "version", "", "productNumber", "", ...
    "certain", false, "introducedBy", ""), 0, 1);
end

function problems = emptyProblems()
problems = repmat(struct("file", "", "message", "", "severity", "warning"), 0, 1);
end
