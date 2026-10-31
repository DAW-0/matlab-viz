import * as path from "node:path";
import { findMatlabCallCandidates, findMatlabDeclarations, matlabCodeMask, type CallCandidate } from "./matlabSyntax";

export interface FunctionCandidate {
  name: string;
  path: string;
}

const normalized = (value: string): string => value.replaceAll("\\", "/");
const sameFolder = (a: string, b: string): boolean => process.platform === "win32"
  ? normalized(a).toLowerCase() === normalized(b).toLowerCase() : normalized(a) === normalized(b);

/** Namespace segments immediately enclosing the function, not arbitrary receiver names. */
function namespace(file: string): string {
  const folders = normalized(path.dirname(file)).split("/");
  const names: string[] = [];
  for (let index = folders.length - 1; index >= 0 && folders[index]!.startsWith("+"); index--) names.unshift(folders[index]!.slice(1));
  return names.join(".");
}

/** Conservative lexical resolution; never guess MATLAB path order between duplicates. */
export function resolveFunctionReference<T extends FunctionCandidate>(name: string, callerPath: string, candidates: T[]): { target?: T; ambiguous: boolean } {
  const simple = name.slice(name.lastIndexOf(".") + 1);
  const named = candidates.filter((candidate) => candidate.name === simple);
  const choose = (values: T[]) => ({ target: values.length === 1 ? values[0] : undefined, ambiguous: values.length > 1 });
  const primary = (candidate: T) => path.basename(candidate.path, path.extname(candidate.path)) === candidate.name;
  const privateFolder = (candidate: T) => path.basename(path.dirname(candidate.path)).toLowerCase() === "private";
  const callerFolder = path.dirname(callerPath);
  if (name.includes(".")) {
    const qualifier = name.slice(0, name.lastIndexOf("."));
    return choose(named.filter((candidate) => primary(candidate) && !privateFolder(candidate) && namespace(candidate.path) === qualifier));
  }
  const local = named.filter((candidate) => sameFolder(candidate.path, callerPath));
  if (local.length) return choose(local);
  const privateFunctions = named.filter((candidate) => primary(candidate) && privateFolder(candidate)
    && sameFolder(path.dirname(path.dirname(candidate.path)), callerFolder));
  if (privateFunctions.length) return choose(privateFunctions);
  const ordinary = named.filter((candidate) => primary(candidate) && !privateFolder(candidate)
    && !normalized(candidate.path).split("/").some((folder) => folder.startsWith("@") || folder.startsWith("+")));
  const siblings = ordinary.filter((candidate) => sameFolder(path.dirname(candidate.path), callerFolder));
  return choose(siblings.length ? siblings : ordinary);
}

/** Function-style uses, handles, and simple command-form statements; no declarations. */
export function findMatlabReferenceCandidates(source: string): CallCandidate[] {
  const declarations = new Set(findMatlabDeclarations(source).map((item) => item.nameOffset));
  const candidates = findMatlabCallCandidates(source).filter((item) => !declarations.has(item.nameOffset));
  const seen = new Set(candidates.map((item) => item.nameOffset));
  const mask = matlabCodeMask(source);
  const excluded = new Set(["function", "classdef", "if", "elseif", "else", "end", "for", "parfor", "while", "switch", "case", "otherwise", "try", "catch", "return", "break", "continue", "arguments", "methods", "properties", "events", "enumeration", "global", "persistent", "import", "spmd"]);
  const command = /(?:^|[;\n])([ \t]*)([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)([^\r\n;]*)/g;
  for (let match = command.exec(source); match; match = command.exec(source)) {
    const name = match[2]!;
    const offset = match.index + (match[0].startsWith(";") || match[0].startsWith("\n") ? 1 : 0) + match[1]!.length;
    const rest = match[3]!.trimStart();
    if (mask[offset] !== 1 || excluded.has(name.toLowerCase()) || /^[=(.[{}+*/\\^:<>~&|'-]/.test(rest)) continue;
    const nameOffset = offset + name.lastIndexOf(".") + 1;
    if (!seen.has(nameOffset)) { seen.add(nameOffset); candidates.push({ name, nameOffset }); }
  }
  return candidates.sort((a, b) => a.nameOffset - b.nameOffset);
}

/** Obvious variable bindings make function-name inference unsafe (including indexing). */
export function matlabBoundNames(source: string): Set<string> {
  const mask = matlabCodeMask(source);
  const code = source.split("").map((character, index) => mask[index] ? character : " ").join("");
  const bound = new Set<string>();
  const add = (value: string) => { for (const name of value.match(/[A-Za-z]\w*/g) ?? []) bound.add(name); };
  const header = /^\s*function\b(?:\s+(\[[^\]\r\n]*\]|[A-Za-z]\w*)\s*=)?\s*([A-Za-z]\w*)\s*(?:\(([^\r\n)]*)\))?/gm;
  for (let match = header.exec(code); match; match = header.exec(code)) { add(match[1] ?? ""); add(match[3] ?? ""); }
  const assignments = /(?:^|[;,\n])\s*(?:\[([^\]\r\n]+)\]|([A-Za-z]\w*)(?:\s*(?:\([^\r\n=]*\)|\{[^\r\n=]*\}))?)\s*=(?!=)/g;
  for (let match = assignments.exec(code); match; match = assignments.exec(code)) add(match[1] ?? match[2] ?? "");
  const variables = /\b(?:for|parfor|global|persistent|catch)\s+([A-Za-z]\w*)/g;
  for (let match = variables.exec(code); match; match = variables.exec(code)) add(match[1]!);
  const shared = /\b(?:global|persistent)\s+([^;\r\n]+)/g;
  for (let match = shared.exec(code); match; match = shared.exec(code)) add(match[1]!);
  return bound;
}
