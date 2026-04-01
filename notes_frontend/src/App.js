import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";
import { createNote, deleteNote, listNotes, listTags, updateNote } from "./api";
import { applyTheme, getInitialTheme, THEMES, toggleTheme as toggleThemeUtil } from "./theme";

/**
 * Small utility to debounce changing values (for search).
 */
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Debounces an effect callback; runs the callback only after `delayMs` has passed
 * without a change in `deps`.
 *
 * This is used for autosave so we don't spam the backend on every keystroke.
 */
function useDebouncedEffect(effect, deps, delayMs) {
  useEffect(() => {
    const t = setTimeout(() => effect(), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}

function normalizeTagInput(input) {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatUpdatedAt(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function TagPill({ name }) {
  return <span className="tag-pill">{name}</span>;
}

function NoteCard({ note, onOpen, onDelete }) {
  return (
    <article className="note-card" onClick={() => onOpen(note)} role="button" tabIndex={0}>
      <div className="note-card__title-row">
        <h3 className="note-card__title">{note.title}</h3>
        {note.is_archived ? <span className="badge">Archived</span> : null}
      </div>

      <p className="note-card__content">
        {(note.content || "").length > 160 ? `${note.content.slice(0, 160)}…` : note.content}
      </p>

      <div className="note-card__tags">
        {note.tags && note.tags.length ? (
          note.tags.slice(0, 5).map((t) => <TagPill key={t} name={t} />)
        ) : (
          <span className="note-card__muted">No tags</span>
        )}
      </div>

      <div className="note-card__footer">
        <span className="note-card__date">Updated {formatUpdatedAt(note.updated_at)}</span>
        <button
          className="btn btn-danger btn-small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note);
          }}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Possible editor save states.
 * - clean: no changes since last successful save
 * - dirty: local changes not yet saved
 * - saving: save request in flight
 * - saved: last save succeeded recently (will fade back to clean)
 * - error: last save failed
 */
const SAVE_STATE = {
  CLEAN: "clean",
  DIRTY: "dirty",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error",
};

function NoteEditor({ initialNote, onSave, onCancel }) {
  const [title, setTitle] = useState(initialNote?.title || "");
  const [content, setContent] = useState(initialNote?.content || "");
  const [tagsText, setTagsText] = useState((initialNote?.tags || []).join(", "));
  const [archived, setArchived] = useState(Boolean(initialNote?.is_archived));

  // "saving" here is for the explicit Save/Create button.
  const [saving, setSaving] = useState(false);

  const [saveState, setSaveState] = useState(SAVE_STATE.CLEAN);
  const [saveMessage, setSaveMessage] = useState("");
  const [error, setError] = useState("");

  const isEdit = Boolean(initialNote?.id);

  // Snapshot of what the backend most recently has (or what the modal started with).
  // We compare the current fields to this to detect unsaved changes.
  const lastSavedSnapshotRef = useRef({
    title: initialNote?.title || "",
    content: initialNote?.content || "",
    tagsText: (initialNote?.tags || []).join(", "),
    archived: Boolean(initialNote?.is_archived),
  });

  // Incrementing request id for autosave; only the latest response updates UI state.
  const autosaveReqIdRef = useRef(0);

  // Track whether modal is still mounted to avoid state updates after close.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // If the initialNote changes (open a different note / switch to create), reset state.
  useEffect(() => {
    const nextTitle = initialNote?.title || "";
    const nextContent = initialNote?.content || "";
    const nextTagsText = (initialNote?.tags || []).join(", ");
    const nextArchived = Boolean(initialNote?.is_archived);

    setTitle(nextTitle);
    setContent(nextContent);
    setTagsText(nextTagsText);
    setArchived(nextArchived);

    lastSavedSnapshotRef.current = {
      title: nextTitle,
      content: nextContent,
      tagsText: nextTagsText,
      archived: nextArchived,
    };

    setSaveState(SAVE_STATE.CLEAN);
    setSaveMessage("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNote?.id]);

  function computeIsDirty() {
    const snap = lastSavedSnapshotRef.current;
    return (
      title !== snap.title ||
      content !== snap.content ||
      tagsText !== snap.tagsText ||
      archived !== snap.archived
    );
  }

  // Update dirty/clean indicator on any edit.
  useEffect(() => {
    if (saving) return; // explicit save in progress; indicator handled elsewhere
    if (saveState === SAVE_STATE.SAVING) return; // autosave in progress
    const dirty = computeIsDirty();
    setSaveState(dirty ? SAVE_STATE.DIRTY : SAVE_STATE.CLEAN);
    if (!dirty) setSaveMessage("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tagsText, archived]);

  function validateForSave(nextTitle) {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) return "Title is required.";
    return "";
  }

  async function runAutosave() {
    // Autosave only edits existing notes to avoid changing create flows.
    if (!isEdit) return;
    if (saving) return; // explicit save is happening
    const dirty = computeIsDirty();
    if (!dirty) return;

    const validationError = validateForSave(title);
    if (validationError) {
      // Keep it dirty but provide a helpful status. Don't show as "error" toast.
      setSaveState(SAVE_STATE.DIRTY);
      setSaveMessage(validationError);
      return;
    }

    const reqId = ++autosaveReqIdRef.current;
    setSaveState(SAVE_STATE.SAVING);
    setSaveMessage("Saving…");

    try {
      // Important: use the existing update flow (via App's onSave) so we don't
      // introduce new API calls or assumptions.
      await onSave({
        title: title.trim(),
        content,
        tags: normalizeTagInput(tagsText),
        is_archived: archived,
        __autosave: true, // hint to App; ignored by backend
      });

      // Only accept latest autosave response.
      if (!mountedRef.current || autosaveReqIdRef.current !== reqId) return;

      lastSavedSnapshotRef.current = {
        title,
        content,
        tagsText,
        archived,
      };

      setSaveState(SAVE_STATE.SAVED);
      setSaveMessage("Saved");

      // Fade back to clean after a moment (unless user typed again).
      setTimeout(() => {
        if (!mountedRef.current) return;
        const stillClean = !computeIsDirty();
        if (stillClean) {
          setSaveState(SAVE_STATE.CLEAN);
          setSaveMessage("");
        }
      }, 1200);
    } catch (e) {
      if (!mountedRef.current || autosaveReqIdRef.current !== reqId) return;
      setSaveState(SAVE_STATE.ERROR);
      setSaveMessage("Autosave failed");
      // Don't set the main error alert for autosave; keep it non-blocking.
    }
  }

  // Debounced autosave: after user stops typing for 900ms.
  useDebouncedEffect(
    () => {
      runAutosave();
    },
    [title, content, tagsText, archived, isEdit, saving],
    900
  );

  async function handleSave() {
    setError("");
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setSaveState(SAVE_STATE.SAVING);
    setSaveMessage("Saving…");
    try {
      await onSave({
        title: trimmedTitle,
        // Markdown is stored as plain text in the existing "content" field.
        content,
        tags: normalizeTagInput(tagsText),
        is_archived: archived,
      });

      // If onSave doesn't close the modal (e.g., create note flow closes), this keeps state consistent.
      lastSavedSnapshotRef.current = {
        title,
        content,
        tagsText,
        archived,
      };
      setSaveState(SAVE_STATE.SAVED);
      setSaveMessage("Saved");
    } catch (e) {
      setError(e.message || "Failed to save.");
      setSaveState(SAVE_STATE.ERROR);
      setSaveMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    // Non-blocking: allow closing; existing flows remain unchanged.
    onCancel();
  }

  const statusText = (() => {
    if (saveState === SAVE_STATE.SAVING) return saveMessage || "Saving…";
    if (saveState === SAVE_STATE.SAVED) return saveMessage || "Saved";
    if (saveState === SAVE_STATE.ERROR) return saveMessage || "Save failed";
    if (saveState === SAVE_STATE.DIRTY) return saveMessage || "Unsaved changes";
    return ""; // clean
  })();

  return (
    <div className="editor">
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="editor__status-row" aria-live="polite">
        <span className={`save-indicator is-${saveState}`} role="status">
          {statusText || " "}
        </span>
      </div>

      <label className="field">
        <div className="field__label">Title</div>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Meeting notes"
          autoFocus
        />
      </label>

      <label className="field">
        <div className="field__label">Tags (comma separated)</div>
        <input
          className="input"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="e.g. work, ideas, todo"
        />
      </label>

      <div className="field">
        <div className="field__label">Markdown</div>

        <div className="md" aria-label="Markdown editor with preview">
          <div className="md__panel" aria-label="Markdown input">
            <div className="md__panel-header">
              <span>Editor</span>
              <span className="muted small">Tip: use **bold**, _italic_, `code`</span>
            </div>
            <div className="md__panel-body">
              <textarea
                className="md__textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  "Write your note in Markdown...\n\n# Heading\n- List item\n\n```js\nconsole.log('hello')\n```"
                }
                spellCheck
              />
            </div>
          </div>

          <div className="md__panel" aria-label="Markdown preview">
            <div className="md__panel-header">
              <span>Preview</span>
              <span className="muted small">Live</span>
            </div>
            <div className="md__panel-body">
              <div className="md-preview">
                <ReactMarkdown>{content || "_Nothing to preview yet._"}</ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        <span>Archived</span>
      </label>

      <div className="editor__actions">
        <button className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save changes" : "Create note"}
        </button>
      </div>
    </div>
  );
}

/** Label helper for the theme toggle button. */
function getThemeToggleLabel(theme) {
  return theme === THEMES.DARK ? "Light" : "Dark";
}

// PUBLIC_INTERFACE
function App() {
  /** Main Notemaster UI: list/search notes, basic tagging, and CRUD operations. */
  const [theme, setTheme] = useState(() => getInitialTheme());

  const [notes, setNotes] = useState([]);
  const [totalNotes, setTotalNotes] = useState(0);
  const [tags, setTags] = useState([]);

  const [selectedTag, setSelectedTag] = useState("");
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebouncedValue(searchText, 350);
  const [showArchived, setShowArchived] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNote, setEditorNote] = useState(null);

  const queryArgs = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      tag: selectedTag || undefined,
      archived: showArchived ? true : undefined,
      limit: 200,
      offset: 0,
    }),
    [debouncedSearch, selectedTag, showArchived]
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  async function refreshAll() {
    setLoadError("");
    setLoading(true);
    try {
      const [notesResp, tagsResp] = await Promise.all([listNotes(queryArgs), listTags()]);
      setNotes(notesResp.items || []);
      setTotalNotes(notesResp.total || 0);
      setTags(tagsResp.items || []);
    } catch (e) {
      setLoadError(e.message || "Failed to load data. Check backend connectivity.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryArgs]);

  function openCreate() {
    setEditorNote(null);
    setEditorOpen(true);
  }

  function openEdit(note) {
    setEditorNote(note);
    setEditorOpen(true);
  }

  async function handleSave(payload) {
    // NoteEditor may add `__autosave` to hint this is background save.
    // We strip it so it never reaches the backend.
    const { __autosave, ...cleanPayload } = payload || {};

    if (editorNote?.id) {
      await updateNote(editorNote.id, cleanPayload);
    } else {
      await createNote(cleanPayload);
    }

    // Autosave should not close the modal or refresh the whole list on every keystroke.
    if (__autosave) return;

    setEditorOpen(false);
    setEditorNote(null);
    await refreshAll();
  }

  async function handleDelete(note) {
    const ok = window.confirm(`Delete "${note.title}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteNote(note.id);
      await refreshAll();
    } catch (e) {
      window.alert(e.message || "Failed to delete.");
    }
  }

  function toggleTheme() {
    setTheme((prev) => toggleThemeUtil(prev));
  }

  return (
    <div className="App">
      <header className="topbar">
        <div className="topbar__left">
          <div className="brand">
            <div className="brand__logo">N</div>
            <div>
              <div className="brand__name">Notemaster</div>
              <div className="brand__sub">Notes • Tags • Search</div>
            </div>
          </div>
        </div>

        <div className="topbar__center">
          <input
            className="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search notes..."
            aria-label="Search notes"
          />
        </div>

        <div className="topbar__right">
          <button className="btn btn-primary" onClick={openCreate}>
            New note
          </button>
          <button
            className="btn btn-ghost"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === THEMES.DARK ? "light" : "dark"} mode`}
          >
            {getThemeToggleLabel(theme)}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Tags sidebar">
          <div className="sidebar__section">
            <div className="sidebar__title">Filter</div>

            <button
              className={`sidebar__item ${selectedTag === "" ? "is-active" : ""}`}
              onClick={() => setSelectedTag("")}
            >
              All notes <span className="count">{totalNotes}</span>
            </button>

            <label className="sidebar__toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              <span>Archived only</span>
            </label>
          </div>

          <div className="sidebar__section">
            <div className="sidebar__title">Tags</div>
            <div className="sidebar__list">
              {tags.length ? (
                tags.map((t) => (
                  <button
                    key={t.id}
                    className={`sidebar__item ${selectedTag === t.name ? "is-active" : ""}`}
                    onClick={() => setSelectedTag(t.name)}
                    title={`Filter by ${t.name}`}
                  >
                    {t.name} <span className="count">{t.note_count}</span>
                  </button>
                ))
              ) : (
                <div className="muted">No tags yet.</div>
              )}
            </div>
          </div>

          <div className="sidebar__footer">
            <div className="muted small">Tip: tag notes with comma-separated values in the editor.</div>
          </div>
        </aside>

        <main className="main">
          {loadError ? <div className="alert alert-error">{loadError}</div> : null}
          {loading ? <div className="muted">Loading…</div> : null}

          {!loading && !loadError && notes.length === 0 ? (
            <div className="empty">
              <div className="empty__title">No notes found</div>
              <div className="empty__desc">Try adjusting your search or tag filters.</div>
              <button className="btn btn-primary" onClick={openCreate}>
                Create your first note
              </button>
            </div>
          ) : null}

          <section className="notes-grid" aria-label="Notes list">
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} onOpen={openEdit} onDelete={handleDelete} />
            ))}
          </section>
        </main>
      </div>

      {editorOpen ? (
        <Modal title={editorNote?.id ? "Edit note" : "New note"} onClose={() => setEditorOpen(false)}>
          <NoteEditor
            initialNote={editorNote}
            onSave={handleSave}
            onCancel={() => setEditorOpen(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}

export default App;
