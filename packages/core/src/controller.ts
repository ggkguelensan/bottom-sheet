import {
  assertPreservedRegions,
  assertShellSheetTarget,
} from "./target.js";
import type {
  ShellCloseReason,
  ShellCloseRequestDetails,
  ShellGestureRelease,
  ShellInteractionCancelReason,
  ShellInteractionOrigin,
  ShellRequestOrigin,
  ShellSheetController,
  ShellSheetEvent,
  ShellSheetFact,
  ShellSheetListener,
  ShellSheetOpenTarget,
  ShellSheetRequest,
  ShellSheetSnapshot,
  ShellSheetTarget,
  ShellSnapRequestDetails,
  ShellTransitionCancelReason,
} from "./types.js";

type ActiveTransition = {
  readonly transitionId: number;
  readonly targetId: string;
};

type ActiveInteraction = {
  readonly interactionId: number;
  readonly origin: ShellInteractionOrigin;
};

type Publication<TSnap extends string, TRegionKey extends string> = {
  readonly snapshot: ShellSheetSnapshot<TSnap, TRegionKey>;
  readonly event: ShellSheetEvent<TSnap, TRegionKey>;
};

type WithoutSequence<T> = T extends unknown ? Omit<T, "sequence"> : never;

const frozenSnapshot = <TSnap extends string, TRegionKey extends string>(
  snapshot: ShellSheetSnapshot<TSnap, TRegionKey>,
): ShellSheetSnapshot<TSnap, TRegionKey> => Object.freeze(snapshot);

const closeOrigin = (reason: ShellCloseReason): ShellRequestOrigin => {
  switch (reason) {
    case "escape":
      return "keyboard";
    case "backdrop":
      return "backdrop";
    case "gesture":
      return "gesture";
    case "close-button":
      return "close-button";
    case "api":
    case "route-change":
      return "api";
  }
};

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`ShellSheet ${name} must be a positive integer.`);
  }
};

const assertRelease = (release: ShellGestureRelease): void => {
  assertPositiveInteger("release interactionId", release.interactionId);
  for (const [name, value] of [
    ["release distance", release.distance],
    ["release velocity", release.velocity],
    ["release projectedHeight", release.projectedHeight],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`ShellSheet ${name} must be finite.`);
    }
  }
};

export function createShellSheetController<
  TSnap extends string = string,
  TRegionKey extends string = string,
