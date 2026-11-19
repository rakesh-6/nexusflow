import type { RichTextDoc, RichTextMark, RichTextNode } from "@nexusflow/shared";
import { Fragment, type ReactNode } from "react";

// Shows a stored comment from its editor JSON as ordinary React elements, so
// no HTML from the database is ever put on the page (PRD SEC-07). Loading the
// whole editor for every comment would be slow; this is a few lines instead.

const safeHref = (href: unknown) =>
  typeof href === "string" && /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href : null;

function withMarks(text: string, marks: RichTextMark[] = []): ReactNode {
  return marks.reduce<ReactNode>((child, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{child}</strong>;
      case "italic":
        return <em>{child}</em>;
      case "strike":
        return <s>{child}</s>;
      case "underline":
        return <u>{child}</u>;
      case "code":
        return <code>{child}</code>;
      case "link": {
        const href = safeHref(mark.attrs?.["href"]);
        return href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {child}
          </a>
        ) : (
          child
        );
      }
      default:
        return child;
    }
  }, text);
}

function renderNode(node: RichTextNode, key: string): ReactNode {
  const children = () =>
    (node.content ?? []).map((child, index) => renderNode(child, `${key}.${index}`));
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{withMarks(node.text ?? "", node.marks)}</Fragment>;
    case "paragraph":
      return <p key={key}>{children()}</p>;
    case "heading":
      return node.attrs?.["level"] === 2 ? (
        <h2 key={key}>{children()}</h2>
      ) : (
        <h3 key={key}>{children()}</h3>
      );
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList": {
      const start = node.attrs?.["start"];
      return (
        <ol key={key} start={typeof start === "number" ? start : undefined}>
          {children()}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children()}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "mention":
      return (
        <span key={key} className="mention">
          @{String(node.attrs?.["label"] ?? "")}
        </span>
      );
    default:
      return null;
  }
}

export function CommentBody({ doc }: { doc: RichTextDoc }) {
  return (
    <div className="prose-task text-sm">
      {(doc.content ?? []).map((node, index) => renderNode(node, String(index)))}
    </div>
  );
}
