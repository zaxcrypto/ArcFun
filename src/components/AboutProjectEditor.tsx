"use client";
import React, { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  Editor,
} from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import CodeBlock from "@tiptap/extension-code-block";
import { NodeViewWrapper as NVW, NodeViewContent } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { supabase } from "@/lib/supabase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/gif"];
const MAX_SIZE = 2 * 1024 * 1024;

async function uploadImageFile(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type))
    throw new Error(`Invalid format: ${file.name}. Allowed: PNG, JPG, JPEG, WEBP, SVG, GIF.`);
  if (file.size > MAX_SIZE)
    throw new Error(`${file.name} is over 2MB.`);
  const ext = file.name.split(".").pop();
  const path = `logos/about_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("project-logos").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("project-logos").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Fullscreen Viewer ────────────────────────────────────────────────────────

const FullscreenViewer = ({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose: () => void;
}) => {
  const [showCaption, setShowCaption] = React.useState(true);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 999999,
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(12px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 20, right: 20,
          background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)",
          color: "#fff", borderRadius: "50%", width: 40, height: 40,
          cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >✕</button>

      {/* Image */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "88vw", maxHeight: caption && showCaption ? "72vh" : "82vh",
          objectFit: "contain", borderRadius: 10,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          transition: "max-height 0.25s ease",
        }}
      />

      {/* Caption */}
      {caption && showCaption && (
        <p style={{
          marginTop: 20, color: "rgba(255,255,255,0.85)", fontSize: 15,
          textAlign: "center", maxWidth: "70%", lineHeight: 1.55,
          fontStyle: "italic",
        }}>
          {caption}
        </p>
      )}

      {/* Toggle caption */}
      {caption && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowCaption(!showCaption); }}
          style={{
            position: "absolute", bottom: 28,
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff", borderRadius: 20, padding: "7px 18px", cursor: "pointer", fontSize: 13,
          }}
        >
          {showCaption ? "Hide Caption" : "Show Caption"}
        </button>
      )}
    </div>,
    document.body
  );
};

// ─── Image Card Component ─────────────────────────────────────────────────────

const ImageFigureComponent = (props: any) => {
  const { node, updateAttributes, deleteNode, editor } = props;
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [caption, setCaption] = React.useState(node.attrs.caption || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptionBlur = useCallback(() => {
    updateAttributes({ caption });
  }, [caption, updateAttributes]);

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageFile(file);
      updateAttributes({ src: url });
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <NodeViewWrapper style={{ margin: "1.5rem auto", maxWidth: 600, userSelect: "none" }} contentEditable={false}>
      {/* Hidden replace input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
        style={{ display: "none" }}
        onChange={handleReplace}
      />

      <div style={{
        border: "1px solid #555",
        borderRadius: 12,
        background: "var(--surface, #fff)",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>

        {/* ── Card Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #555",
          background: "var(--surface-hover, #f9fafb)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted, #6b7280)", fontSize: 13, fontWeight: 600 }}>
            {/* Image icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            Image
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <HeaderBtn icon="⛶" label="Fullscreen" onClick={() => setIsFullscreen(true)} />
            <HeaderBtn icon="✕" label="Remove" onClick={() => {
              if (window.confirm("Are you sure you want to remove this image?")) deleteNode();
            }} danger />
          </div>
        </div>

        {/* ── Image ── */}
        <div style={{ background: "var(--surface-hover, #f9fafb)", padding: "16px 16px 12px", display: "flex", justifyContent: "center" }}>
          <img
            src={node.attrs.src}
            alt={caption || "Project image"}
            onClick={() => setIsFullscreen(true)}
            style={{
              maxWidth: "100%",
              maxHeight: 380,
              objectFit: "contain",
              borderRadius: 8,
              cursor: "zoom-in",
              display: "block",
              boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            }}
          />
        </div>

        {/* ── Caption ── */}
        <div style={{ padding: "12px 16px 0" }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: 700,
            color: "var(--accent-red, #7c6fcd)",
            marginBottom: 6, letterSpacing: 0.2,
          }}>
            {/* Caption icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="8" x2="21" y2="8" /><line x1="3" y1="12" x2="15" y2="12" />
            </svg>
            Caption (optional)
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={handleCaptionBlur}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            placeholder="Write a caption..."
            rows={2}
            style={{
              width: "100%", boxSizing: "border-box",
              border: "1px solid #555",
              borderRadius: 6, padding: "8px 10px",
              fontSize: 13, color: "var(--text-primary)",
              background: "var(--surface, #fff)",
              resize: "vertical", outline: "none",
              fontFamily: "inherit", lineHeight: 1.5,
            }}
          />
          <p style={{ fontSize: 11, color: "var(--text-muted, #9ca3af)", margin: "4px 0 0" }}>
            This caption will be shown below the image.
          </p>
        </div>

        {/* ── Bottom Toolbar ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "10px 16px 12px", gap: 8,
        }}>
          <ActionBtn
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            }
            label="Replace Image"
            onClick={() => fileInputRef.current?.click()}
          />
          <ActionBtn
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            }
            label="Remove Image"
            onClick={() => {
              if (window.confirm("Are you sure you want to remove this image?")) deleteNode();
            }}
            danger
          />
        </div>
      </div>

      {/* Fullscreen */}
      {isFullscreen && (
        <FullscreenViewer
          src={node.attrs.src}
          caption={caption}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </NodeViewWrapper>
  );
};

// ─── Small reusable buttons ───────────────────────────────────────────────────

const HeaderBtn = ({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 600,
      color: danger ? "#ef4444" : "var(--text-secondary, #6b7280)",
      background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
      borderRadius: 4,
    }}
  >
    <span style={{ fontSize: 11 }}>{icon}</span>
    {label}
  </button>
);

const ActionBtn = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 5,
      fontSize: 12, fontWeight: 600,
      color: danger ? "#ef4444" : "var(--text-secondary, #6b7280)",
      background: "none",
      border: `1px solid ${danger ? "#fecaca" : "var(--border, #e5e7eb)"}`,
      borderRadius: 6, padding: "5px 10px", cursor: "pointer",
    }}
  >
    {icon}
    {label}
  </button>
);

// ─── ImageFigure TipTap Node ──────────────────────────────────────────────────

const ImageFigure = Node.create({
  name: "imageFigure",
  group: "block",
  content: "",
  draggable: true,
  selectable: false,   // prevents ProseMirror drawing a black selection border around image cards

  addAttributes() {
    return {
      src:     { default: null },
      alt:     { default: null },
      caption: { default: "" },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("preventImageDelete"),
        props: {
          handleKeyDown(view, event) {
            if (event.key === "Backspace" || event.key === "Delete") {
              const { state } = view;
              const { selection } = state;
              
              if ('node' in selection && (selection as any).node.type.name === 'imageFigure') {
                if (window.confirm("Are you sure you want to remove this image?")) return false; 
                return true; 
              }
              
              if (selection.empty) {
                const { $head } = selection;
                if (event.key === "Backspace") {
                  if ($head.parentOffset === 0) {
                    const $pos = state.doc.resolve($head.before());
                    if ($pos.nodeBefore && $pos.nodeBefore.type.name === 'imageFigure') {
                       if (!window.confirm("Are you sure you want to remove this image?")) {
                          // Jump cursor above the image to be safe
                          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, $pos.pos - $pos.nodeBefore.nodeSize)));
                          return true;
                       }
                    }
                  } else if ($head.nodeBefore && $head.nodeBefore.type.name === 'imageFigure') {
                     if (!window.confirm("Are you sure you want to remove this image?")) {
                       return true;
                     }
                  }
                } else if (event.key === "Delete") {
                   if ($head.parentOffset === $head.parent.content.size) {
                      const $pos = state.doc.resolve($head.after());
                      if ($pos.nodeAfter && $pos.nodeAfter.type.name === 'imageFigure') {
                         if (!window.confirm("Are you sure you want to remove this image?")) {
                            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, $pos.pos + $pos.nodeAfter.nodeSize)));
                            return true;
                         }
                      }
                   } else if ($head.nodeAfter && $head.nodeAfter.type.name === 'imageFigure') {
                      if (!window.confirm("Are you sure you want to remove this image?")) {
                        return true;
                      }
                   }
                }
              }
              return false;
            }
            return false;
          }
        }
      })
    ];
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-image-figure]",
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const img = node.querySelector("img");
          const cap = node.querySelector("figcaption");
          return {
            src:     img?.getAttribute("src") || null,
            alt:     img?.getAttribute("alt") || null,
            caption: cap?.textContent || "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { src, alt, caption } = HTMLAttributes;
    return [
      "figure",
      {
        "data-image-figure": "",
        style: "margin:1.5rem auto;max-width:600px;text-align:center;",
      },
      ["img", {
        src, alt: alt || caption || "",
        style: "max-width:100%;max-height:380px;object-fit:contain;border-radius:8px;",
      }],
      ...(caption
        ? [["figcaption", {
            style: "margin-top:8px;font-size:13px;font-style:italic;color:var(--text-secondary,#6b7280);",
          }, caption]]
        : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageFigureComponent);
  },
});

// ─── Code Block ───────────────────────────────────────────────────────────────

const CodeBlockComponent = (props: any) => {
  const copy = () => navigator.clipboard.writeText(props.node.textContent);
  const remove = () => props.deleteNode();
  return (
    <NodeViewWrapper style={{ position: "relative", background: "#1e1e1e", border: "1px solid #444", borderRadius: 8, margin: "16px 0", overflow: "hidden" }}>
      <div style={{ background: "#2d2d2d", padding: "6px 12px", borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#888", fontSize: 11, fontFamily: "monospace" }}>code</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={copy}
            style={{ background: "#3d3d3d", border: "1px solid #555", color: "#ccc", borderRadius: 4, padding: "2px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            Copy
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={remove}
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", borderRadius: 4, padding: "2px 8px", fontSize: 13, cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>
            ✕
          </button>
        </div>
      </div>
      <pre style={{ padding: 16, margin: 0, overflowX: "auto", background: "transparent" }}>
        <NodeViewContent style={{ fontFamily: "monospace", color: "#e6e6e6", fontSize: 13, whiteSpace: "pre" }} />
      </pre>
    </NodeViewWrapper>
  );
};

const CustomCodeBlock = CodeBlock.extend({
  addNodeView() { return ReactNodeViewRenderer(CodeBlockComponent); },
});

// ─── Toolbar Button ───────────────────────────────────────────────────────────

const ToolbarBtn = ({
  active, onClick, children,
}: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    style={{
      padding: "5px 10px",
      background: active ? "var(--text-primary)" : "var(--surface)",
      color: active ? "var(--surface)" : "var(--text-primary)",
      border: "1px solid var(--border)",
      borderRadius: 6, fontSize: 13, fontWeight: 600,
      cursor: "pointer", transition: "background 0.12s, color 0.12s",
    }}
  >
    {children}
  </button>
);

// ─── Editor ───────────────────────────────────────────────────────────────────

// Parse stored HTML → separate title string + body HTML
function parseContent(html: string) {
  const titleMatch = html.match(/^<h1[^>]*>(.*?)<\/h1>/is);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "") : "";
  const body  = titleMatch ? html.slice(titleMatch[0].length) : html;
  return { title, body };
}

export const AboutProjectEditor = ({
  content,
  onChange,
}: {
  content: string;
  onChange: (html: string) => void;
}) => {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const { title: initTitle, body: initBody } = React.useMemo(() => parseContent(content), []);
  const [title, setTitle] = React.useState(initTitle);

  // emit combined HTML whenever title or body changes
  const emitChange = React.useCallback(
    (bodyHTML: string, newTitle: string) => {
      const titlePart = newTitle.trim() ? `<h1>${newTitle}</h1>` : "";
      onChange(titlePart + bodyHTML);
    },
    [onChange]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: false }),
      CustomCodeBlock,
      ImageFigure,
      LinkExtension.configure({ openOnClick: false }),
      UnderlineExtension,
    ],
    content: initBody,
    onUpdate: ({ editor }) => emitChange(editor.getHTML(), title),
    onSelectionUpdate: () => forceUpdate(),
    onTransaction: () => forceUpdate(),
  });

  if (!editor) return null;

  // ─── Multi-image upload ───────────────────────────────────────────────────
  const addImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/jpeg,image/png,image/webp,image/svg+xml,image/gif";
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files) as File[];
      for (const file of files) {
        try {
          const url = await uploadImageFile(file);
          editor.chain().focus().insertContent({
            type: "imageFigure",
            attrs: { src: url, caption: "" },
          }).run();
        } catch (err: any) {
          alert(err.message);
        }
      }
    };
    input.click();
  };

  // ─── Link ─────────────────────────────────────────────────────────────────
  const addLink = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return alert("Select text first to convert it to a link.");
    const url = window.prompt("Enter URL:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  // ─── Code block ───────────────────────────────────────────────────────────
  const insertCodeBlock = () =>
    editor.chain().focus().insertContent({
      type: "codeBlock",
      content: [{ type: "text", text: "// code here" }],
    }).run();

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <style>{`
        /* ── ProseMirror contentEditable reset ── */
        .apt-prose .ProseMirror {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
          -webkit-tap-highlight-color: transparent;
          -webkit-appearance: none;
          min-height: 100px; /* Reduced to remove initial empty space */
          cursor: text;
        }
        .apt-prose .ProseMirror:focus {
          outline: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .apt-prose .ProseMirror > * + * { margin-top: 0.5em; }
        .apt-prose .ProseMirror p { margin: 0.3rem 0; }
        .apt-prose .ProseMirror blockquote {
          border-left: 3px solid var(--accent-red, #b8860b);
          padding: 4px 14px;
          margin: 0.5rem 0;
          border-radius: 0 4px 4px 0;
          font-style: italic;
          color: var(--text-secondary);
          font-size: 0.95em;
        }
        .apt-prose .ProseMirror a { color: var(--accent-red); text-decoration: underline; }
        /* Placeholder for empty body */
        .apt-prose .ProseMirror p.is-editor-empty:first-child::before {
          content: "Start writing...";
          color: var(--text-muted, #9ca3af);
          pointer-events: none;
          float: left;
          height: 0;
        }
        /* Suppress node-selection outline */
        .apt-prose .ProseMirror-selectednode { outline: none !important; }
        .apt-prose .ProseMirror-gapcursor { display: none !important; }
        /* Title textarea reset */
        .apt-title-input {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          resize: none;
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
          font-family: inherit;
          line-height: 1.3;
          padding: 0;
          box-shadow: none;
          -webkit-appearance: none;
        }
        .apt-title-input::placeholder { color: var(--text-muted, #9ca3af); font-weight: 800; }
        
        /* Custom Scrollbar for Editor */
        .apt-editor-wrap::-webkit-scrollbar {
          width: 8px;
        }
        .apt-editor-wrap::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 4px;
        }
        .apt-editor-wrap::-webkit-scrollbar-thumb {
          background-color: var(--border, #4b5563);
          border-radius: 4px;
        }
        .apt-editor-wrap::-webkit-scrollbar-thumb:hover {
          background-color: var(--text-muted, #9ca3af);
        }
      `}</style>

      {/* ── Formatting Toolbar ── */}
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid var(--border)",
        background: "var(--surface-hover)",
        display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center",
      }}>
        <ToolbarBtn active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}>Bold</ToolbarBtn>
        <ToolbarBtn active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</ToolbarBtn>
        <ToolbarBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>Underline</ToolbarBtn>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
        <ToolbarBtn active={editor.isActive("codeBlock")}  onClick={insertCodeBlock}>Code</ToolbarBtn>
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
        <ToolbarBtn active={editor.isActive("link")} onClick={addLink}>Link</ToolbarBtn>
        <ToolbarBtn onClick={addImage}>Image</ToolbarBtn>
      </div>

      {/* ── Title Field ── */}
      <div style={{ padding: "20px 20px 0" }}>
        <textarea
          className="apt-title-input"
          rows={1}
          placeholder="Add a title"
          value={title}
          onChange={(e) => {
            // auto-grow
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
            setTitle(e.target.value);
            emitChange(editor.getHTML(), e.target.value);
          }}
        />
        <div style={{ borderBottom: "1px solid var(--border, #e5e7eb)", marginTop: 12 }} />
      </div>

      {/* ── Body Editor ── */}
      <div
        style={{ padding: "16px 20px 20px", cursor: "text", maxHeight: "400px", overflowY: "auto" }}
        className="apt-editor-wrap"
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} className="apt-prose" />
      </div>
    </div>
  );
};
