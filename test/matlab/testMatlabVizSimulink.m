function tests = testMatlabVizSimulink
%TESTMATLABVIZSIMULINK Licensed, generated-model regression tests.
%   Tests never compile/simulate a model or inspect WEST source. Model binary
%   fixtures are generated locally, not committed or shipped in the VSIX.
tests = functiontests(localfunctions);
end

function setupOnce(testCase)
assumeFalse(testCase, isempty(ver("simulink")), "Simulink is not installed; model coverage was not exercised.");
assumeTrue(testCase, logical(license("test", "Simulink")), "A Simulink license is unavailable; model coverage was not exercised.");
repository = fileparts(fileparts(fileparts(mfilename("fullpath"))));
addpath(fullfile(repository, "matlab"));
destination = string(tempname);
fixture = createMatlabVizSimulinkFixtures(destination);
testCase.TestData.destination = destination;
testCase.TestData.fixture = fixture;
testCase.TestData.originalBytes = arrayfun(@readBytes, fixture.files, UniformOutput=false);
end

function teardown(testCase)
fixture = testCase.TestData.fixture;
closeFixtureModels(fixture);
for index = 1:numel(fixture.files)
    verifyEqual(testCase, readBytes(fixture.files(index)), testCase.TestData.originalBytes{index}, ...
        "Analysis changed a model, dictionary, or source file: " + fixture.files(index));
end
end

function teardownOnce(testCase)
if ~isfield(testCase.TestData, "destination"), return; end
folder = testCase.TestData.destination;
% Only remove the explicitly generated temp fixture, never a repository root.
if startsWith(folder, string(tempdir), IgnoreCase=ispc) && strlength(folder) > strlength(string(tempdir)) && isfolder(folder)
    rmdir(folder, "s");
end
end

function testProjectMatchesNativeGraphWithParameterAnalysisOffAndOn(testCase)
fixture = testCase.TestData.fixture;
for enabled = [false, true]
    project = openProject(fixture.root, Prompt=false);
    updateDependencies(project, ReanalyzeAll=true, AnalyzeReferences=false, AnalyzeAddOns=false, AnalyzeModelParameters=enabled);
    native = project.Dependencies; expected = nativePairs(native); close(project);
    graph = analyzeFixture(testCase, mode="project", parameters=enabled);
    verifyEqual(testCase, sort(bridgePairs(graph)), sort(expected));
    verifyEqual(testCase, numel(graph.nodes), 8);
    verifyEqual(testCase, numel(graph.edges), 5 + double(enabled));
    verifyTrue(testCase, hasEdge(graph, fixture.top, fixture.child));
    verifyTrue(testCase, hasEdge(graph, fixture.top, fixture.library));
    verifyTrue(testCase, hasEdge(graph, fixture.top, fixture.dictionary));
    verifyTrue(testCase, hasEdge(graph, fixture.top, fixture.callback));
    verifyEqual(testCase, hasEdge(graph, fixture.top, fixture.parameter), enabled);
    verifyTrue(testCase, hasEdge(graph, fixture.legacy, fixture.child));
    verifyEmpty(testCase, graph.problems);
    dictionary = graph.nodes(endsWith(string({graph.nodes.path}), "/matlabVizSimData.sldd"));
    verifyEqual(testCase, string(dictionary.kind), "Simulink data dictionary");
end
end

function testFolderReadsOnlySavedDirectModelReferencesWithoutLoading(testCase)
fixture = testCase.TestData.fixture;
closeFixtureModels(fixture); before = markerBytes(fixture);
report = analyzeMatlabFileDependencies(fixture.root, Print=false, Render=false);
verifyEqual(testCase, height(report.nodes), 7); verifyEqual(testCase, height(report.edges), 2);
verifyTrue(testCase, all(report.edges.Kind == "saved model reference"));
verifyTrue(testCase, all(contains(report.edges.Details, "Simulink.MDLInfo")));
verifyEqual(testCase, sort(report.edges.Source), sort(["models/matlabVizSimTop.slx"; "models/matlabVizSimLegacy.mdl"]));
verifyTrue(testCase, all(endsWith(report.edges.TargetPath, "matlabVizSimChild.slx")));
verifyEqual(testCase, nnz(report.problems.Identifier == "MatlabViz:PartialSimulinkFolderAnalysis"), 4);
for file = [fixture.top, fixture.child, fixture.library, fixture.legacy]
    [~, name] = fileparts(file); verifyFalse(testCase, bdIsLoaded(name));
