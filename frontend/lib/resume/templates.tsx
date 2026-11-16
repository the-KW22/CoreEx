import { Document, Image, Link, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import type { components } from "@/lib/api/schema";

import { type Block, type PhotoFrame, resumeBlocks, templateOf } from "./blocks";
import { type Custom, type Part, customStyles } from "./custom-css";
import { DENSITIES, pageDimensions } from "./design";
import type { Rich, Run } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// The three templates share the drawing of every block and differ in layout. "Classic": one column, real text in reading
// order, plain headings and nothing a hiring system cannot read (no icons, tables or text in images). "Sidebar": the
// header across the top, then a narrow column of short lists beside the main one. "Modern": one column under a header
// band in the accent colour. The design settings (fonts, size, density, colour, page, margins, sidebar, entry layout and
// where sections go) apply to all three. Written for CoreEx; any later code taken from Reactive Resume (MIT) keeps its
// licence notice here.

// "registered" is true when the Inter files were loaded; without them Inter falls back to Helvetica.
export type Fonts = { registered: boolean };

// Everything the blocks need to know about how to look, worked out once from the document.
type Look = {
  fonts: Fonts;
  font: string;
  headingFont: string;
  size: number;
  accent: string;
  gap: number;
  twoColumns: boolean;
  stacked: boolean;
  modern: boolean;
  custom: Custom;
  // The photo picture as a data URL, or null when there is none (or its Asset is gone).
  photoSrc: string | null;
};

// The PDF's built-in families; Inter is the one embedded font.
const BUILT_IN: Record<string, [string, string, string, string]> = {
  Helvetica: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
  Times: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
  Courier: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
};

const face = (fonts: Fonts, family: string, bold?: boolean, italic?: boolean): Style => {
  if (family === "Inter" && fonts.registered) {
    return { fontFamily: "Inter", fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal" };
  }
  const names = BUILT_IN[family] ?? BUILT_IN.Helvetica;
  return { fontFamily: names[(bold ? 1 : 0) + (italic ? 2 : 0)] };
};

const body = (look: Look, bold?: boolean, italic?: boolean) => face(look.fonts, look.font, bold, italic);
const heading = (look: Look) => face(look.fonts, look.headingFont, true);

// What the User's custom rules say about a part of the page, over the template's own look for it: a face for bold and
// italic (the PDF has one face per weight), and the other properties as they are.
const custom = (look: Look, part: Part, base: { bold?: boolean; italic?: boolean; heading?: boolean } = {}): Style => ({
  ...face(look.fonts, base.heading ? look.headingFont : look.font, look.custom.bold[part] ?? base.bold, look.custom.italic[part] ?? base.italic),
  ...look.custom.styles[part],
});

function Runs({ runs, look }: { runs: Run[]; look: Look }) {
  return (
    <>
      {runs.map((run, i) => {
        const style: Style = {
          ...body(look, run.bold ?? look.custom.bold.text, run.italic ?? look.custom.italic.text),
          textDecoration: run.underline || run.href ? "underline" : "none",
          ...(run.color ? { color: run.color } : run.href ? { color: look.accent } : {}),
        };
        return run.href ? (
          <Link key={i} src={run.href} style={style}>
            {run.text}
          </Link>
        ) : (
          <Text key={i} style={style}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}

function RichBlocks({ rich, look }: { rich: Rich[]; look: Look }) {
  return (
    <>
      {rich.map((block, i) =>
        block.kind === "paragraph" ? (
          <Text key={i} style={{ textAlign: block.align ?? "left", marginBottom: 3 * look.gap, ...look.custom.styles.text }}>
            <Runs runs={block.runs} look={look} />
          </Text>
        ) : (
          <View key={i} style={{ marginBottom: 3 * look.gap }}>
            {block.items.map((item, n) => (
              <View key={n} style={{ flexDirection: "row", marginBottom: 1 }}>
                <Text style={{ width: 14 }}>{block.ordered ? `${n + 1}.` : "•"}</Text>
                <Text style={{ flex: 1 }}>
                  <Runs runs={item} look={look} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </>
  );
}

// Title and dates: on one line (dates at the right edge), or the dates under the title.
function Head({ title, dates, look }: { title: string; dates: string; look: Look }) {
  return (
    <View style={{ flexDirection: look.stacked ? "column" : "row", justifyContent: "space-between" }} wrap={false}>
      <Text style={custom(look, "entry-title", { bold: true })}>{title}</Text>
      {dates && <Text style={custom(look, "entry-dates")}>{dates}</Text>}
    </View>
  );
}

// The photo in its frame: a square, rounded or round window onto the picture, which is zoomed and slid by the crop.
function PhotoView({ frame, src }: { frame: PhotoFrame; src: string }) {
  const big = (frame.size * frame.zoom) / 100;
  const spare = big - frame.size;
  const radius = frame.shape === "circle" ? frame.size / 2 : frame.shape === "rounded" ? frame.size / 6 : 0;
  return (
    <View style={{ width: frame.size, height: frame.size, borderRadius: radius, overflow: "hidden", marginLeft: 12 }}>
      {/* react-pdf's Image draws into the PDF; it is not an HTML img, so it has no alt text to give. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        src={src}
        style={{
          width: big,
          height: big,
          objectFit: "cover",
          objectPositionX: `${frame.cropX}%`,
          objectPositionY: `${frame.cropY}%`,
          marginLeft: (-spare * frame.cropX) / 100,
          marginTop: (-spare * frame.cropY) / 100,
        }}
      />
    </View>
  );
}

function HeaderView({ block, look }: { block: Extract<Block, { kind: "header" }>; look: Look }) {
  const color = look.modern ? { color: "#ffffff" } : {};
  return (
    <View style={{ marginBottom: look.modern ? 0 : 8 * look.gap, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ flex: 1 }}>
      {block.name && (
        <Text style={{ ...heading(look), ...color, fontSize: look.size * 2.2, ...custom(look, "name", { bold: true, heading: true }) }}>
          {block.name}
        </Text>
      )}
      {block.headline && (
        <Text style={{ ...body(look), ...color, fontSize: look.size * 1.2, marginTop: 2, ...custom(look, "headline") }}>{block.headline}</Text>
      )}
      {block.contact.length > 0 && (
        <Text style={{ ...color, marginTop: 4, ...custom(look, "contact") }}>{block.contact.join("  |  ")}</Text>
      )}
      </View>
      {block.photo && look.photoSrc && <PhotoView frame={block.photo} src={look.photoSrc} />}
    </View>
  );
}

function BlockView({ block, look }: { block: Block; look: Look }) {
  switch (block.kind) {
    case "header":
      return <HeaderView block={block} look={look} />;
    case "heading":
      return (
        <Text
          style={{
            ...heading(look),
            fontSize: look.size * 1.2,
            color: look.accent,
            textTransform: "uppercase",
            borderBottomWidth: look.modern ? 0 : 1,
            borderBottomColor: look.accent,
            paddingBottom: look.modern ? 0 : 2,
            marginTop: 10 * look.gap,
            marginBottom: 5 * look.gap,
            ...custom(look, "heading", { bold: true, heading: true }),
          }}
        >
          {block.text}
        </Text>
      );
    case "text":
      return <RichBlocks rich={block.rich} look={look} />;
    case "entry": {
      const second = [block.subtitle, block.location].filter(Boolean).join(", ");
      return (
        <View style={{ marginBottom: 6 * look.gap, ...look.custom.styles.entry }}>
          <Head title={[block.title, block.level].filter(Boolean).join(" - ")} dates={block.dates} look={look} />
          {second && <Text style={custom(look, "entry-subtitle", { italic: true })}>{second}</Text>}
          {block.url && (
            <Link src={block.url} style={{ color: look.accent }}>
              {block.url}
            </Link>
          )}
          <RichBlocks rich={block.rich} look={look} />
          {block.roles.map((role, i) => (
            <View key={i} style={{ marginTop: 3 * look.gap }}>
              <Head title={role.title} dates={role.dates} look={look} />
              <RichBlocks rich={role.rich} look={look} />
            </View>
          ))}
          {block.keywords.length > 0 && <Text>{block.keywords.join(", ")}</Text>}
        </View>
      );
    }
  }
}

// A run of blocks: with two columns of entries, neighbouring entries sit side by side (in reading order, left then
// right), and everything else goes down the page as before.
function Blocks({ list, look }: { list: Block[]; look: Look }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < list.length; i++) {
    if (look.twoColumns && list[i].kind === "entry") {
      const row: Block[] = [];
      while (i < list.length && list[i].kind === "entry") row.push(list[i++]);
      i--;
      out.push(
        <View key={i} style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {row.map((block, n) => (
            <View key={n} style={{ width: "50%", paddingRight: n % 2 === 0 ? 10 : 0 }}>
              <BlockView block={block} look={look} />
            </View>
          ))}
        </View>,
      );
    } else {
      out.push(<BlockView key={i} block={list[i]} look={look} />);
    }
  }
  return <>{out}</>;
}

export function ResumePdf({ doc, fonts, photoSrc = null }: { doc: Doc; fonts: Fonts; photoSrc?: string | null }) {
  const m = doc.metadata;
  const template = templateOf(doc);
  const density = DENSITIES.find((d) => d.value === m.density) ?? DENSITIES[1];
  const look: Look = {
    fonts,
    font: m.font,
    headingFont: m.headingFont || m.font,
    size: m.fontSize,
    accent: m.accent,
    gap: density.gap,
    twoColumns: m.entryColumns === 2,
    stacked: m.entryHeader === "stacked",
    modern: template === "modern",
    custom: customStyles(m.customCss),
    photoSrc,
  };
  const [header, ...rest] = resumeBlocks(doc);
  const pages = [...new Set(rest.map((b) => (b.kind === "header" ? 1 : b.page)).concat(1))].sort((a, b) => a - b);
  const size = pageDimensions(m);
  return (
    <Document title={doc.basics.name || undefined} language={doc.locale}>
      {pages.map((page) => {
        const here = rest.filter((b) => b.kind !== "header" && b.page === page);
        const first = page === pages[0];
        const side = here.filter((b) => b.kind !== "header" && b.column === "side");
        const main = here.filter((b) => b.kind !== "header" && b.column === "main");
        return (
          <Page
            key={page}
            size={size}
            style={{
              ...body(look),
              fontSize: look.size,
              lineHeight: density.line,
              color: "#111111",
              padding: look.modern && first ? 0 : m.margin,
            }}
          >
            {look.modern && first ? (
              <>
                <View style={{ backgroundColor: look.accent, padding: m.margin, paddingBottom: 22 }}>
                  <Blocks list={[header]} look={look} />
                </View>
                <View style={{ padding: m.margin, paddingTop: 12 }}>
                  <Blocks list={here} look={look} />
                </View>
              </>
            ) : template === "sidebar" ? (
              <>
                {first && <Blocks list={[header]} look={look} />}
                <View style={{ flexDirection: m.sidebarSide === "right" ? "row-reverse" : "row" }}>
                  <View style={{ width: m.sidebarWidth, [m.sidebarSide === "right" ? "paddingLeft" : "paddingRight"]: 16 }}>
                    <Blocks list={side} look={look} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Blocks list={main} look={look} />
                  </View>
                </View>
              </>
            ) : (
              <Blocks list={first ? [header, ...here] : here} look={look} />
            )}
          </Page>
        );
      })}
    </Document>
  );
}
