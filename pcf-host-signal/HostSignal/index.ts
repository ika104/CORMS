import { IInputs, IOutputs } from "./generated/ManifestTypes";

/**
 * CORMS Host Signal
 *
 * Canvas apps can't talk to the page that embeds them, and Launch() replaces the whole browser tab.
 * This invisible component posts a message to the windows above the app instead:
 *   { type: "corms:host-signal", signal: "cancel" | "created;ref=TSK-..." }
 * CORMS accepts it only from its own Power Apps frame, then closes the panel.
 *
 * The message holds no data beyond the signal and a task reference, so it is posted to any origin:
 * the app doesn't know which SharePoint host embeds it.
 */
export class HostSignal implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private lastSent = "";

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        container.setAttribute("aria-hidden", "true");
        // The first value is the app's starting state, not something the user just did.
        this.lastSent = context.parameters.Signal.raw ?? "";
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const raw = context.parameters.Signal.raw ?? "";
        if (!raw || raw === this.lastSent) return;
        this.lastSent = raw;
        const at = raw.lastIndexOf("@");
        const signal = at > 0 ? raw.substring(0, at) : raw;
        const message = { type: "corms:host-signal", signal };
        // Every ancestor: CORMS may sit one or more frames above the player (Teams, a web part page).
        let current: Window = window;
        while (current.parent && current.parent !== current) {
            current = current.parent;
            try {
                current.postMessage(message, "*");
            } catch {
                // A window that can't receive messages is skipped.
            }
        }
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Nothing to release.
    }
}