end
verifyEqual(testCase, markerBytes(fixture), before, "Folder metadata scanning executed fixture code.");
end

function testSelectedFolderLookupAndExternalFiltering(testCase)
fixture = testCase.TestData.fixture;
originalPath = path;
included = analyzeMatlabFileDependencies(fixture.models, SearchRoots=fixture.support, IncludeExternal=true, MaximumFiles=2, Print=false, Render=false);
verifyEqual(testCase, height(included.nodes), 3); verifyEqual(testCase, height(included.edges), 2);
verifyEqual(testCase, nnz(included.nodes.External), 1);
verifyEqual(testCase, string(path), string(originalPath));
excluded = analyzeMatlabFileDependencies(fixture.models, SearchRoots=fixture.support, IncludeExternal=false, Print=false, Render=false);
verifyEqual(testCase, height(excluded.nodes), 2); verifyEmpty(testCase, excluded.edges);
verifyEqual(testCase, string(path), string(originalPath));
end

function testFolderAndBridgeAgreeAndDoNotInventBroaderModelEdges(testCase)
fixture = testCase.TestData.fixture;
report = analyzeMatlabFileDependencies(fixture.root, Print=false, Render=false);
graph = analyzeFixture(testCase, mode="folder");
expected = normalize(report.edges.SourcePath) + " -> " + normalize(report.edges.TargetPath);
verifyEqual(testCase, sort(bridgePairs(graph)), sort(expected));
verifyEqual(testCase, numel(graph.problems), 4);
verifyFalse(testCase, hasEdge(graph, fixture.top, fixture.library));
verifyFalse(testCase, hasEdge(graph, fixture.top, fixture.dictionary));
verifyFalse(testCase, hasEdge(graph, fixture.top, fixture.parameter));
verifyFalse(testCase, hasEdge(graph, fixture.top, fixture.callback));
end

function testModelScopeNoticesSurviveIsolatedFilteringAndExports(testCase)
fixture = testCase.TestData.fixture;
output = fullfile(testCase.TestData.destination, "artifacts");
report = analyzeMatlabFileDependencies(fixture.root, IncludeIsolated=false, ...
    OutputDirectory=output, Print=false, Render=false);
verifyEqual(testCase, numnodes(report.graph), 3); verifyEqual(testCase, numedges(report.graph), 2);
verifyEqual(testCase, height(report.problems), 4);
saved = load(report.artifacts.mat, "report");
verifyEqual(testCase, saved.report.edges, report.edges);
% All-string diagnostic rows can look like an extra units/header row to
% MATLAB's automatic import inference. The CSV contract has exactly one header.
import = detectImportOptions(report.artifacts.problemsCsv, Delimiter=",");
import.DataLines = [2, Inf]; import.VariableNamesLine = 1;
import.VariableUnitsLine = 0; import.VariableDescriptionsLine = 0;
verifyEqual(testCase, height(readtable(report.artifacts.problemsCsv, import)), 4);
verifyTrue(testCase, contains(fileread(report.artifacts.dot), "matlabVizSimChild.slx"));
end

function testMissingReferenceWarnsWithoutGuessingAndRestores(testCase)
fixture = testCase.TestData.fixture; closeFixtureModels(fixture);
disabled = fixture.child + ".disabled";
assert(startsWith(fixture.child, fixture.root + filesep));
movefile(fixture.child, disabled); restore = onCleanup(@() movefile(disabled, fixture.child));
report = analyzeMatlabFileDependencies(fixture.root, Print=false, Render=false);
verifyEqual(testCase, nnz(report.problems.Identifier == "MatlabViz:UnresolvedModelReference"), 2);
verifyEmpty(testCase, report.edges);
verifyFalse(testCase, any(endsWith(report.nodes.AbsolutePath, "matlabVizSimChild.slx")));
clear restore;
restored = analyzeMatlabFileDependencies(fixture.root, Print=false, Render=false);
verifyEqual(testCase, height(restored.edges), 2);
verifyFalse(testCase, any(restored.problems.Identifier == "MatlabViz:UnresolvedModelReference"));
end

function testProjectMissingTrackedModelAndRecovery(testCase)
fixture = testCase.TestData.fixture;
analyzeFixture(testCase, mode="project"); closeFixtureModels(fixture);
disabled = fixture.child + ".disabled";
movefile(fixture.child, disabled); restore = onCleanup(@() movefile(disabled, fixture.child));
graph = analyzeFixture(testCase, mode="project");
verifyTrue(testCase, any([graph.nodes.missing]));
verifyTrue(testCase, any(endsWith(string({graph.problems.file}), "/matlabVizSimChild.slx")));
clear restore;
graph = analyzeFixture(testCase, mode="project");
verifyFalse(testCase, any([graph.nodes.missing])); verifyEmpty(testCase, graph.problems);
end

