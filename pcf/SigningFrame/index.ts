import { IInputs, IOutputs } from "./generated/ManifestTypes";

/**
 * CORMS Signing Frame
 *
 * Shows an e-signature session inside a canvas app and reports how it ended.
 *
 * The provider's page is on another origin, so the app cannot read it. When the session ends the
 * provider redirects the frame to a return address on the SharePoint origin; the frame is readable
 * again at that point, which is how the component knows the outcome. This mirrors what the SPFx
 * page already does in signingReturn.ts.
 */

type SigningResult = "completed" | "declined" | "closed";

const RETURN_MARKER = "cormsSigning";
const RESULT_PARAM = "signingResult";
const POLL_MS = 400;

export class SigningFrame implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container!: HTMLDivElement;
  private frame!: HTMLIFrameElement;
  private message!: HTMLDivElement;
  private notifyOutputChanged!: () => void;

  private signingUrl = "";
  private returnUrl = "";
  private result: string | undefined;
  private resultAt: string | undefined;
  private pollTimer: number | undefined;

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.container = container;
    this.container.classList.add("corms-signing");

    this.message = document.createElement("div");
    this.message.className = "corms-signing__message";
    this.container.appendChild(this.message);

    this.frame = document.createElement("iframe");
    this.frame.className = "corms-signing__frame";
    this.frame.setAttribute("title", "Signing session");
    this.frame.setAttribute("allow", "clipboard-write");
    this.container.appendChild(this.frame);

    this.updateView(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    const url = (context.parameters.SigningUrl?.raw ?? "").trim();
    this.returnUrl = (context.parameters.ReturnUrl?.raw ?? "").trim();
    const idle = (context.parameters.IdleMessage?.raw ?? "").trim() || "No signing session is open.";

    this.container.style.height = `${context.mode.allocatedHeight > 0 ? context.mode.allocatedHeight : 600}px`;
    this.container.style.width = `${context.mode.allocatedWidth > 0 ? context.mode.allocatedWidth : 800}px`;

    if (url === this.signingUrl) return; // nothing new to load
    this.signingUrl = url;

    // Only absolute http(s) addresses are loaded; anything else counts as "no session".
    if (!/^https?:\/\//i.test(url)) {
      this.stopPolling();
      this.frame.removeAttribute("src");
      this.frame.style.display = "none";
      this.message.textContent = idle;
      this.message.style.display = "block";
      return;
    }

    // A new session: clear any earlier outcome so the app can react to this one.
    this.result = undefined;
    this.resultAt = undefined;
    this.message.style.display = "none";
    this.frame.style.display = "block";
    this.frame.src = url;
    this.startPolling();
  }

  public getOutputs(): IOutputs {
    return { SigningResult: this.result, ResultAt: this.resultAt };
  }

  public destroy(): void {
    this.stopPolling();
  }

  // ---------------------------------------------------------------- return detection

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => this.checkReturn(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Reads the frame's address. While the provider's page is showing, the browser blocks this and
   * throws, which simply means the signer is still working.
   */
  private checkReturn(): void {
    let href: string;
    try {
      href = this.frame.contentWindow?.location.href ?? "";
    } catch {
      return; // still on the provider's origin
    }
    if (!href || href === "about:blank") return;

    const outcome = this.parseReturn(href);
    if (!outcome) return;

    this.stopPolling();
    this.result = outcome;
    this.resultAt = new Date().toISOString();
    this.frame.style.display = "none";
    this.message.textContent =
      outcome === "completed" ? "Signing complete." : outcome === "declined" ? "Signing declined." : "Signing closed.";
    this.message.style.display = "block";
    this.notifyOutputChanged();
  }

  /** The outcome when the frame is back on the return address, otherwise undefined. */
  private parseReturn(href: string): SigningResult | undefined {
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
