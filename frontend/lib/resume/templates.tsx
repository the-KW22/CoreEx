import { Document, Link, Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import type { components } from "@/lib/api/schema";

import { type Block, type Template, resumeBlocks, templateOf } from "./blocks";
import type { Rich, Run } from "./html";

type Doc = components["schemas"]["ResumeDocument"];

// The three templates share the drawing of every block and differ in layout. "Classic": one column, real text in reading
// order, plain headings and nothing a hiring system cannot read (no icons, tables or text in images). "Sidebar": the
// header across the top, then a narrow column of short lists beside the main one. "Modern": one column under a header
// band in the accent colour. Written for CoreEx; any later code taken from Reactive Resume (MIT) keeps its licence
// notice here.

// The font family the page uses: "Inter" when its files were registered, else the built-in Helvetica.
export type Fonts = { registered: boolean };

const face = (fonts: Fonts, bold?: boolean, italic?: boolean): Style =>
  fonts.registered
    ? { fontFamily: "Inter", fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal" }
    : { fontFamily: bold ? (italic ? "Helvetica-BoldOblique" : "Helvetica-Bold") : italic ? "Helvetica-Oblique" : "Helvetica" };

function Runs({ runs, fonts, accent }: { runs: Run[]; fonts: Fonts; accent: string }) {
  return (
    <>
      {runs.map((run, i) => {
        const style: Style = {
          ...face(fonts, run.bold, run.italic),
          textDecoration: run.underline || run.href ? "underline" : "none",
          ...(run.color ? { color: run.color } : run.href ? { color: accent } : {}),
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

function RichBlocks({ rich, fonts, accent }: { rich: Rich[]; fonts: Fonts; accent: string }) {
  return (
    <>
      {rich.map((block, i) =>
        block.kind === "paragraph" ? (
          <Text key={i} style={{ textAlign: block.align ?? "left", marginBottom: 3 }}>
            <Runs runs={block.runs} fonts={fonts} accent={accent} />
          </Text>
        ) : (
          <View key={i} style={{ marginBottom: 3 }}>
            {block.items.map((item, n) => (
              <View key={n} style={{ flexDirection: "row", marginBottom: 1 }}>
                <Text style={{ width: 14 }}>{block.ordered ? `${n + 1}.` : "•"}</Text>
                <Text style={{ flex: 1 }}>
                  <Runs runs={item} fonts={fonts} accent={accent} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </>
  );
}

function HeaderView({ block, fonts, size, light }: { block: Extract<Block, { kind: "header" }>; fonts: Fonts; size: number; light: boolean }) {
  const color = light ? { color: "#ffffff" } : {};
  return (
    <View style={{ marginBottom: light ? 0 : 8 }}>
      {block.name && <Text style={{ ...face(fonts, true), ...color, fontSize: size * 2.2 }}>{block.name}</Text>}
      {block.headline && <Text style={{ ...color, fontSize: size * 1.2, marginTop: 2 }}>{block.headline}</Text>}
      {block.contact.length > 0 && <Text style={{ ...color, marginTop: 4 }}>{block.contact.join("  |  ")}</Text>}
    </View>
  );
}

function BlockView({ block, fonts, accent, size, variant }: { block: Block; fonts: Fonts; accent: string; size: number; variant: Template }) {
  switch (block.kind) {
    case "header":
      return <HeaderView block={block} fonts={fonts} size={size} light={variant === "modern"} />;
    case "heading":
      return (
        <Text
          style={{
            ...face(fonts, true),
            fontSize: size * 1.2,
            color: accent,
            textTransform: "uppercase",
            borderBottomWidth: variant === "modern" ? 0 : 1,
            borderBottomColor: accent,
            paddingBottom: variant === "modern" ? 0 : 2,
            marginTop: 10,
            marginBottom: 5,
          }}
        >
          {block.text}
        </Text>
      );
    case "text":
      return <RichBlocks rich={block.rich} fonts={fonts} accent={accent} />;
    case "entry": {
      const second = [block.subtitle, block.location].filter(Boolean).join(", ");
      return (
        <View style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
            <Text style={face(fonts, true)}>{[block.title, block.level].filter(Boolean).join(" - ")}</Text>
            {block.dates && <Text>{block.dates}</Text>}
          </View>
          {second && <Text style={face(fonts, false, true)}>{second}</Text>}
          {block.url && (
            <Link src={block.url} style={{ color: accent }}>
              {block.url}
            </Link>
          )}
          <RichBlocks rich={block.rich} fonts={fonts} accent={accent} />
          {block.roles.map((role, i) => (
            <View key={i} style={{ marginTop: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
                <Text style={face(fonts, true)}>{role.title}</Text>
                {role.dates && <Text>{role.dates}</Text>}
              </View>
              <RichBlocks rich={role.rich} fonts={fonts} accent={accent} />
            </View>
          ))}
          {block.keywords.length > 0 && <Text>{block.keywords.join(", ")}</Text>}
        </View>
      );
    }
  }
}

export function ResumePdf({ doc, fonts }: { doc: Doc; fonts: Fonts }) {
  const { accent, fontSize, pageSize } = doc.metadata;
  const variant = templateOf(doc);
  const [header, ...rest] = resumeBlocks(doc);
  const draw = (list: Block[]) =>
    list.map((block, i) => <BlockView key={i} block={block} fonts={fonts} accent={accent} size={fontSize} variant={variant} />);
  const PAD = 40;
  return (
    <Document title={doc.basics.name || undefined} language={doc.locale}>
      <Page
        size={pageSize === "LETTER" ? "LETTER" : "A4"}
        style={{ ...face(fonts), fontSize, lineHeight: 1.35, color: "#111111", padding: variant === "modern" ? 0 : PAD }}
      >
        {variant === "modern" ? (
          <>
            <View style={{ backgroundColor: accent, padding: PAD, paddingBottom: 22 }}>{draw([header])}</View>
            <View style={{ padding: PAD, paddingTop: 12 }}>{draw(rest)}</View>
          </>
        ) : variant === "sidebar" ? (
          <>
            {draw([header])}
            <View style={{ flexDirection: "row" }}>
              <View style={{ width: 170, paddingRight: 16 }}>{draw(rest.filter((b) => b.kind !== "header" && b.column === "side"))}</View>
              <View style={{ flex: 1 }}>{draw(rest.filter((b) => b.kind !== "header" && b.column === "main"))}</View>
            </View>
          </>
        ) : (
          draw([header, ...rest])
        )}
      </Page>
    </Document>
  );
}