>(
  initialTarget?: ShellSheetTarget<TSnap, TRegionKey>,
): ShellSheetController<TSnap, TRegionKey> {
  if (initialTarget !== undefined) {
    assertShellSheetTarget(initialTarget);
  }

  let snapshot = frozenSnapshot<TSnap, TRegionKey>({
    authoritativeTarget: initialTarget ?? null,
    settledTarget: null,
    phase:
      initialTarget === undefined || !initialTarget.open
        ? "closed"
        : "preparing",
    transitionId: null,
    interaction: null,
  });
  let lifecycle: "active" | "destroying" | "destroyed" = "active";
  let sequence = 0;
  let requestId = 0;
  let transitionId = 0;
  let interactionId = 0;
  let activeTransition: ActiveTransition | null = null;
  let activeInteraction: ActiveInteraction | null = null;
  let pendingRelease: ActiveInteraction | null = null;
  const listeners = new Set<ShellSheetListener<TSnap, TRegionKey>>();
  const publications: Publication<TSnap, TRegionKey>[] = [];
  const seenTargets = new Map<string, ShellSheetTarget<TSnap, TRegionKey>>();
  let dispatching = false;

  if (initialTarget !== undefined) {
    seenTargets.set(initialTarget.targetId, initialTarget);
  }

  const ensureActive = (): void => {
    if (lifecycle !== "active") {
      throw new Error("ShellSheet controller has been destroyed.");
    }
  };

  const replaceSnapshot = (
    patch: Partial<ShellSheetSnapshot<TSnap, TRegionKey>>,
  ): void => {
    snapshot = frozenSnapshot({ ...snapshot, ...patch });
  };

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  const publish = (event: ShellSheetEvent<TSnap, TRegionKey>): void => {
    publications.push({ snapshot, event });
    if (dispatching) return;

    dispatching = true;
    const errors: unknown[] = [];
    try {
      while (publications.length > 0) {
        const publication = publications.shift()!;
        for (const listener of [...listeners]) {
          try {
            listener(publication.snapshot, publication.event);
          } catch (error) {
            errors.push(error);
          }
        }
      }
    } finally {
      dispatching = false;
    }

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "ShellSheet listeners failed.");
    }
  };

  const publishFact = (
    fact: WithoutSequence<ShellSheetFact<TSnap, TRegionKey>>,
  ): void => {
    publish({ ...fact, sequence: nextSequence() } as ShellSheetFact<
      TSnap,
      TRegionKey
    >);
  };

  const publishRequest = (
    request: WithoutSequence<ShellSheetRequest<TSnap>>,
  ): void => {
    publish({ ...request, sequence: nextSequence() } as ShellSheetRequest<TSnap>);
  };

  const stablePhase = (): ShellSheetSnapshot<TSnap, TRegionKey>["phase"] => {
    if (activeInteraction) return "dragging";
    const authoritative = snapshot.authoritativeTarget;
    if (activeTransition && authoritative) {
      return !authoritative.open
        ? "closing"
        : snapshot.settledTarget === null
          ? "opening"
          : "transitioning";
    }
    if (
      authoritative?.open === true &&
      snapshot.settledTarget?.targetId === authoritative.targetId
    ) {
      return "open";
    }
    if (authoritative?.open === true && snapshot.settledTarget === null) {
      return "preparing";
    }
    return snapshot.settledTarget ? "open" : "closed";
  };

  const cancelInteractionInternal = (
    interaction: ActiveInteraction,
    reason: ShellInteractionCancelReason,
  ): void => {
    if (activeInteraction?.interactionId !== interaction.interactionId) return;
    activeInteraction = null;
    pendingRelease = null;
    replaceSnapshot({ interaction: null, phase: stablePhase() });
    publishFact({
      type: "interaction-cancelled",
      interactionId: interaction.interactionId,
      origin: interaction.origin,
      reason,
    });
  };

  const cancelTransitionInternal = (
    transition: ActiveTransition,
    reason: ShellTransitionCancelReason,
  ): void => {
    if (activeTransition?.transitionId !== transition.transitionId) return;
    activeTransition = null;
    replaceSnapshot({ transitionId: null, phase: stablePhase() });
    publishFact({
      type: "transition-cancelled",
      targetId: transition.targetId,
      transitionId: transition.transitionId,
      reason,
    });
  };

  const consumeRelease = (release: ShellGestureRelease | undefined): void => {
    if (release === undefined) return;
    assertRelease(release);
    if (
      pendingRelease === null ||
      pendingRelease.interactionId !== release.interactionId
    ) {
      throw new Error(
        "ShellSheet release must match one just-ended interaction and can be published only once.",
      );
    }
    pendingRelease = null;
  };

  const sync = (target: ShellSheetTarget<TSnap, TRegionKey>): void => {
    ensureActive();
    assertShellSheetTarget(target);

    const current = snapshot.authoritativeTarget;
    if (current?.targetId === target.targetId) {
      if (current === target) return;
      throw new Error(
        `ShellSheet targetId "${target.targetId}" was reused with another object.`,
      );
    }
    if (seenTargets.has(target.targetId)) {
      throw new Error(`ShellSheet targetId "${target.targetId}" was reused.`);
    }
    if (current?.open === true && target.open) {
      assertPreservedRegions(current, target);
    }
    seenTargets.set(target.targetId, target);
    pendingRelease = null;

    replaceSnapshot({
      authoritativeTarget: target,
      phase: target.open || snapshot.settledTarget ? "preparing" : "closed",
    });

    if (activeInteraction) {
      cancelInteractionInternal(activeInteraction, "target-changed");
    }
    publishFact({ type: "target-synced", target });
  };

  const controller: ShellSheetController<TSnap, TRegionKey> = {
    sync,
    requestOpen(origin = "api") {
      ensureActive();
      requestId += 1;
      publishRequest({ type: "open-requested", requestId, origin });
      return requestId;
    },
    requestClose(reason, details?: ShellCloseRequestDetails) {
      ensureActive();
      consumeRelease(details?.release);
      requestId += 1;
      const base = {
        type: "close-requested" as const,
        requestId,
        origin: details?.origin ?? closeOrigin(reason),
        reason,
      };
      publishRequest(
        details?.release === undefined
          ? base
          : { ...base, release: details.release },
      );
      return requestId;
    },
    requestSnap(snapPoint, details: ShellSnapRequestDetails) {
      ensureActive();
      const target = snapshot.authoritativeTarget;
      if (
        target?.open !== true ||
        !target.snapPoints.some((point) => point.id === snapPoint)
      ) {
        throw new Error(`Unknown snap point: ${snapPoint}`);
      }
      consumeRelease(details.release);
      requestId += 1;
      const base = {
        type: "snap-requested" as const,
        requestId,
        origin: details.origin,
        snapPoint,
      };
      publishRequest(
        details.release === undefined
          ? base
          : { ...base, release: details.release },
      );
      return requestId;
    },
    beginTransition(targetIdValue) {
      ensureActive();
      if (snapshot.authoritativeTarget?.targetId !== targetIdValue) {
        throw new Error(
          `Cannot begin transition for non-authoritative target: ${targetIdValue}`,
        );
      }

      transitionId += 1;
      const next: ActiveTransition = {
        transitionId,
        targetId: targetIdValue,
      };
      const previous = activeTransition;
      activeTransition = next;

      const target = snapshot.authoritativeTarget;
      const phase = !target.open
        ? "closing"
        : snapshot.settledTarget === null
          ? "opening"
          : "transitioning";
      replaceSnapshot({ transitionId, phase });

      if (previous) {
        publishFact({
          type: "transition-replaced",
          targetId: previous.targetId,
          transitionId: previous.transitionId,
          replacedBy: transitionId,
        });
      }
      publishFact({
        type: "transition-started",
        targetId: targetIdValue,
        transitionId,
      });
      return transitionId;
    },
    settleTransition(transitionIdValue) {
      ensureActive();
      const transition = activeTransition;
      if (
        transition?.transitionId !== transitionIdValue ||
        snapshot.authoritativeTarget?.targetId !== transition.targetId
      ) {
        return;
      }

      activeTransition = null;
      const target = snapshot.authoritativeTarget;
      const settledTarget: ShellSheetOpenTarget<TSnap, TRegionKey> | null =
        target.open ? target : null;
      replaceSnapshot({
        settledTarget,
        transitionId: null,
        phase: target.open ? "open" : "closed",
      });
      publishFact({
        type: "transition-settled",
        targetId: transition.targetId,
        transitionId: transition.transitionId,
      });
    },
    cancelTransition(transitionIdValue, reason) {
      ensureActive();
      const transition = activeTransition;
      if (transition?.transitionId !== transitionIdValue) return;
      cancelTransitionInternal(transition, reason);
    },
    beginInteraction(origin) {
      ensureActive();
      if (snapshot.authoritativeTarget?.open !== true) {
        throw new Error("Cannot begin interaction for a closed ShellSheet.");
      }
      if (activeInteraction) {
        throw new Error("ShellSheet already has an active interaction.");
      }
      pendingRelease = null;
      interactionId += 1;
      activeInteraction = { interactionId, origin };
      replaceSnapshot({
        interaction: Object.freeze({ interactionId, origin }),
        phase: "dragging",
      });
      publishFact({
        type: "interaction-started",
        interactionId,
        origin,
      });
      return interactionId;
    },
    endInteraction(interactionIdValue) {
      ensureActive();
      const interaction = activeInteraction;
      if (interaction?.interactionId !== interactionIdValue) return;
      activeInteraction = null;
      pendingRelease = interaction;
      replaceSnapshot({ interaction: null, phase: stablePhase() });
      publishFact({
        type: "interaction-ended",
        interactionId: interaction.interactionId,
        origin: interaction.origin,
      });
    },
    cancelInteraction(interactionIdValue, reason) {
      ensureActive();
      const interaction = activeInteraction;
      if (interaction?.interactionId !== interactionIdValue) return;
      cancelInteractionInternal(interaction, reason);
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      if (lifecycle === "destroyed") return () => undefined;
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    destroy() {
      if (lifecycle !== "active") return;
      lifecycle = "destroying";
      try {
        if (activeInteraction) {
          cancelInteractionInternal(activeInteraction, "destroyed");
        }
        if (activeTransition) {
          cancelTransitionInternal(activeTransition, "destroyed");
        }
        pendingRelease = null;
        replaceSnapshot({
          authoritativeTarget: null,
          settledTarget: null,
          phase: "destroyed",
          transitionId: null,
          interaction: null,
        });
        lifecycle = "destroyed";
        publishFact({ type: "destroyed" });
      } finally {
        lifecycle = "destroyed";
        publications.length = 0;
        listeners.clear();
        seenTargets.clear();
      }
    },
  };

  return controller;
}
