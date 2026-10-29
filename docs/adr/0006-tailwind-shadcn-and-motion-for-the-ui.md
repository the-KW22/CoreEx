# Tailwind CSS, shadcn/ui and Motion for the UI

The frontend is styled with Tailwind CSS v4 and built from shadcn/ui components (Radix underneath), restyled to the CoreEx design tokens in `docs/DESIGN.md`. Animation uses React's built-in `<ViewTransition>` for route changes and Motion (motion.dev) for components. The first UI was one hand-written `globals.css`, but the redesign needs accessible dialogs, menus, popovers, a command palette and data tables, and the planned modules (Jobs, Knowledge Graph, integrations) need many more. shadcn copies each component's source into the repo, so we own and restyle it instead of depending on a styled library's look.

## Considered Options

- **Plain CSS with hand-built components**: rejected because accessible overlays (focus trapping, keyboard navigation, screen-reader roles) are a lot of easy-to-get-wrong code that Radix already gets right.
- **CSS Modules with unstyled Radix primitives**: workable, but we would rebuild every shadcn component by hand for no gain.
- **GSAP for all animation**: GSAP is the strongest timeline engine, but App Router unmounts the old page before an exit animation can run, and component animation is simpler declaratively. GSAP is added later with the first feature that needs timelines, such as the Knowledge Graph or a landing page.

## Consequences

- New dependencies: `tailwindcss` v4, the shadcn/ui CLI's generated components and their Radix packages, `motion`, `lucide-react` (shadcn's icon set), `sonner` (toasts) and `cmdk` (command palette).
- Colours, radii, fonts and motion values come only from tokens; components never hard-code them, so dark and light themes stay in step.
- Page transitions depend on the browser's View Transitions API. Browsers without it navigate normally with no animation.
