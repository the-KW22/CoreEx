import type { components } from "@/lib/api/schema";

// The same made-up person as the backend's sample Resume (ResumeSample.java), for tests that need a full document.
export const SAMPLE: components["schemas"]["ResumeDocument"] = {
  locale: "en",
  basics: {
    name: "Alex Morgan",
    headline: "Senior Software Engineer",
    email: "alex.morgan@example.com",
    phone: "+1 555 0100",
    location: "Austin, TX",
    website: "https://alexmorgan.example",
    customFields: [],
  },
  summary:
    "<p>Engineer with <strong>seven years</strong> of experience building reliable web services and the teams that run them.</p>",
  sections: [
    {
      id: "experience",
      kind: "EXPERIENCE",
      title: "Experience",
      hidden: false,
      entries: [
        {
          id: "exp-1",
          hidden: false,
          title: "Senior Software Engineer",
          subtitle: "Northwind Labs",
          location: "Remote",
          startDate: "2021-03",
          endDate: "Present",
          url: "",
          description:
            "<ul><li><p>Led a team of five that cut page load time by 40%.</p></li><li><p>Moved the billing system to a queue-based design.</p></li></ul>",
          keywords: ["Java", "PostgreSQL"],
        },
        {
          id: "exp-2",
          hidden: false,
          title: "Software Engineer",
          subtitle: "Contoso",
          location: "Berlin, Germany",
          startDate: "2018-06",
          endDate: "2021-02",
          url: "",
          description: "<p>Built and ran the <strong>customer API</strong> used by 2,000 companies.</p>",
          keywords: [],
        },
      ],
    },
    {
      id: "education",
      kind: "EDUCATION",
      title: "Education",
      hidden: false,
      entries: [
        {
          id: "edu-1",
          hidden: false,
          title: "BSc Computer Science",
          subtitle: "University of Example",
          location: "",
          startDate: "2014-09",
          endDate: "2018-06",
          url: "",
          description: "",
          keywords: [],
        },
      ],
    },
    {
      id: "skills",
      kind: "SKILLS",
      title: "Skills",
      hidden: false,
      entries: [
        { id: "skill-1", hidden: false, title: "Backend", subtitle: "", location: "", startDate: "", endDate: "", url: "", description: "", keywords: ["Java", "Spring Boot", "SQL"] },
        { id: "skill-2", hidden: false, title: "Frontend", subtitle: "", location: "", startDate: "", endDate: "", url: "", description: "", keywords: ["TypeScript", "React"] },
      ],
    },
  ],
  metadata: { template: "classic", accent: "#1d4ed8", font: "Inter", fontSize: 10, pageSize: "A4" },
  privateNotes: "",
  ignoredChecks: [],
};
