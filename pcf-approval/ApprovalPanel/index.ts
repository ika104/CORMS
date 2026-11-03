import { IInputs, IOutputs } from "./generated/ManifestTypes";

/**
 * CORMS Approval Panel
 *
 * One approval task in context — the correspondence header, the approver's own task, the whole
 * chain's progress and, when it is their turn, the decision buttons. A decision that needs a
 * signature opens the signing session inside the panel first.
 *
 * The component holds no data of its own: the app passes everything in DataJson and performs the
 * writes. The component only reports what the user chose, through Action / Comment / SigningResult.
 */

interface IStep {
  stepOrder: number;
  stepName: string;
  status: string; // Pending | Approved | Rejected | Returned | Cancelled
  /** The comment captured for this approver when the chain was built. */
  actionComments?: string;
}

interface IPanelData {
  subject?: string;
  referenceNo?: string;
  sender?: string;
  dueDate?: string;
  isOverdue?: boolean;
  securityLevel?: string;
  correspondenceStatus?: string;
  /** "Review", "Signing", or "Legacy" for a chain written before rounds existed. */
  phase?: string;
  /** The round these steps belong to; only the latest round is sent. */
  round?: number;
  task?: {
    stepOrder?: number;
    stepName?: string;
    stepType?: string;
    assignedToName?: string;
    requireSignature?: boolean;
    signatureCompleted?: boolean;
    status?: string;
    stateLabel?: string;
    decidedBy?: string;
    decisionComment?: string;
  };
  steps?: IStep[];
  labels?: Record<string, string>;
}

type Decision = "Approved" | "Rejected" | "Returned";

const DEFAULT_LABELS: Record<string, string> = {
  reference: "REFERENCE NO.",
  sender: "SENDER",
  dueDate: "DUE DATE",
  security: "SECURITY LEVEL",
  correspondenceStatus: "CORRESPONDENCE STATUS",
  task: "Task",
  progress: "Approval progress",
  openCorrespondence: "Open correspondence",
  close: "Close",
  return: "Return",
  reject: "Reject",
  approve: "Approve",
  signatureRequired: "Signature required",
  comment: "Comment",
  commentRequired: "A comment is required to return a task.",
  cancel: "Cancel",
  confirm: "Confirm",
  signDocument: "Sign document",
  signingRequired: "This step needs your signature before it can be approved.",
  actionComment: "Action Comment:",
  requestChange: "Request change",
  roundSigning: "Signing",
  roundReview: "Review round",
  awaitingSignature: "Awaiting signature",
  signingWaiting: "After you finish signing, keep this open - the approval is confirmed and completed automatically.",
  signingConfirming: "Confirming your signature and completing the approval...",
  signingComplete: "Signature complete.",
  signingDeclined: "Signing was declined.",
  signingClosed: "The signing window was closed.",
  empty: "No approval task is open.",
};

const RETURN_MARKER = "cormsSigning";
const RESULT_PARAM = "signingResult";
const POLL_MS = 400;
const BUILD = "v0.0.20";
const EM_DASH = "—";

