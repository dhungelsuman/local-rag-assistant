import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const ACCEPT = ".pdf,.docx,.pptx,.ppt,.txt";
const SUGGESTIONS = [
  "Give me a concise summary",
  "What are the key takeaways?",
  "Find important dates and deadlines",
  "What actions do I need to take?",
  "Compare the main ideas",
  "Explain this document simply",
];

async function readError(res) {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return res.statusText || "Request failed";
  }
}


const Icon = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const SidebarIcon = () => <Icon><path d="M4 5h16v14H4zM9 5v14" /></Icon>;
const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const ClipIcon = () => <Icon><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3" /></Icon>;
const SendIcon = () => <Icon><path d="M12 19V5M5 12l7-7 7 7" /></Icon>;
const FileIcon = () => <Icon size={16}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Icon>;
const TrashIcon = () => <Icon size={16}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Icon>;
const Spark = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M8.2 14.5A7 7 0 1 1 15.8 14.5c-.9.7-1.6 1.7-1.8 2.5h-4c-.2-.8-.9-1.8-1.8-2.5Z" />
    <path d="M12 5v2M5.6 7.6 7 9M18.4 7.6 17 9" />
  </svg>
);

// The sidebar handles document uploads and the document list.
function Sidebar({ docs, open, collapsed, uploadingName, onClose, onNewChat, onPick, onFiles, onReset }) {
  const [dragging, setDragging] = useState(false);

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <button className="new-chat" onClick={() => { onNewChat(); onClose(); }}>
          <PlusIcon /> New chat
        </button>

        <h2 className="side-title">Documents</h2>

        <div
          className={`dropzone ${dragging ? "drag" : ""}`}
          onClick={onPick}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick()}
        >
          <strong>{uploadingName ? "Indexing document…" : "Add documents"}</strong>
          <span>
            {uploadingName
              ? <><i className="spinner" aria-label="Indexing" /> {uploadingName}</>
              : "Drop files here or browse. PDF, DOCX, PPTX, TXT."}
          </span>
        </div>

        <ul className="doc-list">
          {docs.map((doc) => (
            <li key={doc.name} className={`doc ${doc.status}`} title={doc.error || doc.name}>
              <FileIcon />
              <span className="doc-name">{doc.name}</span>
              <span className="doc-status">
                {doc.status === "ready" && "Ready"}
                {doc.status === "error" && "Failed"}
              </span>
              {doc.status === "error" && <p className="doc-error">{doc.error}</p>}
            </li>
          ))}
        </ul>

        {docs.length > 0 && (
          <button className="reset" onClick={onReset}>
            <TrashIcon /> Remove all documents
          </button>
        )}
      </aside>
    </>
  );
}

// Messages are split into small components so the main App stays readable.
function Sources({ sources }) {
  return (
    <details className="sources">
      <summary>{sources.length} {sources.length === 1 ? "source" : "sources"}</summary>
      <ul>
        {sources.map((source, index) => (
          <li key={index}>
            <b>{source.source ?? "Document"}{source.page ? `, page ${source.page}` : ""}</b>
            <p>{source.content}…</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Message({ msg }) {
  if (msg.role === "user") {
    return <div className="msg msg-user"><p>{msg.content}</p></div>;
  }
  return (
    <div className={`msg msg-ai ${msg.error ? "is-error" : ""}`}>
      <span className="avatar"><Spark /></span>
      <div className="msg-body">
        {msg.error ? <p>{msg.content}</p> : <ReactMarkdown>{msg.content}</ReactMarkdown>}
        {msg.sources?.length > 0 && <Sources sources={msg.sources} />}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="msg msg-ai">
      <span className="avatar"><Spark /></span>
      <div className="msg-body typing" aria-label="Thinking"><span /><span /><span /></div>
    </div>
  );
}

// Main application state and API requests.
export default function App() {
  const [messages, setMessages] = useState([]);
  const [docs, setDocs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadingName, setUploadingName] = useState("");

  const fileRef = useRef(null);
  const areaRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);


  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  async function send(text) {
    const question = text.trim();
    if (!question || loading) return;

    setMessages((messages) => [...messages, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setMessages((messages) => [...messages, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch (err) {
      setMessages((messages) => [...messages, { role: "assistant", error: true, content: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(fileList) {
    for (const file of Array.from(fileList)) {
      setUploadingName(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error(await readError(res));
        setDocs((documents) => [
          { name: file.name, status: "ready" },
          ...documents.filter((document) => document.name !== file.name),
        ]);
      } catch (err) {
        setDocs((documents) => [
          { name: file.name, status: "error", error: err.message },
          ...documents.filter((document) => document.name !== file.name),
        ]);
      }
    }
    setUploadingName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function resetDocs() {
    if (!window.confirm("Remove all indexed documents?")) return;
    try {
      const res = await fetch(`${API_URL}/reset`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      setDocs([]);
    } catch (err) {
      setMessages((messages) => [
        ...messages,
        { role: "assistant", error: true, content: `Couldn't remove documents: ${err.message}` },
      ]);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden
             onChange={(e) => uploadFiles(e.target.files)} />

      <Sidebar
        docs={docs}
        open={sidebarOpen}
        collapsed={sidebarCollapsed}
        uploadingName={uploadingName}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => setMessages([])}
        onPick={() => fileRef.current?.click()}
        onFiles={uploadFiles}
        onReset={resetDocs}
      />

      <main className="main">
        <header className="topbar">
          <button
            className="icon-btn desktop-sidebar-toggle"
            onClick={() => {
              if (window.matchMedia("(max-width: 820px)").matches) {
                setSidebarOpen(true);
              } else {
                setSidebarCollapsed((collapsed) => !collapsed);
              }
            }}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <SidebarIcon />
          </button>
          <span className="topbar-title">Document chat</span>
        </header>

        <div className="scroll">
          <div className="column">
            {empty ? (
              <section className="hello">
                <span className="product-tag">LOCAL DOCUMENT INTELLIGENCE</span>
                <h1>What would you like to know about your documents?</h1>
                <p>Upload a document and turn dense information into clear answers, summaries, and next steps.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </section>
            ) : (
              messages.map((m, i) => <Message key={i} msg={m} />)
            )}
            {loading && <Typing />}
            <div ref={bottomRef} />
          </div>
        </div>

        <form className="composer-wrap" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <div className="composer">
            <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()}
                    aria-label="Add documents">
              <ClipIcon />
            </button>
            <textarea
              ref={areaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your documents"
              aria-label="Message"
            />
            <button type="submit" className="send" disabled={!input.trim() || loading} aria-label="Send">
              <SendIcon />
            </button>
          </div>
          <p className="hint">Answers are generated by a local model and can be wrong. Check the sources.</p>
        </form>
      </main>
    </div>
  );
}