import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as vscode from "vscode";
import { MATLAB_ERROR_MARKER, matlabFailureMessage } from "./core/matlabErrors";
import type { AnalysisOptions, AnalysisResult } from "./model";
import { validateGraph } from "./model";

const MATLAB_MARKER = "MATLABVIZ_RESULT:";

function matlabString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function candidateExecutables(): string[] {
  const configured = vscode.workspace.getConfiguration("matlabViz").get<string>("matlabExecutable", "").trim();
  const candidates = configured ? [configured] : [];
  if (process.platform === "win32") {
    for (const programRoot of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (!programRoot) {
        continue;
      }
      const matlabRoot = path.join(programRoot, "MATLAB");
      if (!fs.existsSync(matlabRoot)) {
        continue;
      }
      const releases = fs.readdirSync(matlabRoot).sort().reverse();
      for (const release of releases) {
        candidates.push(path.join(matlabRoot, release, "bin", "matlab.exe"));
      }
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/MATLAB_R2026b.app/bin/matlab", "/Applications/MATLAB_R2026a.app/bin/matlab");
  }
  candidates.push("matlab");
  return [...new Set(candidates)];
}

export async function findMatlabExecutable(): Promise<string> {
  for (const candidate of candidateExecutables()) {
    if (candidate === "matlab" || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "MATLAB could not be found. Run ‘MATLAB Viz: Configure MATLAB Executable’ and select the MATLAB executable."
  );
}

export async function runMatlabAnalysis(
  rootPath: string,
  helperDirectory: string,
  options: AnalysisOptions,
  token: vscode.CancellationToken,
  output: vscode.OutputChannel
): Promise<AnalysisResult> {
  if (token.isCancellationRequested) throw new vscode.CancellationError();
  const matlab = await findMatlabExecutable();
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "matlabviz-"));
  const outputFile = path.join(temporaryDirectory, "graph.json");
  const optionsFile = path.join(temporaryDirectory, "options.json");
  await fs.promises.writeFile(optionsFile, JSON.stringify(options), "utf8");

  const analysisCommand = [
    `addpath(${matlabString(helperDirectory)})`,
    `MatlabVizAnalyze(${matlabString(rootPath)},${matlabString(outputFile)},${matlabString(optionsFile)})`,
    `fprintf('${MATLAB_MARKER}%s\\n',${matlabString(outputFile)})`
  ].join(";");
  const command = `try;${analysisCommand};catch matlabVizException;`
    + `fprintf(2,'${MATLAB_ERROR_MARKER}%s\\n',jsonencode(struct(`
    + "'identifier',matlabVizException.identifier,'message',matlabVizException.message)));"
    + "rethrow(matlabVizException);end";

  output.appendLine(`[MATLAB Viz] Executable: ${matlab}`);
  output.appendLine(`[MATLAB Viz] Root: ${rootPath}`);
  output.appendLine(`[MATLAB Viz] Backend request: ${options.mode}`);
  output.appendLine(`[MATLAB Viz] Options: ${JSON.stringify(options)}`);

  return await new Promise<AnalysisResult>((resolve, reject) => {
    const child = spawn(matlab, ["-batch", command], {
      cwd: rootPath,
      windowsHide: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    const cancellation = token.onCancellationRequested(() => {
      output.appendLine("[MATLAB Viz] Cancellation requested; stopping MATLAB.");
      child.kill();
    });
    child.stdout.on("data", (data: Buffer) => {
      const text = stdoutDecoder.write(data);
      stdout += text;
      output.append(text);
    });
    child.stderr.on("data", (data: Buffer) => {
      const text = stderrDecoder.write(data);
      stderr += text;
      output.append(text);
    });
    child.on("error", (error) => {
      cancellation.dispose();
      void fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      reject(error);
    });
    child.on("close", async (code) => {
      cancellation.dispose();
      const stdoutTail = stdoutDecoder.end();
      const stderrTail = stderrDecoder.end();
      stdout += stdoutTail;
      stderr += stderrTail;
      if (stdoutTail) output.append(stdoutTail);
      if (stderrTail) output.append(stderrTail);
      try {
        if (token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }
        if (code !== 0) {
          throw new Error(matlabFailureMessage(stdout, stderr, code));
        }
        const raw = await fs.promises.readFile(outputFile, "utf8");
        const graph = validateGraph(JSON.parse(raw));
        output.appendLine(
          `[MATLAB Viz] Completed: files=${graph.nodes.length}, dependencies=${graph.edges.length}, `
          + `notices=${graph.problems.length}, duration=${graph.metadata.durationSeconds.toFixed(1)}s.`
        );
        resolve({ graph, stdout, stderr });
      } catch (error) {
        reject(error);
      } finally {
        await fs.promises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  });
}
