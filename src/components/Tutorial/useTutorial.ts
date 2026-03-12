import { useCallback, useRef } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tutorial.css";
import type { DriveStep } from "driver.js";

const TUTORIAL_STORAGE_KEY_PREFIX = "tutorial_seen_v1_";

function getTutorialKey(userId: string) {
  return `${TUTORIAL_STORAGE_KEY_PREFIX}${userId}`;
}

export function hasSeenTutorial(userId: string): boolean {
  return !!localStorage.getItem(getTutorialKey(userId));
}

export function markTutorialSeen(userId: string): void {
  localStorage.setItem(getTutorialKey(userId), "1");
}

export function resetTutorial(userId: string): void {
  localStorage.removeItem(getTutorialKey(userId));
}

interface UseTutorialOptions {
  userId: string;
  steps: DriveStep[];
}

export function useTutorial({ userId, steps }: UseTutorialOptions) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  const startTour = useCallback(() => {
    // Destroy any existing instance
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const driverObj = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.55,
      smoothScroll: true,
      nextBtnText: "Next →",
      prevBtnText: "← Prev",
      doneBtnText: "✓ Done",
      progressText: "Step {{current}} of {{total}}",
      steps,
      onDestroyStarted: () => {
        markTutorialSeen(userId);
        driverObj.destroy();
      },
    });

    driverRef.current = driverObj;
    driverObj.drive();
  }, [steps, userId]);

  return { startTour };
}
