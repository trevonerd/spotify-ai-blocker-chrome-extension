import type { ProgressStatus } from "../../shared/messages";
import type { ExtensionState } from "../../shared/storage";

export function countCsvRows(csv: string | undefined): number | null {
  if (!csv) return null;
  return csv
    .split("\n")
    .slice(1)
    .filter((line) => line.trim()).length;
}

export function formatInteger(value: number): string {
  return value.toLocaleString();
}

export function getLastRunText(
  state: Pick<ExtensionState, "lastRunAt" | "lastRunCount">,
  now = new Date(),
): { text: string; isFresh: boolean } {
  if (!state.lastRunAt) {
    return { text: "Never run yet", isFresh: false };
  }

  const today = now.toISOString().slice(0, 10);
  if (state.lastRunAt !== today) {
    return { text: `Last run: ${state.lastRunAt}`, isFresh: false };
  }

  return {
    text: `Last run: today${state.lastRunCount ? ` · +${state.lastRunCount} new` : " · up to date"}`,
    isFresh: true,
  };
}

export function getProgressView(
  current: number,
  total: number,
  status: ProgressStatus,
): {
  visible: boolean;
  percent: number;
  label: string;
  runLabel: string;
  runDisabled: boolean;
} {
  if (status === "started") {
    return {
      visible: true,
      percent: 0,
      label: "Starting...",
      runLabel: "Running...",
      runDisabled: true,
    };
  }

  if (status === "running") {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    return {
      visible: true,
      percent,
      label: `${formatInteger(current)} / ${formatInteger(total)} artists blocked`,
      runLabel: "Running...",
      runDisabled: true,
    };
  }

  return {
    visible: current > 0,
    percent: 100,
    label: current > 0 ? `Done. ${formatInteger(current)} artists blocked` : "Already up to date",
    runLabel: "Run now",
    runDisabled: false,
  };
}
