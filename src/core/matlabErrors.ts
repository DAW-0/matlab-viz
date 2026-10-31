export const MATLAB_ERROR_MARKER = "MATLABVIZ_ERROR:";

/** Recover MATLAB's original exception without hiding it behind an exit code. */
export function matlabFailureMessage(stdout: string, stderr: string, code: number | null): string {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/);
  for (const line of lines.reverse()) {
    const marker = line.indexOf(MATLAB_ERROR_MARKER);
    if (marker < 0) continue;
    try {
      const error: unknown = JSON.parse(line.slice(marker + MATLAB_ERROR_MARKER.length));
      if (!error || typeof error !== "object") continue;
      const { message, identifier } = error as Record<string, unknown>;
      if (typeof message !== "string" || !message.trim()) continue;
      const label = typeof identifier === "string" && identifier ? ` [${identifier}]` : "";
      return `MATLAB dependency analysis failed${label}: ${message.trim()}`;
    } catch {
      // Preserve the exit-code fallback for launch failures and older bridges.
    }
  }
  return `MATLAB dependency analysis exited with code ${code}. See the MATLAB Viz output log.`;
}
