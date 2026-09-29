/** What the AI integrations sheet can do. Everything happens in this browser. */
import type { AiStatus, AiSummary, ProviderId, TestResult } from "../../shared/ai.ts";
import { aiSummary, choose, recordTest, removeProvider, resolve, status, updateProvider, type ProviderPatch } from "./store.ts";

async function runTest(id: ProviderId): Promise<TestResult> {
  const { testProvider } = await import("./index.ts");
  const test = await testProvider(resolve(id));
  recordTest(id, test.ok);
  return test;
}

export const getAi = async (): Promise<AiStatus> => status();

export async function saveProvider(id: ProviderId, patch: ProviderPatch): Promise<{ status: AiStatus; test: TestResult; ai: AiSummary }> {
  updateProvider(id, patch);
  const test = await runTest(id);
  // A freshly connected provider that works becomes the curator.
  if (test.ok) choose(id);
  return { status: status(), test, ai: aiSummary() };
}

export async function testProvider(id: ProviderId) {
  const test = await runTest(id);
  return { test, status: status(), ai: aiSummary() };
}

export async function disconnectProvider(id: ProviderId) {
  removeProvider(id);
  return { status: status(), ai: aiSummary() };
}

export async function chooseCurator(choice: ProviderId | "lite" | "auto") {
  if (choice !== "lite" && choice !== "auto" && !resolve(choice).configured) throw new Error("Connect this provider first.");
  choose(choice);
  return { status: status(), ai: aiSummary() };
}
