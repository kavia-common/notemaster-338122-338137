# Markdown editor + preview (frontend)

This frontend now includes a Markdown editor with live preview inside the note create/edit modal.

## Implementation notes

- Markdown is stored as plain text in the existing `content` field of a note (no backend changes required).
- Preview rendering is done with `react-markdown`.

## Dependency

`react-markdown` was added to `package.json`. If you are running locally, make sure dependencies are installed:

```bash
cd notes_frontend
npm install
npm start
```
