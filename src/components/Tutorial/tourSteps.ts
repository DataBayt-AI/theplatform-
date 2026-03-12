import type { DriveStep } from "driver.js";

export type UserRole = "admin" | "manager" | "annotator";

export function getDashboardSteps(roles: UserRole[]): DriveStep[] {
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager") || isAdmin;
  const isAnnotator = roles.includes("annotator") && !isManager;

  const steps: DriveStep[] = [
    {
      popover: {
        title: "Welcome to DataBayt.AI Studio",
        description:
          "This quick tour will walk you through the key features of the platform. Use <b>Next</b> to continue or press <b>Esc</b> to exit at any time.",
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
          title: "Your Assigned Projects",
          description:
            "These are the annotation projects you have been assigned to. Click on a project card to open the workspace and start annotating.",
          side: "top",
          align: "start",
        },
      },
      {
        element: "#tutorial-open-project",
        popover: {
          title: "Open a Project",
          description:
            'Click <b>Open</b> on any project card to enter the annotation workspace. Your progress is saved automatically.',
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
      title: "Create a New Project",
      description:
        "Click here to create an annotation project. You can configure the name, description, IAA (Inter-Annotator Agreement) settings, and assign team members.",
      side: "bottom",
      align: "end",
    },
  });

  steps.push({
    element: "#tutorial-projects-list",
    popover: {
      title: "Your Projects",
      description:
        "All your annotation projects appear here. Each card shows the project name, description, and quick actions like <b>Open</b>, <b>Settings</b>, and <b>Access</b>.",
      side: "top",
      align: "start",
    },
  });

  if (isManager) {
    steps.push({
      element: "#tutorial-model-management",
      popover: {
        title: "Model Management",
        description:
          "Configure AI model connections (OpenAI, Gemini, OpenRouter, etc.) and manage model profiles used to auto-annotate your data.",
        side: "bottom",
        align: "end",
      },
    });
  }

  if (isAdmin) {
    steps.push({
      element: "#tutorial-manage-users",
      popover: {
        title: "User Management",
        description:
          "As an admin, you can create users, assign roles (Admin, Manager, Annotator), reset passwords, and generate invite links for new team members.",
        side: "bottom",
        align: "end",
      },
    });
  }

  steps.push({
    element: "#tutorial-help-btn",
    popover: {
      title: "Replay This Tour",
      description:
        "You can always reopen this tour by clicking the <b>?</b> button here. Enjoy using DataBayt.AI!",
      side: "bottom",
      align: "end",
    },
  });

  return steps;
}

export function getWorkspaceSteps(canManage: boolean): DriveStep[] {
  const steps: DriveStep[] = [
    {
      popover: {
        title: "Annotation Workspace",
        description:
          "Welcome to the workspace! This tour covers the main controls. Use <b>Next</b> to continue.",
        side: "over",
        align: "center",
      },
    },
    {
      element: "#tutorial-progress",
      popover: {
        title: "Your Progress",
        description:
          "This progress bar shows how many items have been annotated out of the total. Keep going!",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: "#tutorial-nav-prev",
      popover: {
        title: "Navigate Items",
        description:
          "Use the <b>Previous</b> and <b>Next</b> arrow buttons to move between data points. You can also use <kbd>←</kbd> / <kbd>→</kbd> keyboard shortcuts.",
        side: "bottom",
      },
    },
    {
      element: "#tutorial-annotation-form",
      popover: {
        title: "Annotation Panel",
        description:
          "This is where you label each data point. Fill in the required fields and click <b>Accept</b> to save your annotation, or <b>Reject</b> to flag the item.",
        side: "left",
        align: "start",
      },
    },
    {
      element: "#tutorial-guidelines-btn",
      popover: {
        title: "Annotation Guidelines",
        description:
          "Click here to read the project guidelines. Always refer to them when unsure how to label an item.",
        side: "bottom",
      },
    },
    {
      element: "#tutorial-shortcuts-btn",
      popover: {
        title: "Keyboard Shortcuts",
        description:
          "Open the keyboard shortcut reference to speed up your annotation workflow significantly.",
        side: "bottom",
      },
    },
  ];

  if (canManage) {
    steps.push({
      element: "#tutorial-workspace-help-btn",
      popover: {
        title: "Replay This Tour",
        description:
          "Click the <b>?</b> button any time to re-run this workspace tour.",
        side: "bottom",
      },
    });
  }

  return steps;
}
