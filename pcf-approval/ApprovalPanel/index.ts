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
  /** A line under the task, e.g. why the user can't act on it here. */
  notice?: string;
  labels?: Record<string, string>;
}

type Decision = "Approved" | "Rejected" | "Returned";
type SigningState = "idle" | "waiting" | "confirming";

const DEFAULT_LABELS: Record<string, string> = {
  reference: "REFERENCE NO.",
  sender: "SENDER",
  dueDate: "DUE DATE",
  security: "SECURITY LEVEL",
  correspondenceStatus: "CORRESPONDENCE STATUS",
  task: "Task",
  progress: "Approval progress",
  openCorrespondence: "Open correspondence",
  return: "Return",
  reject: "Reject",
  approve: "Approve",
  sign: "Sign",
  signatureRequired: "Signature required",
  comment: "Comment",
  commentRequired: "Please enter a comment.",
  cancel: "Cancel",
  signDocument: "Sign document",
  signingRequired: "This step needs your signature before it can be approved.",
  actionComment: "Action Comment:",
  requestChange: "Request change",
  roundSigning: "Signing",
  roundReview: "Review round",
  awaitingSignature: "Awaiting signature",
  signingWaiting: "After you finish signing, keep this open - the approval is confirmed and completed automatically.",
  signingConfirming: "Confirming your signature and completing the approval...",
  signingSlow: "Your signature hasn't been confirmed yet. If you finished signing, check again.",
  checkAgain: "Check again",
  signingComplete: "Signature complete.",
  loading: "Loading...",
  working: "Please wait...",
  empty: "No approval task is open.",
};

