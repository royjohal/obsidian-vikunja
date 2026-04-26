import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Vikunja Sync",
  description: "Two-way sync between Obsidian tasks and Vikunja",
  base: "/",

  head: [["link", { rel: "icon", href: "/obsidian-vikunja/favicon.svg" }]],

  themeConfig: {
    nav: [
      { text: "Getting Started", link: "/getting-started" },
      { text: "Usage", link: "/usage" },
      { text: "Architecture", link: "/architecture" },
      { text: "Roadmap", link: "/roadmap" },
      {
        text: "GitHub",
        link: "https://github.com/royjohal/obsidian-vikunja",
      },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "What is Vikunja Sync?", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
        ],
      },
      {
        text: "Usage",
        items: [{ text: "Task Syntax & Features", link: "/usage" }],
      },
      {
        text: "Reference",
        items: [{ text: "Architecture & API", link: "/architecture" }],
      },
      {
        text: "Project",
        items: [{ text: "Roadmap", link: "/roadmap" }],
      },
    ],

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/royjohal/obsidian-vikunja",
      },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Built with VitePress",
    },

    search: {
      provider: "local",
    },
  },
});
