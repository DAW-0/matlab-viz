# Security policy

Please report security issues privately to the repository owner rather than opening a public issue. A dedicated security email will be added before the first public release.

MatlabViz executes the locally configured MATLAB binary and loads a MATLAB Project when using Project mode. Project startup and shutdown tasks may execute code controlled by that project. Review untrusted projects before analysis, or select folder mode to avoid loading the project.

The extension never downloads or executes code automatically. It does not transmit source code, graph data, file paths, or telemetry.
