function createMatlabVizHostFixtures(outputDirectory)
%CREATEMATLABVIZHOSTFIXTURES Prepare isolated installed-host regression inputs.
arguments
    outputDirectory (1, 1) string
end
if isfolder(outputDirectory)
    error("MatlabViz:FixtureExists", "Choose a new fixture output directory: %s", outputDirectory);
end
mkdir(outputDirectory);
names = ["entry", "middle", "leaf", "isolated"];
assignments = ["value = middle();", "value = leaf();", "value = 42;", "value = 1;"];
folders = ["project", "missing-project"];
for fixtureIndex = 1:numel(folders)
    root = fullfile(outputDirectory, folders(fixtureIndex));
    mkdir(root);
    for fileIndex = 1:numel(names)
        writelines(["function value = " + names(fileIndex), assignments(fileIndex), "end"], ...
            fullfile(root, names(fileIndex) + ".m"));
    end
    project = matlab.project.createProject(Folder=root, Name="MATLAB Viz Host " + fixtureIndex);
    projectCleanup = onCleanup(@() closeIfOpen(project));
    addFile(project, fullfile(root, names + ".m"));
    addPath(project, root);
    updateDependencies(project);
    close(project);
    clear projectCleanup
    if folders(fixtureIndex) == "missing-project"
        movefile(fullfile(root, "leaf.m"), fullfile(root, "leaf.m.disabled"));
    end
end
fprintf("HOST_FIXTURES=%s\n", outputDirectory);
end

function closeIfOpen(project)
try
    activeProject = currentProject;
    if ~isempty(activeProject) && activeProject.RootFolder == project.RootFolder
        close(project);
    end
catch
    % Normal setup has already closed the project.
end
end
