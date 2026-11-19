import type { MentionablePerson, RichTextDoc } from "@nexusflow/shared";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, mergeAttributes, Node, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { AtSign, Bold, Code, Italic, List, ListOrdered, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { UserAvatar } from "../../../components/common/UserAvatar";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover";

// The comment box (PRD §11.9): bold, italic, code, lists, links and @mentions.
// Loaded only when a task opens, together with the description editor.

/** An @mention, stored as { type: "mention", attrs: { id, label } } like the server expects. */
const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { id: { default: null, rendered: false }, label: { default: null, rendered: false } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-mention-id]",
        getAttrs: (element) => ({
          id: (element as HTMLElement).getAttribute("data-mention-id"),
          label: (element as HTMLElement).getAttribute("data-mention-label"),
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "mention",
        "data-mention-id": node.attrs["id"],
        "data-mention-label": node.attrs["label"],
      }),
      `@${node.attrs["label"] ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs["label"] ?? ""}`;
  },
});

const TOOLS: { label: string; icon: LucideIcon; run: (editor: Editor) => void }[] = [
  { label: "Bold", icon: Bold, run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: Italic, run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "Code", icon: Code, run: (e) => e.chain().focus().toggleCode().run() },
  { label: "Bullet list", icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  {
    label: "Numbered list",
    icon: ListOrdered,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
];

function MentionPicker({ editor, people }: { editor: Editor; people: MentionablePerson[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const shown = people.filter((person) =>
    person.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const insert = (person: MentionablePerson) => {
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "mention", attrs: { id: person.id, label: person.name } },
        { type: "text", text: " " },
      ])
      .run();
    setOpen(false);
    setSearch("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Mention someone"
        title="Mention someone"
        className="flex size-7 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-surface hover:text-foreground"
      >
        <AtSign className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent>
        <Input
          autoFocus
          aria-label="Search people"
          placeholder="Search people"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && shown[0]) {
              event.preventDefault();
              insert(shown[0]);
            }
          }}
          className="mb-2 h-8"
        />
        <ul className="max-h-56 overflow-y-auto" aria-label="People">
          {shown.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">Nobody found</li>
          )}
          {shown.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => insert(person)}
                className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-sm hover:bg-surface"
              >
                <UserAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-5" />
                <span className="truncate">{person.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default function CommentEditor({
  initial,
  people,
  placeholder,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
  onTyping,
  autoFocus = false,
}: {
  initial?: RichTextDoc | null;
  people: MentionablePerson[];
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (body: RichTextDoc) => void;
  onCancel?: () => void;
  /** Called while the person types, so others can see "… is typing". */
  onTyping?: () => void;
  autoFocus?: boolean;
}) {
  const [empty, setEmpty] = useState(!initial);
  const submitRef = useRef<() => void>(() => {});
  const typingRef = useRef(onTyping);
  typingRef.current = onTyping;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
      Placeholder.configure({ placeholder }),
      Mention,
    ],
    content: initial ?? "",
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: current }) => {
      setEmpty(current.isEmpty);
      if (!current.isEmpty) typingRef.current?.();
    },
    editorProps: {
      attributes: {
        "aria-label": placeholder,
        class: "prose-task min-h-16 px-3 py-2 text-sm focus:outline-none",
      },
      // Ctrl+Enter (⌘+Enter on Mac) sends the comment.
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          submitRef.current();
          return true;
        }
        return false;
      },
    },
  });

  if (!editor) return <div className="min-h-24 rounded-control border" />;
  submitRef.current = () => {
    if (!editor.isEmpty && !busy) onSubmit(editor.getJSON() as RichTextDoc);
  };

  return (
    <div className="rounded-control border bg-card">
      <EditorContent editor={editor} />
      <div className="flex flex-wrap items-center gap-0.5 border-t p-1">
        <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5">
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              aria-label={tool.label}
              title={tool.label}
              onClick={() => tool.run(editor)}
              className="flex size-7 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <tool.icon className="size-4" aria-hidden="true" />
            </button>
          ))}
          <MentionPicker editor={editor} people={people} />
        </div>
        <span className="ml-auto hidden px-2 text-xs text-muted-foreground sm:inline">
          Ctrl+Enter to send
        </span>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" disabled={empty || busy} onClick={() => submitRef.current()}>
          {busy ? "Sending…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
