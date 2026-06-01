/**
 * pi-continue — /continue command
 *
 * Sends "Please continue" when the last response was interrupted
 * by an error, user abort, or token limit.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let lastResponseWasInterrupted = false;

  pi.on("agent_end", async (event) => {
    const messages = event.messages as any[];
    const lastAssistant = messages?.filter((m) => m.role === "assistant").pop();

    if (lastAssistant) {
      const stopReason: string = lastAssistant.stopReason || "";
      lastResponseWasInterrupted =
        stopReason === "error" ||
        stopReason === "aborted" ||
        stopReason === "length";
    }
  });

  pi.registerCommand("continue", {
    description: "Continue the last response that was interrupted (error/abort/token limit)",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is still running.", "warning");
        return;
      }

      if (!lastResponseWasInterrupted) {
        ctx.ui.notify("Nothing to continue — last response completed successfully.", "warning");
        return;
      }

      await ctx.sendUserMessage(
        "Please continue from where you left off. Do not repeat what has already been written.",
      );

      lastResponseWasInterrupted = false;
    },
  });
}
