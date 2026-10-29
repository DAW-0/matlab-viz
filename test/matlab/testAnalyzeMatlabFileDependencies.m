function tests = testAnalyzeMatlabFileDependencies
%TESTANALYZEMATLABFILEDEPENDENCIES Tests for the public standalone API.
tests = functiontests(localfunctions);
end

function setupOnce(testCase)
repositoryRoot = fileparts(fileparts(fileparts(mfilename("fullpath"))));
addpath(fullfile(repositoryRoot, "matlab"));
testCase.TestData.repositoryRoot = repositoryRoot;
end

function testDirectGraphAndArtifacts(testCase)
fixture = string(tempname);
output = fullfile(fixture, "output");
mkdir(fixture);
cleanup = onCleanup(@() removeFixture(fixture));

writelines([ ...
    "function value = main", ...
    "value = helper();", ...
    "end"], fullfile(fixture, "main.m"));
writelines([ ...
    "function value = helper", ...
    "value = 42;", ...
    "end"], fullfile(fixture, "helper.m"));
writelines("value = 1;", fullfile(fixture, "isolated.m"));

report = analyzeMatlabFileDependencies(fixture, ...
    OutputDirectory=output, Render=false, Print=false);

verifyEqual(testCase, height(report.nodes), 3);
verifyEqual(testCase, height(report.edges), 1);
verifyEqual(testCase, numnodes(report.graph), 3);
verifyEqual(testCase, numedges(report.graph), 1);
verifyEqual(testCase, report.edges.Source, "main.m");
verifyEqual(testCase, report.edges.Target, "helper.m");
verifyTrue(testCase, isfile(report.artifacts.nodesCsv));
verifyTrue(testCase, isfile(report.artifacts.edgesCsv));
verifyTrue(testCase, isfile(report.artifacts.productsCsv));
verifyTrue(testCase, isfile(report.artifacts.problemsCsv));
verifyTrue(testCase, isfile(report.artifacts.errorsCsv));
verifyTrue(testCase, isfile(report.artifacts.dot));
verifyTrue(testCase, isfile(report.artifacts.mat));
verifyEqual(testCase, report.artifacts.svg, "");
verifyEqual(testCase, report.artifacts.png, "");

saved = load(report.artifacts.mat, "report");
verifyEqual(testCase, height(saved.report.nodes), 3);
verifyEqual(testCase, height(saved.report.edges), 1);
end

function testScopeAndIsolatedOptions(testCase)
fixture = string(tempname);
mkdir(fixture);
cleanup = onCleanup(@() removeFixture(fixture));
writelines("value = 1;", fullfile(fixture, "isolated.m"));

report = analyzeMatlabFileDependencies(fixture, ...
    IncludeIsolated=false, Render=false, Print=false);

verifyEqual(testCase, height(report.nodes), 0);
verifyEqual(testCase, height(report.edges), 0);
verifyEqual(testCase, numnodes(report.graph), 0);
end

function removeFixture(fixture)
if isfolder(fixture)
    rmdir(fixture, "s");
end
end