export class ApprovalPanel implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private root!: HTMLDivElement;
  private notifyOutputChanged!: () => void;

  private data: IPanelData = {};
  private labels: Record<string, string> = DEFAULT_LABELS;
  private canAct = false;
  private busy = false;
  private errorMessage = "";
  private signingUrl = "";
  private returnUrl = "";
  private correspondenceUrl = "";

  // dialog state
  private pending: Decision | undefined;
  private comment = "";
  private commentError = false;
  private signingState: "idle" | "waiting" | "confirming" | "completed" | "declined" | "closed" = "idle";
  /** The signing page counts as navigated once it loads a second time - the return page. */
  private frameLoads = 0;
  private pollTimer: number | undefined;

  // outputs
  private action: string | undefined;
  private outComment: string | undefined;
  private signingResult: string | undefined;
  private actionAt: string | undefined;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.root = document.createElement("div");
    this.root.className = "corms-ap";
    container.appendChild(this.root);
    this.updateView(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.data = this.parse(context.parameters.DataJson?.raw ?? "");
    this.labels = { ...DEFAULT_LABELS, ...(this.data.labels ?? {}) };
    this.canAct = context.parameters.CanAct?.raw === true;
    this.busy = context.parameters.Busy?.raw === true;
    this.errorMessage = (context.parameters.ErrorMessage?.raw ?? "").trim();
    this.returnUrl = (context.parameters.ReturnUrl?.raw ?? "").trim();
    this.correspondenceUrl = (context.parameters.CorrespondenceUrl?.raw ?? "").trim();

    const url = (context.parameters.SigningUrl?.raw ?? "").trim();
    if (url !== this.signingUrl) {
      this.signingUrl = url;
      if (/^https?:\/\//i.test(url)) {
        this.signingState = "waiting";
        this.signingResult = undefined;
        this.frameLoads = 0;
      }
    }

    // The approver signed and the app recorded it: close the dialog rather than asking again.
    const current = this.data.task ?? {};
    const decided = !!current.status && current.status !== "Pending";
    if (this.pending && (decided || !this.canAct)) {
      this.pending = undefined;
      this.signingState = "idle";
      this.frameLoads = 0;
    }

    this.render();
  }

  public getOutputs(): IOutputs {
    return {
      // Canvas surfaces a component's writes through bound properties, so the action is reported
      // as one JSON blob as well as the individual outputs.
      ActionJson: JSON.stringify({
        action: this.action ?? "",
        comment: this.outComment ?? "",
        signingResult: this.signingResult ?? "",
        at: this.actionAt ?? "",
      }),
      Action: this.action,
      Comment: this.outComment,
      SigningResult: this.signingResult,
      ActionAt: this.actionAt,
    };
  }

  public destroy(): void {
    this.stopPolling();
  }

  // ---------------------------------------------------------------- helpers

  private parse(raw: string): IPanelData {
    try {
      const parsed = JSON.parse(raw) as IPanelData;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Canvas surfaces only the primary output, so Action carries the whole payload as JSON -
   *  including a timestamp, so the same action twice is still two distinct values. */
  private emit(action: string): void {
    this.outComment = this.comment;
    this.actionAt = new Date().toISOString();
    this.action = JSON.stringify({
      action,
      at: this.actionAt,
      comment: this.outComment ?? "",
      signingResult: this.signingResult ?? "",
    });
    this.notifyOutputChanged();
  }

  private el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  private value(text?: string): string {
    return text && text.trim() ? text : EM_DASH;
  }

  private tone(status: string): string {
    const s = (status || "").toLowerCase();
    if (s === "approved" || s === "completed") return "ok";
    if (s === "rejected" || s === "cancelled") return "bad";
    if (s === "returned") return "warn";
    if (s === "to do" || s === "todo") return "info";
    return "muted";
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    this.root.textContent = "";

    if (!this.data.task) {
      this.root.appendChild(this.el("div", "corms-ap__empty", this.labels.empty));
      return;
    }

    const body = this.el("div", "corms-ap__body");
    body.appendChild(this.summary());
    body.appendChild(this.taskSection());
    body.appendChild(this.progressSection());
    body.appendChild(this.openLink());
    this.root.appendChild(body);
    this.root.appendChild(this.footer());

    if (this.pending) this.root.appendChild(this.decisionDialog());
  }

  private summary(): HTMLElement {
    const dl = this.el("dl", "corms-ap__summary");
    const add = (label: string, text: string, cls?: string): void => {
      const cell = this.el("div");
      cell.appendChild(this.el("dt", undefined, label));
      cell.appendChild(this.el("dd", cls, text));
      dl.appendChild(cell);
    };
    add(this.labels.reference, this.value(this.data.referenceNo));
    add(this.labels.sender, this.value(this.data.sender));
    add(this.labels.dueDate, this.value(this.data.dueDate), this.data.isOverdue ? "corms-ap__overdue" : undefined);
    add(this.labels.security, this.value(this.data.securityLevel));
    const chainRunning = (this.data.steps ?? []).some((x) => x.status === "Pending");
    add(
      this.labels.correspondenceStatus,
      this.isSigningRound() && chainRunning
        ? this.labels.awaitingSignature
        : this.value(this.data.correspondenceStatus)
    );
    return dl;
  }

  private taskSection(): HTMLElement {
    const task = this.data.task ?? {};
    const section = this.el("section", "corms-ap__section");
    section.appendChild(this.el("h3", "corms-ap__sectionTitle", this.labels.task));

    const row = this.el("div", "corms-ap__taskRow");
    const left = this.el("div");
    left.appendChild(
      this.el("div", "corms-ap__taskName", `Step ${task.stepOrder ?? ""} · ${this.value(task.stepName)}`)
    );

    const meta = this.el("div", "corms-ap__taskMeta");
    const parts: string[] = [];
    if (task.stepType) parts.push(task.stepType);
    if (task.assignedToName) parts.push(task.assignedToName);
    meta.appendChild(this.el("span", undefined, parts.join(" · ")));
    if (task.requireSignature) {
      const sig = this.el("span", "corms-ap__signature", `✎ ${this.labels.signatureRequired}`);
      meta.appendChild(sig);
    }
    left.appendChild(meta);

    if (task.status && task.status !== "Pending" && task.decidedBy) {
      const decided = task.decidedBy + (task.decisionComment ? ` — ${task.decisionComment}` : "");
      left.appendChild(this.el("div", "corms-ap__taskMeta", decided));
    }

    row.appendChild(left);
    const stateLabel = task.stateLabel ?? task.status ?? "";
    row.appendChild(this.el("span", `corms-ap__badge corms-ap__badge--${this.tone(stateLabel)}`, stateLabel));
    section.appendChild(row);
    return section;
  }

  /** A signer asks for a change; a reviewer returns. Both still write Returned. */
  private returnLabel(): string {
    return this.isSigningRound() ? this.labels.requestChange : this.labels.return;
  }

  private isSigningRound(): boolean {
    return (this.data.phase ?? "") === "Signing";
  }

  private progressSection(): HTMLElement {
    const section = this.el("section", "corms-ap__section");
    section.appendChild(this.el("h3", "corms-ap__sectionTitle", this.labels.progress));
    // Only the latest round is shown, so say which one it is.
    const round = this.data.round ?? 1;
    const roundLabel = this.isSigningRound()
      ? this.labels.roundSigning
      : round > 1
        ? `${this.labels.roundReview} ${round}`
        : "";
    if (roundLabel) section.appendChild(this.el("div", "corms-ap__roundLabel", roundLabel));
    const list = this.el("ol", "corms-ap__steps");
    const current = this.data.task?.stepOrder;
    for (const step of this.data.steps ?? []) {
      const li = this.el("li", `corms-ap__step${step.stepOrder === current ? " corms-ap__step--current" : ""}`);
      li.appendChild(this.el("span", "corms-ap__stepOrder", String(step.stepOrder)));
      const name = this.el("div", "corms-ap__stepName");
      name.appendChild(this.el("div", undefined, step.stepName));
      const note = (step.actionComments ?? "").trim();
      if (note) name.appendChild(this.el("div", "corms-ap__stepNote", `${this.labels.actionComment} ${note}`));
      li.appendChild(name);
      li.appendChild(this.el("span", `corms-ap__badge corms-ap__badge--${this.tone(step.status)}`, step.status));
      list.appendChild(li);
    }
    section.appendChild(list);
    return section;
  }

  private openLink(): HTMLElement {
    const text = `↗ ${this.labels.openCorrespondence}`;
    // A real anchor, not a button: opening a tab from the app's OnChange happens after the click
    // has ended, so the browser treats it as an unsolicited popup and blocks it.
    if (this.correspondenceUrl) {
      const anchor = this.el("a", "corms-ap__link", text) as HTMLAnchorElement;
      anchor.href = this.correspondenceUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      return anchor;
    }
    const link = this.el("button", "corms-ap__link", text) as HTMLButtonElement;
    link.onclick = () => this.emit("OpenCorrespondence");
    return link;
  }

  private footer(): HTMLElement {
    const foot = this.el("div", "corms-ap__foot");
    foot.appendChild(this.el("span", "corms-ap__build", BUILD));
    // The host modal provides its own dismiss, so the panel does not repeat it.
    if (this.canAct) {
      foot.appendChild(this.button(this.returnLabel(), "default", () => this.openDialog("Returned")));
      foot.appendChild(this.button(this.labels.reject, "danger", () => this.openDialog("Rejected")));
      foot.appendChild(this.button(this.labels.approve, "primary", () => this.openDialog("Approved")));
    }
    return foot;
  }

  /** Close and Cancel stay usable while the app is saving; only the decisions are held back. */
  private button(text: string, variant: string, onClick: () => void, disableWhenBusy = true): HTMLButtonElement {
    const btn = this.el("button", `corms-ap__btn corms-ap__btn--${variant}`, text) as HTMLButtonElement;
    btn.disabled = disableWhenBusy && this.busy;
    btn.onclick = onClick;
    return btn;
  }

  private openDialog(outcome: Decision): void {
    this.pending = outcome;
    this.comment = "";
    this.commentError = false;
    this.render();
  }

  private closeDialog(): void {
    this.pending = undefined;
    this.commentError = false;
    this.stopPolling();
    this.render();
  }

  // ---------------------------------------------------------------- decision dialog

  private decisionDialog(): HTMLElement {
    const outcome = this.pending as Decision;
    const task = this.data.task ?? {};
    const label =
      outcome === "Approved" ? this.labels.approve : outcome === "Rejected" ? this.labels.reject : this.returnLabel();
    const needsSignature = outcome === "Approved" && !!task.requireSignature && !task.signatureCompleted;
    const signed = this.signingState === "completed" || !!task.signatureCompleted;

    // Only the signing session itself needs room to read the document; the comment step does not.
    const showingDocument =
      needsSignature && !signed &&
      ((!!this.signingUrl && this.signingState === "waiting") || this.signingState === "confirming");

    const overlay = this.el("div", "corms-ap__overlay");
    const dialog = this.el("div", showingDocument ? "corms-ap__dialog corms-ap__dialog--wide" : "corms-ap__dialog");
    dialog.appendChild(this.el("div", "corms-ap__dialogTitle", label));

    if (needsSignature) dialog.appendChild(this.signatureBlock(signed));

    // While the signature is being confirmed there is nothing to ask and nothing to press -
    // but an error must still be visible, or a failure looks like an endless spinner.
    if (this.signingState === "confirming") {
      if (this.errorMessage) {
        dialog.appendChild(this.el("div", "corms-ap__error", this.errorMessage));
        const actions = this.el("div", "corms-ap__dialogActions");
        actions.appendChild(this.button(this.labels.cancel, "default", () => this.closeDialog(), false));
        dialog.appendChild(actions);
      }
      overlay.appendChild(dialog);
      return overlay;
    }

    if (!this.signingUrl || this.signingState !== "waiting") {
      const field = this.el("label", "corms-ap__field");
      const lbl = this.el("span", "corms-ap__fieldLabel", this.labels.comment);
      lbl.appendChild(this.el("span", "corms-ap__required", " *"));
      field.appendChild(lbl);
      const box = this.el("textarea", "corms-ap__textarea") as HTMLTextAreaElement;
      box.value = this.comment;
      box.rows = 3;
      box.oninput = () => {
        this.comment = box.value;
        if (this.commentError && box.value.trim()) {
          this.commentError = false;
          const msg = dialog.querySelector(".corms-ap__error");
          if (msg) msg.remove();
        }
      };
      field.appendChild(box);
      dialog.appendChild(field);
      if (this.commentError) dialog.appendChild(this.el("div", "corms-ap__error", this.labels.commentRequired));
    }

    if (this.errorMessage) dialog.appendChild(this.el("div", "corms-ap__error", this.errorMessage));

    const actions = this.el("div", "corms-ap__dialogActions");
    actions.appendChild(this.button(this.labels.cancel, "default", () => this.closeDialog(), false));

    if (needsSignature && !signed) {
      const signBtn = this.button(this.labels.signDocument, "primary", () => {
        if (!this.comment.trim()) {
          this.commentError = true;
          this.render();
          return;
        }
        this.emit("RequestSignature");
      });
      signBtn.disabled = this.busy || this.signingState === "waiting";
      actions.appendChild(signBtn);
    } else {
      const confirm = this.button(label, outcome === "Rejected" ? "danger" : "primary", () => {
        if (!this.comment.trim()) {
          this.commentError = true;
          this.render();
          return;
        }
        this.emit(outcome === "Approved" ? "Approve" : outcome === "Rejected" ? "Reject" : "Return");
        this.pending = undefined;
        this.render();
      });
      actions.appendChild(confirm);
    }

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    return overlay;
  }

  private signatureBlock(signed: boolean): HTMLElement {
    const block = this.el("div", "corms-ap__signing");
    if (signed) {
      block.appendChild(this.el("div", "corms-ap__signingOk", this.labels.signingComplete));
      return block;
    }
    if (this.signingState === "declined" || this.signingState === "closed") {
      const text = this.signingState === "declined" ? this.labels.signingDeclined : this.labels.signingClosed;
      block.appendChild(this.el("div", "corms-ap__signingWarn", text));
    }
    if (this.signingState === "confirming") {
      const wrap = this.el("div", "corms-ap__confirm");
      wrap.appendChild(this.el("div", "corms-ap__spinner"));
      wrap.appendChild(this.el("div", "corms-ap__confirmText", this.labels.signingConfirming));
      block.appendChild(wrap);
      return block;
    }
    if (this.signingUrl && this.signingState === "waiting") {
      const frame = document.createElement("iframe");
      frame.className = "corms-ap__frame";
      frame.title = "Signing session";
      frame.src = this.signingUrl;
      // The frame's URL is unreadable across origins, but its load events are not: the second load
      // is the provider sending the signer onward, i.e. signing is done.
      frame.onload = () => {
        this.frameLoads += 1;
        if (this.frameLoads >= 2 && this.signingState === "waiting") {
          this.signingState = "confirming";
          this.render();
        }
      };
      block.appendChild(frame);
      block.appendChild(this.el("div", "corms-ap__signingWait", this.labels.signingWaiting));
      this.startPolling(frame);
    } else {
      block.appendChild(this.el("div", "corms-ap__signingNote", this.labels.signingRequired));
    }
    return block;
  }

  // ---------------------------------------------------------------- signing return

  private startPolling(frame: HTMLIFrameElement): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      let href: string;
      try {
        href = frame.contentWindow?.location.href ?? "";
      } catch {
        return; // still on the provider's origin
      }
      if (!href || href === "about:blank") return;
      const outcome = this.parseReturn(href);
      if (!outcome) return;
      this.stopPolling();
      this.signingState = outcome;
      this.signingResult = outcome;
      this.actionAt = new Date().toISOString();
      this.action = JSON.stringify({
        action: "SigningEnded",
        at: this.actionAt,
        comment: this.outComment ?? "",
        signingResult: outcome,
      });
      this.notifyOutputChanged();
      this.render();
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private parseReturn(href: string): "completed" | "declined" | "closed" | undefined {
    if (this.returnUrl && href.split("?")[0] !== this.returnUrl.split("?")[0]) return undefined;
    let params: URLSearchParams;
    try {
      params = new URL(href).searchParams;
    } catch {
      return undefined;
    }
    if (params.get(RETURN_MARKER) !== "1") return undefined;
    const result = params.get(RESULT_PARAM);
    return result === "declined" || result === "closed" ? result : "completed";
  }
}
