import { createFileRoute } from "@tanstack/react-router";
import { FocusShieldApp } from "@/components/focus/FocusShieldApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Focus Shield — Digital Wellbeing for LifeOS" },
      {
        name: "description",
        content:
          "Focus Shield helps you block distractions, run break timers, track screen time and stay accountable with focus groups.",
      },
      { property: "og:title", content: "Focus Shield — Digital Wellbeing for LifeOS" },
      {
        property: "og:description",
        content:
          "Block distractions, take smart breaks, track discipline scores and stay accountable with your focus group.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FocusShieldApp,
});