function testAddOnOptionPassthroughKeepsLocalModelEdges(testCase)
% This exercises the option, not installed third-party add-on discovery. Do not
% install anything into a user's MATLAB profile merely to claim that coverage.
without = analyzeFixture(testCase, mode="project", addons=false);
with = analyzeFixture(testCase, mode="project", addons=true);
verifyEqual(testCase, sort(bridgePairs(with)), sort(bridgePairs(without)));
end

function testSavedSubsystemReferenceWithoutLoading(testCase)
folder = fullfile(testCase.TestData.destination, "subsystem-reference"); mkdir(folder);
parent = "matlabVizSubsystemOwner"; subsystem = "matlabVizSavedSubsystem";
originalPath = path; pathCleanup = onCleanup(@() path(originalPath)); addpath(folder);
verifyFalse(testCase, bdIsLoaded(parent)); verifyFalse(testCase, bdIsLoaded(subsystem));
modelsCleanup = onCleanup(@() closeLocalModels([parent, subsystem]));
new_system(subsystem, "Subsystem"); save_system(subsystem, fullfile(folder, subsystem + ".slx"));
new_system(parent);
add_block("built-in/SubSystem", parent + "/Referenced", "ReferencedSubsystem", subsystem);
save_system(parent, fullfile(folder, parent + ".slx")); closeLocalModels([parent, subsystem]);
report = analyzeMatlabFileDependencies(folder, Print=false, Render=false);
verifyEqual(testCase, height(report.edges), 1);
verifyTrue(testCase, endsWith(report.edges.SourcePath, parent + ".slx"));
verifyTrue(testCase, endsWith(report.edges.TargetPath, subsystem + ".slx"));
verifyFalse(testCase, bdIsLoaded(parent)); verifyFalse(testCase, bdIsLoaded(subsystem));
end

function graph = analyzeFixture(testCase, options)
arguments
    testCase
    options.mode (1, 1) string
    options.parameters (1, 1) logical = false
    options.addons (1, 1) logical = false
end
settings = struct("mode", options.mode, "includeExternal", false, "includeIsolated", true, "maximumFiles", 5000, ...
    "reanalyzeAll", true, "analyzeReferences", false, "analyzeAddOns", options.addons, "analyzeModelParameters", options.parameters);
settingsPath = fullfile(testCase.TestData.destination, "options.json");
output = fullfile(testCase.TestData.destination, "graph.json");
writelines(jsonencode(settings), settingsPath);
MatlabVizAnalyze(testCase.TestData.fixture.root, output, settingsPath);
raw = fileread(output); graph = jsondecode(raw);
for field = ["nodes", "edges", "problems", "products"]
    verifyNotEmpty(testCase, regexp(raw, '"' + field + '"\s*:\s*\[', "once"));
end
end

function result = hasEdge(graph, source, target)
result = any(normalize(string({graph.edges.source})) == normalize(source) & normalize(string({graph.edges.target})) == normalize(target));
end

function pairs = bridgePairs(graph)
pairs = unique(normalize(string({graph.edges.source}).') + " -> " + normalize(string({graph.edges.target}).'));
end

function pairs = nativePairs(graph)
ends = graph.Edges.EndNodes;
if isnumeric(ends), names = string(graph.Nodes.Name); ends = names(ends); else, ends = string(ends); end
pairs = unique(normalize(ends(:, 1)) + " -> " + normalize(ends(:, 2)));
end

function value = normalize(value)
value = replace(string(value), "\", "/");
if ispc, value = lower(value); end
end

function bytes = readBytes(file)
handle = fopen(file, "rb"); assert(handle >= 0); cleanup = onCleanup(@() fclose(handle));
bytes = fread(handle, Inf, "*uint8");
end

function counts = markerBytes(fixture)
files = dir(fullfile(fixture.support, "*-executed.flag"));
counts = sum([files.bytes]);
end

function closeFixtureModels(fixture)
for file = [fixture.top, fixture.child, fixture.library, fixture.legacy]
    [~, name] = fileparts(file); if bdIsLoaded(name), close_system(name, 0); end
end
end

function closeLocalModels(names)
for name = names
    if bdIsLoaded(name), close_system(name, 0); end
end
end
