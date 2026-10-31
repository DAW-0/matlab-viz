import assert from "node:assert/strict";
import test from "node:test";
import { MATLAB_ERROR_MARKER, matlabFailureMessage } from "../src/core/matlabErrors";

test("MATLAB exceptions retain their identifier and full actionable message", () => {
  const marker = MATLAB_ERROR_MARKER + JSON.stringify({ identifier: "MatlabViz:MaximumFilesExceeded",
    message: "The selected root contains 14 analyzable files, exceeding MaximumFiles=10.\nSelect a smaller folder." });
  assert.equal(matlabFailureMessage("startup\n", `${marker}\r\nError in MatlabVizAnalyze`, 1),
    "MATLAB dependency analysis failed [MatlabViz:MaximumFilesExceeded]: The selected root contains 14 analyzable files, exceeding MaximumFiles=10.\nSelect a smaller folder.");
});

test("structured error parsing tolerates invalid markers and Unicode paths", () => {
  const marker = MATLAB_ERROR_MARKER + JSON.stringify({ identifier: "", message: "Cannot read C:\\fixture_é_Δ\\main.m" });
  assert.equal(matlabFailureMessage(marker, `${MATLAB_ERROR_MARKER}invalid`, 1),
    "MATLAB dependency analysis failed: Cannot read C:\\fixture_é_Δ\\main.m");
});

test("unstructured process failures retain an exit-code fallback", () => {
  assert.match(matlabFailureMessage("", "launch failed", 7), /exited with code 7/);
  assert.match(matlabFailureMessage(`${MATLAB_ERROR_MARKER}{}`, "", null), /exited with code null/);
});
