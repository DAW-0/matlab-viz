function tests = testMatlabVizAnalyze
%TESTMATLABVIZANALYZE Regression tests for the extension's JSON wire format.
tests = functiontests(localfunctions);
end

function setupOnce(~)
repositoryRoot = fileparts(fileparts(fileparts(mfilename("fullpath"))));
addpath(fullfile(repositoryRoot, "matlab"));
end

function setup(testCase)
fixture = string(tempname);
mkdir(fixture);
testCase.TestData.fixture = fixture;
end

function teardown(testCase)
fixture = testCase.TestData.fixture;
% Delete only this test's explicitly generated temporary directory.
if startsWith(fixture, string(tempdir), IgnoreCase=ispc) && ...
        strlength(fixture) > strlength(string(tempdir)) && isfolder(fixture)
    rmdir(fixture, "s");
end
end

function testSingletonNodeAndProduct(testCase)
fixture = testCase.TestData.fixture;
writelines("answer = 42;", fullfile(fixture, "isolated.m"));
[document, raw] = analyzeFixture(fixture);
verifyArrayCollections(testCase, raw);
verifyEqual(testCase, numel(document.nodes), 1);
verifyEqual(testCase, numel(document.edges), 0);
verifyEqual(testCase, numel(document.products), 1);
verifyEqual(testCase, numel(document.problems), 0);
end

function testSingletonEdge(testCase)
fixture = testCase.TestData.fixture;
writeFunction(fixture, "main", "value = helper();");
writeFunction(fixture, "helper", "value = 42;");
[document, raw] = analyzeFixture(fixture);
verifyArrayCollections(testCase, raw);
verifyEqual(testCase, numel(document.nodes), 2);
verifyEqual(testCase, numel(document.edges), 1);
verifyTrue(testCase, endsWith(document.edges.source, "/main.m"));
verifyTrue(testCase, endsWith(document.edges.target, "/helper.m"));
end

function testSingletonWarning(testCase)
fixture = testCase.TestData.fixture;
writeFunction(fixture, "broken", "value = ;");
[document, raw] = analyzeFixture(fixture);
verifyArrayCollections(testCase, raw);
verifyEqual(testCase, numel(document.nodes), 1);
verifyEqual(testCase, numel(document.problems), 1);
verifyEqual(testCase, string(document.problems.severity), "warning");
verifyTrue(testCase, endsWith(document.problems.file, "/broken.m"));
end

function testEmptyGraphCollections(testCase)
fixture = testCase.TestData.fixture;
writelines("answer = 42;", fullfile(fixture, "isolated.m"));
[document, raw] = analyzeFixture(fixture, includeIsolated=false);
verifyArrayCollections(testCase, raw);
verifyEqual(testCase, numel(document.nodes), 0);
verifyEqual(testCase, numel(document.edges), 0);
end

function testProjectMissingFileHasSingletonEdgeAndWarning(testCase)
fixture = testCase.TestData.fixture;
writeFunction(fixture, "entry", "value = middle();");
writeFunction(fixture, "middle", "value = leaf();");
writeFunction(fixture, "leaf", "value = 42;");
writeFunction(fixture, "isolated", "value = 1;");
project = matlab.project.createProject(Folder=fixture);
projectCleanup = onCleanup(@() closeIfOpen(project));
addFile(project, fullfile(fixture, ["entry.m", "middle.m", "leaf.m", "isolated.m"]));
addPath(project, fixture);
updateDependencies(project);
close(project);
movefile(fullfile(fixture, "leaf.m"), fullfile(fixture, "leaf.m.disabled"));
[document, raw] = analyzeFixture(fixture, mode="project");
verifyArrayCollections(testCase, raw);
verifyEqual(testCase, numel(document.nodes), 4);
verifyEqual(testCase, numel(document.edges), 1);
verifyEqual(testCase, numel(document.problems), 1);
verifyEqual(testCase, nnz([document.nodes.missing]), 1);
verifyTrue(testCase, endsWith(document.problems.file, "/leaf.m"));
end

function testUnicodePathPreserved(testCase)
fixture = fullfile(testCase.TestData.fixture, "fixture_é_Δ");
mkdir(fixture);
writeFunction(fixture, "helper", "value = 42;");
[document, raw] = analyzeFixture(fixture);
verifyArrayCollections(testCase, raw);
verifyTrue(testCase, contains(string(document.nodes.path), "fixture_é_Δ"));
end

function testStandaloneVectorAndRasterArtifacts(testCase)
fixture = testCase.TestData.fixture;
writeFunction(fixture, "main", "value = helper();");
writeFunction(fixture, "helper", "value = 42;");
output = fullfile(fixture, "output");
report = analyzeMatlabFileDependencies(fixture, OutputDirectory=output, Render=true, Print=false);
artifacts = struct2cell(report.artifacts);
verifyEqual(testCase, numel(artifacts), 9);
verifyTrue(testCase, all(cellfun(@isfile, artifacts)));
verifyEqual(testCase, height(readtable(report.artifacts.nodesCsv)), 2);
verifyEqual(testCase, height(readtable(report.artifacts.edgesCsv)), 1);
saved = load(report.artifacts.mat, "report");
verifyEqual(testCase, numnodes(saved.report.graph), 2);
verifyEqual(testCase, numedges(saved.report.graph), 1);
svg = fileread(report.artifacts.svg);
verifyTrue(testCase, contains(svg, "<svg"));
verifyFalse(testCase, contains(svg, "<image"), "Vector SVG unexpectedly contains an embedded raster image.");
imageInfo = imfinfo(report.artifacts.png);
verifyGreaterThan(testCase, imageInfo.Width, 1000);
verifyGreaterThan(testCase, imageInfo.Height, 500);
end

function [document, raw] = analyzeFixture(fixture, options)
arguments
    fixture (1, 1) string
    options.mode (1, 1) string = "folder"
    options.includeIsolated (1, 1) logical = true
end
settings = struct("mode", options.mode, "includeExternal", false, ...
    "includeIsolated", options.includeIsolated, "maximumFiles", 5000, ...
    "reanalyzeAll", true, "analyzeReferences", false, "analyzeAddOns", false, ...
    "analyzeModelParameters", false);
optionsPath = fullfile(fixture, "analysis-options.json");
outputPath = fullfile(fixture, "analysis-output.json");
writelines(jsonencode(settings), optionsPath);
MatlabVizAnalyze(fixture, outputPath, optionsPath);
raw = fileread(outputPath);
document = jsondecode(raw);
end

function verifyArrayCollections(testCase, raw)
for field = ["nodes", "edges", "products", "problems"]
    pattern = '"' + field + '"\s*:\s*\[';
    verifyNotEmpty(testCase, regexp(raw, pattern, "once"), ...
        "JSON collection must remain an array: " + field);
end
end

function writeFunction(fixture, name, assignment)
writelines(["function value = " + name, assignment, "end"], fullfile(fixture, name + ".m"));
end

function closeIfOpen(project)
try
    activeProject = currentProject;
    if ~isempty(activeProject) && activeProject.RootFolder == project.RootFolder
        close(project);
    end
catch
    % The bridge normally closes its project before teardown.
end
end
