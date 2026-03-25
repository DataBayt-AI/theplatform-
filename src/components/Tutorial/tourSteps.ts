import type { DriveStep } from "driver.js";
import i18n from "@/i18n";

export type UserRole = "admin" | "manager" | "annotator";

export function getDashboardSteps(roles: UserRole[]): DriveStep[] {
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  const isAnnotator = roles.includes("annotator") && !isManager;

  const t = i18n.t.bind(i18n);
  const steps: DriveStep[] = [
    {
      popover: {
        title: t("tour.dashboard.welcome.title"),
        description: t("tour.dashboard.welcome.description"),
        side: "over",
        align: "center",
      },
    },
  ];

  if (isAnnotator) {
    steps.push(
      {
        element: "#tutorial-projects-list",
        popover: {
          title: t("tour.dashboard.assignedProjects.title"),
          description: t("tour.dashboard.assignedProjects.description"),
          side: "top",
          align: "start",
        },
      },
      {
        element: "#tutorial-open-project",
        popover: {
          title: t("tour.dashboard.openProject.title"),
          description: t("tour.dashboard.openProject.description"),
          side: "top",
        },
      }
    );
    return steps;
  }

  // Manager / Admin flow
  steps.push({
    element: "#tutorial-new-project",
    popover: {
      title: t("tour.dashboard.newProject.title"),
      description: t("tour.dashboard.newProject.description"),
      side: "bottom",
      align: "end",
    },
  });

  steps.push({
    element: "#tutorial-projects-list",
    popover: {
      title: t("tour.dashboard.yourProjects.title"),
      description: t("tour.dashboard.yourProjects.description"),
      side: "top",
      align: "start",
    },
  });

  if (isManager) {
    steps.push({
      element: "#tutorial-model-management",
      popover: {
        title: t("tour.dashboard.modelManagement.title"),
        description: t("tour.dashboard.modelManagement.description"),
        side: "bottom",
        align: "end",
      },
    });
  }

  if (isAdmin) {
    steps.push({
      element: "#tutorial-manage-users",
      popover: {
        title: t("tour.dashboard.userManagement.title"),
        description: t("tour.dashboard.userManagement.description"),
        side: "bottom",
        align: "end",
      },
    });
  }

  steps.push({
    element: "#tutorial-help-btn",
    popover: {
      title: t("tour.dashboard.replayTour.title"),
      description: t("tour.dashboard.replayTour.description"),
      side: "bottom",
      align: "end",
    },
  });

  return steps;
}

export function getWorkspaceSteps(canManage: boolean): DriveStep[] {
  const t = i18n.t.bind(i18n);
  const steps: DriveStep[] = [
    {
      popover: {
        title: t("tour.workspace.welcome.title"),
        description: t("tour.workspace.welcome.description"),
        side: "over",
        align: "center",
      },
    },
    {
      element: "#tutorial-progress",
      popover: {
        title: t("tour.workspace.progress.title"),
        description: t("tour.workspace.progress.description"),
        side: "bottom",
        align: "end",
      },
    },
    {
      element: "#tutorial-nav-prev",
      popover: {
        title: t("tour.workspace.navigation.title"),
        description: t("tour.workspace.navigation.description"),
        side: "bottom",
      },
    },
    {
      element: "#tutorial-annotation-form",
      popover: {
        title: t("tour.workspace.annotationPanel.title"),
        description: t("tour.workspace.annotationPanel.description"),
        side: "left",
        align: "start",
      },
    },
    {
      element: "#tutorial-guidelines-btn",
      popover: {
        title: t("tour.workspace.guidelines.title"),
        description: t("tour.workspace.guidelines.description"),
        side: "bottom",
      },
    },
    {
      element: "#tutorial-shortcuts-btn",
      popover: {
        title: t("tour.workspace.shortcuts.title"),
        description: t("tour.workspace.shortcuts.description"),
        side: "bottom",
      },
    },
  ];

  if (canManage) {
    steps.push({
      element: "#tutorial-workspace-help-btn",
      popover: {
        title: t("tour.workspace.replayTour.title"),
        description: t("tour.workspace.replayTour.description"),
        side: "bottom",
      },
    });
  }

  return steps;
}