/** The build, for support. Kept on the root element as data-build, never shown to the user. */
const BUILD = "0.0.22";
/** How long "Confirming" waits before it offers "Check again". */
const CONFIRM_PATIENCE_MS = 45000;
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
  private correspondenceUrl = "";

  // dialog state
  private pending: Decision | undefined;
  private comment = "";
  private commentError = false;
  private signingState: SigningState = "idle";

  /**
   * The signing session's frame. It is created once per signing link and kept across renders:
   * rebuilding it would reload the provider's page and lose the signer's progress.
   */
  private frame: HTMLIFrameElement | undefined;
  private frameUrl = "";
  /** The signing page counts as finished once the frame loads a second time (the provider's redirect). */
  private frameLoads = 0;
  /** Parts of the signing dialog updated in place while the frame is showing. */
  private liveError: HTMLElement | undefined;
  private liveSignButton: HTMLButtonElement | undefined;

  private confirmingSince = 0;
  private confirmTimer: number | undefined;
  private busyLayer: HTMLElement | undefined;

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
    this.root.dataset.build = BUILD;
    container.appendChild(this.root);
    this.updateView(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.data = this.parse(context.parameters.DataJson?.raw ?? "");
    this.labels = { ...DEFAULT_LABELS, ...(this.data.labels ?? {}) };
    this.canAct = context.parameters.CanAct?.raw === true;
    this.busy = context.parameters.Busy?.raw === true;
    this.errorMessage = (context.parameters.ErrorMessage?.raw ?? "").trim();
    this.correspondenceUrl = (context.parameters.CorrespondenceUrl?.raw ?? "").trim();

    const url = (context.parameters.SigningUrl?.raw ?? "").trim();
    if (url !== this.signingUrl) {
      this.signingUrl = url;
      this.dropFrame();
      if (/^https?:\/\//i.test(url)) {
        this.signingState = "waiting";
        this.signingResult = undefined;
      }
    }

    // The approver signed and the app recorded it: close the dialog rather than asking again.
    const current = this.data.task ?? {};
    const decided = !!current.status && current.status !== "Pending";
    if (this.pending && (decided || !this.canAct)) this.resetDialog();

    // The app had a problem confirming the signature: let the user see it and leave.
    if (this.signingState === "confirming" && this.errorMessage) this.stopConfirmTimer();

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
    this.stopConfirmTimer();
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

  private dropFrame(): void {
    this.frame = undefined;
    this.frameUrl = "";
    this.frameLoads = 0;
    this.liveError = undefined;
    this.liveSignButton = undefined;
  }

  private resetDialog(): void {
    this.pending = undefined;
    this.commentError = false;
    this.signingState = "idle";
    this.stopConfirmTimer();
    this.dropFrame();
  }

  private stopConfirmTimer(): void {
    if (this.confirmTimer !== undefined) {
      window.clearTimeout(this.confirmTimer);
      this.confirmTimer = undefined;
    }
  }

  private startConfirming(): void {
    this.signingState = "confirming";
    this.confirmingSince = Date.now();
    this.dropFrame();
    this.stopConfirmTimer();
    // After a while, offer "Check again" instead of an endless spinner.
    this.confirmTimer = window.setTimeout(() => {
      this.confirmTimer = undefined;
      this.render();
    }, CONFIRM_PATIENCE_MS);
  }

  // ---------------------------------------------------------------- render

  /** True while the signing frame is on screen and the next render must not rebuild it. */
  private frameIsLive(): boolean {
    return (
      !!this.frame &&
      this.frame.isConnected &&
      this.frameUrl === this.signingUrl &&
      this.signingState === "waiting" &&
      !!this.pending
    );
  }

  private render(): void {
    if (this.frameIsLive()) {
      this.updateSigningInPlace();
    } else {
      this.root.textContent = "";
      this.busyLayer = undefined;
      this.liveError = undefined;
      this.liveSignButton = undefined;
      if (!this.data.task) {
        this.root.appendChild(
          this.el("div", "corms-ap__empty", this.busy ? this.labels.loading : this.labels.empty)
        );
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
    this.syncBusyLayer();
  }

  /** A spinner over the panel while the app saves or talks to a flow. */
  private syncBusyLayer(): void {
    const show = this.busy && !!this.data.task && this.signingState !== "confirming";
    if (show && !this.busyLayer) {
      const layer = this.el("div", "corms-ap__busy");
      layer.setAttribute("role", "status");
      layer.setAttribute("aria-live", "polite");
      layer.appendChild(this.el("div", "corms-ap__spinner"));
      layer.appendChild(this.el("div", "corms-ap__busyText", this.labels.working));
      this.root.appendChild(layer);
      this.busyLayer = layer;
    } else if (!show && this.busyLayer) {
      this.busyLayer.remove();
      this.busyLayer = undefined;
    }
  }

  /** While signing, only the error line and the Sign button change; the frame is left alone. */
  private updateSigningInPlace(): void {
    if (this.liveError) {
      this.liveError.textContent = this.errorMessage;
      this.liveError.style.display = this.errorMessage ? "" : "none";
    }
    if (this.liveSignButton) this.liveSignButton.disabled = true;
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
      meta.appendChild(this.el("span", "corms-ap__signature", `✎ ${this.labels.signatureRequired}`));
    }
    left.appendChild(meta);

    if (task.status && task.status !== "Pending" && task.decidedBy) {
      const decided = task.decidedBy + (task.decisionComment ? ` — ${task.decisionComment}` : "");
      left.appendChild(this.el("div", "corms-ap__taskMeta", decided));
    }
    const notice = (this.data.notice ?? "").trim();
    if (notice) left.appendChild(this.el("div", "corms-ap__notice", notice));

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

  /** A signer signs; a reviewer approves. Both still write Approved. */
  private approveLabel(): string {
    return this.isSigningRound() || !!this.data.task?.requireSignature ? this.labels.sign : this.labels.approve;
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
    // The host modal provides its own dismiss, so the panel does not repeat it.
    if (this.canAct) {
      foot.appendChild(this.button(this.returnLabel(), "default", () => this.openDialog("Returned")));
      foot.appendChild(this.button(this.labels.reject, "danger", () => this.openDialog("Rejected")));
      foot.appendChild(this.button(this.approveLabel(), "primary", () => this.openDialog("Approved")));
    }
    return foot;
  }

  /** Cancel stays usable while the app is saving; only the decisions are held back. */
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
    this.resetDialog();
    this.render();
  }

  // ---------------------------------------------------------------- decision dialog

  private decisionDialog(): HTMLElement {
    const outcome = this.pending as Decision;
    const task = this.data.task ?? {};
    const label =
      outcome === "Approved" ? this.approveLabel() : outcome === "Rejected" ? this.labels.reject : this.returnLabel();
    const needsSignature = outcome === "Approved" && !!task.requireSignature && !task.signatureCompleted;
    const signed = !!task.signatureCompleted;

    // Only the signing session itself needs room to read the document; the comment step does not.
    const showingDocument =
      needsSignature && !signed &&
      ((!!this.signingUrl && this.signingState === "waiting") || this.signingState === "confirming");

    const overlay = this.el("div", "corms-ap__overlay");
    const dialog = this.el("div", showingDocument ? "corms-ap__dialog corms-ap__dialog--wide" : "corms-ap__dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", label);
    dialog.appendChild(this.el("div", "corms-ap__dialogTitle", label));

    if (needsSignature) dialog.appendChild(this.signatureBlock(signed));

    // Confirming: a spinner, then "Check again" if it takes too long. Cancel is always there.
    if (this.signingState === "confirming") {
      if (this.errorMessage) dialog.appendChild(this.el("div", "corms-ap__error", this.errorMessage));
      const actions = this.el("div", "corms-ap__dialogActions");
      actions.appendChild(this.button(this.labels.cancel, "default", () => this.closeDialog(), false));
      if (this.confirmTimer === undefined) {
        actions.appendChild(
          this.button(this.labels.checkAgain, "primary", () => {
            this.startConfirming();
            this.emit("SigningEnded");
            this.render();
          })
        );
      }
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      return overlay;
    }

    const signingLive = !!this.signingUrl && this.signingState === "waiting";
    if (!signingLive) {
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
          const msg = dialog.querySelector(".corms-ap__error--comment");
          if (msg) msg.remove();
        }
      };
      field.appendChild(box);
      dialog.appendChild(field);
      if (this.commentError) {
        dialog.appendChild(this.el("div", "corms-ap__error corms-ap__error--comment", this.labels.commentRequired));
      }
    }

    const error = this.el("div", "corms-ap__error", this.errorMessage);
    if (!this.errorMessage) error.style.display = "none";
    dialog.appendChild(error);
    if (signingLive) this.liveError = error;

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
      signBtn.disabled = this.busy || signingLive;
      if (signingLive) this.liveSignButton = signBtn;
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
    if (this.signingState === "confirming") {
      const wrap = this.el("div", "corms-ap__confirm");
      if (this.confirmTimer !== undefined) {
        wrap.appendChild(this.el("div", "corms-ap__spinner"));
        wrap.appendChild(this.el("div", "corms-ap__confirmText", this.labels.signingConfirming));
      } else {
        wrap.appendChild(this.el("div", "corms-ap__confirmText", this.labels.signingSlow));
      }
      block.appendChild(wrap);
      return block;
    }
    if (this.signingUrl && this.signingState === "waiting") {
      block.appendChild(this.signingFrame());
      block.appendChild(this.el("div", "corms-ap__signingWait", this.labels.signingWaiting));
    } else {
      block.appendChild(this.el("div", "corms-ap__signingNote", this.labels.signingRequired));
    }
    return block;
  }

  /** The provider's page. Its address can't be read across origins, but its load events can: the
   *  second load is the provider sending the signer onward, i.e. signing is done. */
  private signingFrame(): HTMLIFrameElement {
    if (this.frame && this.frameUrl === this.signingUrl) return this.frame;
    const frame = document.createElement("iframe");
    frame.className = "corms-ap__frame";
    frame.title = "Signing session";
    frame.src = this.signingUrl;
    frame.onload = () => {
      if (frame !== this.frame) return;
      this.frameLoads += 1;
      if (this.frameLoads >= 2 && this.signingState === "waiting") {
        this.startConfirming();
        this.render();
      }
    };
    this.frame = frame;
    this.frameUrl = this.signingUrl;
    this.frameLoads = 0;
    return frame;
  }
}
