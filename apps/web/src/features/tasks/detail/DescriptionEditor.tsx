import type { RichTextDoc } from "@nexusflow/shared";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

// The rich-text description (Tiptap, PRD §11.6). Loaded only when a task is
// opened, because the editor is a large download. It stores the editor's JSON;
// the server accepts only the formatting this toolbar can make.

const TOOLS: {
  label: string;
  icon: LucideIcon;
  active: string;
  run: (editor: Editor) => void;
  attrs?: object;
}[] = [
  { label: "Bold", icon: Bold, active: "bold", run: (e) => e.chain().focus().toggleBold().run() },
  {
    label: "Italic",
    icon: Italic,
    active: "italic",
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: "Strikethrough",
    icon: Strikethrough,
    active: "strike",
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  { label: "Code", icon: Code, active: "code", run: (e) => e.chain().focus().toggleCode().run() },
  {
    label: "Heading",
    icon: Heading2,
    active: "heading",
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Bullet list",
    icon: List,
    active: "bulletList",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: ListOrdered,
    active: "orderedList",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    icon: Quote,
    active: "blockquote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

function Toolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => TOOLS.map((tool) => current.isActive(tool.active)),
  });
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b p-1">
      {TOOLS.map((tool, index) => (
        <button
          key={tool.label}
          type="button"
          aria-label={tool.label}
          aria-pressed={active[index]}
          title={tool.label}
          onClick={() => tool.run(editor)}
          className={cn(
            "flex size-7 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-surface hover:text-foreground",
            active[index] && "bg-surface text-foreground",
          )}
        >
          <tool.icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default function DescriptionEditor({
  value,
  editable,
  saving,
  onSave,
}: {
  value: RichTextDoc | null;
  editable: boolean;
  saving: boolean;
  onSave: (doc: RichTextDoc | null) => void;
}) {
  const [dirty, setDirty] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
      Placeholder.configure({ placeholder: editable ? "Add a description…" : "No description" }),
    ],
    content: value ?? "",
    editable,
    // Rendered on the client only (the editor needs the browser).
    immediatelyRender: false,
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: {
        "aria-label": "Task description",
        class: "prose-task min-h-24 px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  if (!editor) return <div className="min-h-24 rounded-control border" />;

  const save = () => {
    onSave(editor.isEmpty ? null : (editor.getJSON() as RichTextDoc));
    setDirty(false);
  };
  const cancel = () => {
    editor.commands.setContent(value ?? "");
    setDirty(false);
  };

  return (
    <div className={cn("rounded-control", editable && "border")}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {editable && dirty && (
        <div className="flex justify-end gap-2 border-t p-2">
          <Button variant="ghost" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save description"}
          </Button>
        </div>
      )}
    </div>
  );
}
