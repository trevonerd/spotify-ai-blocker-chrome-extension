export interface PopupRefs {
  warning: HTMLElement;
  blocked: HTMLElement;
  csv: HTMLElement;
  dot: HTMLElement;
  lastRun: HTMLElement;
  run: HTMLButtonElement;
  runNote: HTMLElement;
  confirmRun: HTMLElement;
  confirmRunYes: HTMLButtonElement;
  confirmRunNo: HTMLButtonElement;
  progress: HTMLElement;
  progressFill: HTMLDivElement;
  progressLabel: HTMLElement;
  nowPlayingCard: HTMLElement;
  report: HTMLButtonElement;
  version: HTMLElement | null;
}

export function getPopupRefs(): PopupRefs {
  return {
    warning: requireElement("el-warning"),
    blocked: requireElement("el-blocked"),
    csv: requireElement("el-csv"),
    dot: requireElement("el-dot"),
    lastRun: requireElement("el-lastrun"),
    run: requireElement("el-run") as HTMLButtonElement,
    runNote: requireElement("el-runnote"),
    confirmRun: requireElement("el-confirm-run"),
    confirmRunYes: requireElement("el-confirm-run-yes") as HTMLButtonElement,
    confirmRunNo: requireElement("el-confirm-run-no") as HTMLButtonElement,
    progress: requireElement("el-progress"),
    progressFill: requireElement("el-progress-fill") as HTMLDivElement,
    progressLabel: requireElement("el-progress-label"),
    nowPlayingCard: requireElement("el-npcard"),
    report: requireElement("el-report") as HTMLButtonElement,
    version: document.getElementById("el-version"),
  };
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing element with id "${id}"`);
  }
  return el;
}
