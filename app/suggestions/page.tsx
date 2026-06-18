"use client";
import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import NavBar from "../../components/NavBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Suggestion = {
  id: string;
  titre: string;
  contenu: string | null;
  couleur: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

type NoteTextBlock  = { type: 'text';  value: string };
type NoteTableBlock = { type: 'table'; headers: string[]; rows: string[][] };
type NoteListItem   = { text: string; checked: boolean };
type NoteListBlock  = { type: 'list';  variant: 'numbered' | 'check'; items: NoteListItem[] };
type ContentBlock   = NoteTextBlock | NoteTableBlock | NoteListBlock;

// ─── Constantes ───────────────────────────────────────────────────────────────

const NOTE_COLORS: Record<string, { bg: string; border: string; tape: string }> = {
  yellow:  { bg: '#fef9c3', border: '#fde047', tape: '#fbbf24' },
  green:   { bg: '#dcfce7', border: '#86efac', tape: '#4ade80' },
  blue:    { bg: '#dbeafe', border: '#93c5fd', tape: '#60a5fa' },
  pink:    { bg: '#fce7f3', border: '#f9a8d4', tape: '#f472b6' },
  orange:  { bg: '#ffedd5', border: '#fdba74', tape: '#fb923c' },
  purple:  { bg: '#f3e8ff', border: '#d8b4fe', tape: '#a78bfa' },
  teal:    { bg: '#ccfbf1', border: '#5eead4', tape: '#2dd4bf' },
};

const NOTE_ROTATIONS = [-3, 2.5, -1.5, 3.2, -2.2, 1.8, -3.8, 2, -1, 3.5];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBlocks(raw: string | null): ContentBlock[] {
  if (!raw) return [{ type: 'text', value: '' }];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p) && p.length > 0) return p as ContentBlock[];
  } catch {}
  return [{ type: 'text', value: raw }];
}

function serializeBlocks(blocks: ContentBlock[]): string | null {
  const hasContent = blocks.some(b => {
    if (b.type === 'text')  return b.value.trim().length > 0;
    if (b.type === 'table') return b.headers.length > 0;
    if (b.type === 'list')  return (b as NoteListBlock).items.some(i => i.text.trim());
    return false;
  });
  if (!hasContent) return null;
  return JSON.stringify(blocks);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

function getPreviewInfo(raw: string | null): { text: string; tables: NoteTableBlock[]; lists: NoteListBlock[] } {
  const blocks = parseBlocks(raw);
  const text   = blocks.filter(b => b.type === 'text').map(b => (b as NoteTextBlock).value).join('\n').trim();
  const tables = blocks.filter(b => b.type === 'table') as NoteTableBlock[];
  const lists  = blocks.filter(b => b.type === 'list')  as NoteListBlock[];
  return { text, tables, lists };
}

function searchBlocks(raw: string | null): string {
  const blocks = parseBlocks(raw);
  return blocks.map(b => {
    if (b.type === 'text')  return b.value;
    if (b.type === 'table') { const t = b as NoteTableBlock; return [...t.headers, ...t.rows.flat()].join(' '); }
    if (b.type === 'list')  return (b as NoteListBlock).items.map(i => i.text).join(' ');
    return '';
  }).join(' ');
}

function normalizeStr(s: string): string {
  return s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") ?? "";
}

// ─── TableBlockEditor ─────────────────────────────────────────────────────────

function TableBlockEditor({ block, onChange, onDelete, borderColor }: {
  block: NoteTableBlock;
  onChange: (b: NoteTableBlock) => void;
  onDelete: () => void;
  borderColor: string;
}) {
  const cellStyle: React.CSSProperties = {
    border: `1px solid ${borderColor}`, padding: '4px 6px', fontFamily: 'inherit',
    fontSize: 12, background: 'rgba(255,255,255,0.5)', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${borderColor}`, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', flex: 1 }}>📊 Tableau</span>
        <button onClick={() => onChange({ ...block, headers: [...block.headers, ''], rows: block.rows.map(r => [...r, '']) })} style={{ fontSize: 10, border: `1px solid ${borderColor}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer', background: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>+ Col</button>
        <button onClick={() => onChange({ ...block, rows: [...block.rows, Array(block.headers.length).fill('')] })} style={{ fontSize: 10, border: `1px solid ${borderColor}`, borderRadius: 4, padding: '2px 6px', cursor: 'pointer', background: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>+ Ligne</button>
        <button onClick={onDelete} style={{ fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.3)', padding: '2px 4px' }}>✕</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: block.headers.length * 100 }}>
          <thead>
            <tr>{block.headers.map((h, j) => (
              <th key={j} style={{ padding: 0, fontWeight: 700 }}>
                <input value={h} onChange={e => { const hs = [...block.headers]; hs[j] = e.target.value; onChange({ ...block, headers: hs }); }} placeholder={`C${j+1}`} style={{ ...cellStyle, fontWeight: 700 }} />
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => (
                <td key={c} style={{ padding: 0 }}>
                  <input value={cell} onChange={e => { const rs = block.rows.map((rw, ri) => ri === r ? rw.map((cl, ci) => ci === c ? e.target.value : cl) : rw); onChange({ ...block, rows: rs }); }} style={cellStyle} />
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableBlockView({ block, borderColor }: { block: NoteTableBlock; borderColor: string }) {
  return (
    <div style={{ border: `1.5px solid ${borderColor}`, borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(0,0,0,0.06)' }}>
            {block.headers.map((h, j) => <th key={j} style={{ padding: '5px 8px', fontWeight: 700, textAlign: 'left', borderRight: j < block.headers.length - 1 ? `1px solid ${borderColor}` : 'none' }}>{h || `C${j+1}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} style={{ borderTop: `1px solid ${borderColor}` }}>
              {row.map((cell, c) => <td key={c} style={{ padding: '5px 8px', borderRight: c < row.length - 1 ? `1px solid ${borderColor}` : 'none' }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ListBlockEditor ──────────────────────────────────────────────────────────

function ListBlockEditor({ block, onChange, onDelete, borderColor }: {
  block: NoteListBlock;
  onChange: (b: NoteListBlock) => void;
  onDelete: () => void;
  borderColor: string;
}) {
  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderBottom: `1px solid ${borderColor}`, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', flex: 1 }}>{block.variant === 'check' ? '☑ Checklist' : '1· Liste numérotée'}</span>
        <button onClick={onDelete} style={{ fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.3)', padding: '2px 4px' }}>✕</button>
      </div>
      <div style={{ padding: '8px' }}>
        {block.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {block.variant === 'check'
              ? <input type="checkbox" checked={item.checked} onChange={e => { const items = block.items.map((it, idx) => idx === i ? { ...it, checked: e.target.checked } : it); onChange({ ...block, items }); }} style={{ flexShrink: 0, width: 14, height: 14, cursor: 'pointer' }} />
              : <span style={{ flexShrink: 0, fontSize: 12, color: 'rgba(0,0,0,0.4)', fontWeight: 700, minWidth: 16 }}>{i+1}.</span>
            }
            <input value={item.text} onChange={e => { const items = block.items.map((it, idx) => idx === i ? { ...it, text: e.target.value } : it); onChange({ ...block, items }); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onChange({ ...block, items: [...block.items.slice(0, i+1), { text: '', checked: false }, ...block.items.slice(i+1)] }); }
                if (e.key === 'Backspace' && !item.text && block.items.length > 1) { e.preventDefault(); onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) }); }
              }}
              placeholder="Élément…"
              style={{ flex: 1, border: `1px solid ${borderColor}`, borderRadius: 4, padding: '3px 6px', fontFamily: 'inherit', fontSize: 13, background: 'rgba(255,255,255,0.5)', outline: 'none', textDecoration: item.checked && block.variant === 'check' ? 'line-through' : 'none' }} />
            {block.items.length > 1 && <button onClick={() => onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) })} style={{ fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.25)', padding: '0 2px' }}>✕</button>}
          </div>
        ))}
        <button onClick={() => onChange({ ...block, items: [...block.items, { text: '', checked: false }] })} style={{ fontSize: 11, border: `1px dashed ${borderColor}`, borderRadius: 4, padding: '3px 8px', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.4)', fontFamily: 'inherit', marginTop: 2 }}>+ Élément</button>
      </div>
    </div>
  );
}

function ListBlockView({ block }: { block: NoteListBlock }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {block.items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3, fontSize: 14, color: 'rgba(0,0,0,0.7)', lineHeight: 1.5, textDecoration: item.checked && block.variant === 'check' ? 'line-through' : 'none', opacity: item.checked && block.variant === 'check' ? 0.45 : 1 }}>
          <span style={{ flexShrink: 0, fontWeight: 600 }}>{block.variant === 'numbered' ? `${i+1}.` : (item.checked ? '☑' : '☐')}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── StickyNote ───────────────────────────────────────────────────────────────

function StickyNote({ note, rotation, onClick }: { note: Suggestion; rotation: number; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const col = NOTE_COLORS[note.couleur] ?? NOTE_COLORS.yellow;
  const dateStr = (() => { try { return format(new Date(note.updated_at), 'dd MMM', { locale: fr }); } catch { return ''; } })();

  return (
    <div role="button" tabIndex={0}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        width: 230, minHeight: 230, flexShrink: 0,
        background: col.bg, border: `2px solid ${col.border}`, borderRadius: 3, padding: '26px 16px 16px',
        cursor: 'pointer',
        transform: `rotate(${hovered ? 0 : rotation}deg) translateY(${hovered ? -8 : 0}px)`,
        transition: 'transform 0.22s cubic-bezier(.34,1.56,.64,1), box-shadow 0.22s ease',
        boxShadow: hovered ? '8px 14px 32px rgba(0,0,0,0.25)' : '3px 5px 10px rgba(0,0,0,0.12)',
        position: 'relative', zIndex: hovered ? 10 : 1,
        display: 'flex', flexDirection: 'column', gap: 8, userSelect: 'none',
        marginRight: -22, marginTop: 14, marginBottom: 14,
      }}>
      <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', width: 38, height: 18, background: col.tape, opacity: 0.55, borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
      <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, color: '#1a1a1a' }}>
        {note.titre || 'Sans titre'}
      </div>
      {(() => {
        const { text, tables, lists } = getPreviewInfo(note.contenu);
        const noteTags = parseTags(note.tags);
        return (
          <>
            {text && <div style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.6)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>{text}</div>}
            {lists.map((list, li) => (
              <div key={li} style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.55)', lineHeight: 1.4 }}>
                {list.items.slice(0, 3).map((item, j) => (
                  <div key={j} style={{ display: 'flex', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: item.checked && list.variant === 'check' ? 'line-through' : 'none', opacity: item.checked && list.variant === 'check' ? 0.5 : 1 }}>
                    <span style={{ flexShrink: 0 }}>{list.variant === 'numbered' ? `${j+1}.` : (item.checked ? '☑' : '☐')}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text || '…'}</span>
                  </div>
                ))}
                {list.items.length > 3 && <span style={{ color: 'rgba(0,0,0,0.3)', fontSize: 10 }}>+{list.items.length - 3} élément{list.items.length - 3 > 1 ? 's' : ''}</span>}
              </div>
            ))}
            {tables.map((table, ti) => (
              <div key={ti} style={{ fontSize: 9, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 3, overflow: 'hidden', marginTop: 3 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
                  <thead><tr style={{ background: 'rgba(0,0,0,0.07)' }}>
                    {table.headers.slice(0, 3).map((h, j) => <th key={j} style={{ padding: '2px 4px', fontWeight: 700, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{h || `C${j+1}`}</th>)}
                  </tr></thead>
                  <tbody>
                    {table.rows.slice(0, 3).map((row, r) => (
                      <tr key={r} style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
                        {row.slice(0, 3).map((cell, c) => <td key={c} style={{ padding: '2px 4px', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {noteTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                {noteTags.slice(0, 4).map(tag => <span key={tag} style={{ fontSize: 9, background: 'rgba(0,0,0,0.09)', borderRadius: 10, padding: '1px 5px', fontWeight: 600, color: 'rgba(0,0,0,0.45)' }}>#{tag}</span>)}
              </div>
            )}
          </>
        );
      })()}
      <div style={{ marginTop: 'auto', paddingTop: 6, fontSize: 10, color: 'rgba(0,0,0,0.35)', fontWeight: 600, letterSpacing: '.04em' }}>{dateStr}</div>
    </div>
  );
}

function StickyNoteNew({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div role="button" tabIndex={0}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{
        width: 230, minHeight: 230, flexShrink: 0,
        background: hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
        border: `2.5px dashed ${hovered ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)'}`,
        borderRadius: 3, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'all 0.18s ease', transform: `scale(${hovered ? 1.04 : 1})`,
        userSelect: 'none', marginTop: 14, marginBottom: 14, zIndex: 2, position: 'relative',
      }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: hovered ? 'var(--ink)' : 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.18s ease', fontSize: 22, color: hovered ? 'white' : 'rgba(0,0,0,0.4)', fontWeight: 300 }}>+</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: hovered ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)', letterSpacing: '.03em' }}>Nouvelle suggestion</span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ModalSuggestion({ note, onClose, onSaved, onDeleted }: {
  note: Suggestion | null;
  onClose: () => void;
  onSaved: (note: Suggestion) => void;
  onDeleted?: (id: string) => void;
}) {
  const isNew = note === null;
  const [titre, setTitre] = useState(note?.titre ?? '');
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseBlocks(note?.contenu ?? null));
  const [tags, setTags] = useState<string[]>(() => parseTags(note?.tags ?? null));
  const [tagInput, setTagInput] = useState('');
  const [couleur, setCouleur] = useState(() => {
    if (!isNew) return note?.couleur ?? 'yellow';
    const keys = Object.keys(NOTE_COLORS);
    return keys[Math.floor(Math.random() * keys.length)];
  });
  const [editing, setEditing] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addTag = (val: string) => {
    const t = val.trim().toLowerCase().replace(/[,;]/g, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const col = NOTE_COLORS[couleur] ?? NOTE_COLORS.yellow;

  const handleSave = async () => {
    if (!titre.trim()) return;
    setSaving(true);
    const contenu  = serializeBlocks(blocks);
    const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;
    const now = new Date().toISOString();
    if (isNew) {
      const id = crypto.randomUUID();
      await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, titre: titre.trim(), contenu, couleur, tags: tagsJson, created_at: now, updated_at: now }),
      });
      onSaved({ id, titre: titre.trim(), contenu, couleur, tags: tagsJson, created_at: now, updated_at: now });
    } else {
      await fetch(`/api/suggestions/${note!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: titre.trim(), contenu, couleur, tags: tagsJson, updated_at: now }),
      });
      onSaved({ ...note!, titre: titre.trim(), contenu, couleur, tags: tagsJson, updated_at: now });
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!note) return;
    await fetch(`/api/suggestions/${note.id}`, { method: 'DELETE' });
    onDeleted?.(note.id);
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '95vw', background: col.bg, border: `3px solid ${col.border}`, boxShadow: '10px 14px 50px rgba(0,0,0,0.3)', borderRadius: 6, padding: '32px 28px 24px', position: 'relative' }}>
        {/* Scotch */}
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', width: 56, height: 22, background: col.tape, opacity: 0.6, borderRadius: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />

        {/* Couleur */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginRight: 4 }}>Couleur</span>
          {Object.entries(NOTE_COLORS).map(([key, c]) => (
            <button key={key} onClick={() => { setCouleur(key); if (!editing && !isNew) setEditing(true); }}
              style={{ width: 22, height: 22, borderRadius: '50%', background: c.bg, border: `2.5px solid ${couleur === key ? 'var(--ink)' : c.border}`, cursor: 'pointer', transform: couleur === key ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.15s ease', boxShadow: couleur === key ? '0 0 0 2px rgba(0,0,0,0.15)' : 'none' }} />
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'rgba(0,0,0,0.35)', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Titre */}
        {editing ? (
          <input autoFocus={isNew} value={titre} onChange={e => setTitre(e.target.value)}
            placeholder="Titre de la suggestion…" className="pop-input"
            style={{ width: '100%', fontSize: 18, fontWeight: 800, marginBottom: 14, background: 'rgba(255,255,255,0.5)', border: `2px solid ${col.border}` }} />
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 14, color: '#1a1a1a', lineHeight: 1.3 }}>
            {titre || <span style={{ color: 'rgba(0,0,0,0.3)' }}>Sans titre</span>}
          </div>
        )}

        {/* Tags */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minHeight: 28 }}>
            {tags.map(tag => (
              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.08)', border: '1.5px solid rgba(0,0,0,0.1)', borderRadius: 20, padding: '2px 8px 2px 10px', fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.6)' }}>
                #{tag}
                {editing && <button onClick={() => setTags(tags.filter(t => t !== tag))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.35)', fontSize: 11, padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>}
              </span>
            ))}
            {editing && (
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                placeholder={tags.length === 0 ? '+ Ajouter un tag…' : '+ tag'}
                style={{ border: '1.5px dashed rgba(0,0,0,0.2)', borderRadius: 20, padding: '2px 10px', fontSize: 12, background: 'transparent', outline: 'none', fontFamily: 'inherit', width: tags.length === 0 ? 150 : 80 }} />
            )}
            {!editing && tags.length === 0 && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.25)', fontStyle: 'italic' }}>Aucun tag</span>}
          </div>
        </div>

        {/* Contenu */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '45vh', overflowY: 'auto' }} className="custom-scroll">
            {blocks.map((block, i) => (
              <div key={i} draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i); }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (dragIdx === null || dragIdx === i) { setDragIdx(null); return; } setBlocks(prev => { const next = [...prev]; const [moved] = next.splice(dragIdx, 1); next.splice(dragIdx < i ? i - 1 : i, 0, moved); return next; }); setDragIdx(null); }}
                onDragEnd={() => setDragIdx(null)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, opacity: dragIdx === i ? 0.35 : 1, transition: 'opacity 0.15s' }}>
                <div style={{ cursor: 'grab', color: 'rgba(0,0,0,0.18)', paddingTop: 9, userSelect: 'none', fontSize: 16, flexShrink: 0 }}>⠿</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {block.type === 'text' ? (
                    <textarea value={(block as NoteTextBlock).value}
                      onChange={e => { const next = [...blocks]; next[i] = { type: 'text', value: e.target.value }; setBlocks(next); }}
                      placeholder="Texte libre…" rows={4} className="pop-input"
                      style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.6, background: 'rgba(255,255,255,0.5)', border: `2px solid ${col.border}` }} />
                  ) : block.type === 'table' ? (
                    <TableBlockEditor block={block as NoteTableBlock} onChange={updated => { const next = [...blocks]; next[i] = updated; setBlocks(next); }} onDelete={() => setBlocks(blocks.filter((_, idx) => idx !== i))} borderColor={col.border} />
                  ) : (
                    <ListBlockEditor block={block as NoteListBlock} onChange={updated => { const next = [...blocks]; next[i] = updated; setBlocks(next); }} onDelete={() => setBlocks(blocks.filter((_, idx) => idx !== i))} borderColor={col.border} />
                  )}
                </div>
                {block.type === 'text' && <button onClick={() => setBlocks(blocks.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.2)', fontSize: 14, paddingTop: 8, flexShrink: 0, lineHeight: 1 }}>✕</button>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, paddingLeft: 22 }}>
              <button onClick={() => setBlocks([...blocks, { type: 'text', value: '' }])} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: '5px 10px' }}>+ Texte</button>
              <button onClick={() => setBlocks([...blocks, { type: 'table', headers: ['', '', ''], rows: [['', '', ''], ['', '', '']] }])} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: '5px 10px' }}>📊 Tableau</button>
              <button onClick={() => setBlocks([...blocks, { type: 'list', variant: 'check', items: [{ text: '', checked: false }] }])} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: '5px 10px' }}>☑ Check</button>
              <button onClick={() => setBlocks([...blocks, { type: 'list', variant: 'numbered', items: [{ text: '', checked: false }] }])} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: '5px 10px' }}>1· Liste</button>
            </div>
          </div>
        ) : (
          <div style={{ minHeight: 60, maxHeight: '50vh', overflowY: 'auto' }} className="custom-scroll">
            {blocks.every(b => b.type === 'text' && !(b as NoteTextBlock).value.trim()) ? (
              <span style={{ color: 'rgba(0,0,0,0.3)', fontStyle: 'italic', fontSize: 14 }}>Aucun contenu</span>
            ) : blocks.map((block, i) => {
              if (block.type === 'text') { const val = (block as NoteTextBlock).value.trim(); return val ? <div key={i} style={{ fontSize: 14, color: 'rgba(0,0,0,0.7)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 6 }}>{(block as NoteTextBlock).value}</div> : null; }
              if (block.type === 'table') return <TableBlockView key={i} block={block as NoteTableBlock} borderColor={col.border} />;
              return <ListBlockView key={i} block={block as NoteListBlock} />;
            })}
          </div>
        )}

        {/* Méta */}
        {note && (
          <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>
            Modifiée le {(() => { try { return format(new Date(note.updated_at), "dd MMM yyyy 'à' HH:mm", { locale: fr }); } catch { return ''; } })()}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
          {!isNew && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} className="pop-btn"
              style={{ background: 'none', border: '2px solid rgba(0,0,0,0.15)', color: 'rgba(0,0,0,0.45)', padding: '8px 14px', marginRight: 'auto' }}>
              🗑 Supprimer
            </button>
          )}
          {confirmDelete && (
            <div style={{ marginRight: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Confirmer ?</span>
              <button onClick={handleDelete} className="pop-btn" style={{ background: '#dc2626', color: 'white', border: '2px solid var(--ink)', padding: '6px 12px', fontSize: 12 }}>Oui, supprimer</button>
              <button onClick={() => setConfirmDelete(false)} className="pop-btn pop-btn-outline" style={{ padding: '6px 12px', fontSize: 12 }}>Annuler</button>
            </div>
          )}
          {editing ? (
            <>
              {!isNew && <button onClick={() => { setEditing(false); setTitre(note!.titre); setBlocks(parseBlocks(note!.contenu ?? null)); setCouleur(note!.couleur); setTags(parseTags(note!.tags ?? null)); setTagInput(''); }} className="pop-btn pop-btn-outline">Annuler</button>}
              <button onClick={handleSave} disabled={saving || !titre.trim()} className="pop-btn pop-btn-dark" style={{ opacity: saving || !titre.trim() ? 0.5 : 1 }}>
                {saving ? 'Enregistrement…' : isNew ? '+ Créer' : '✓ Enregistrer'}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="pop-btn pop-btn-dark">✏️ Modifier</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<Suggestion | null | undefined>(undefined); // undefined = fermé, null = nouvelle
  const [recherche, setRecherche] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/suggestions')
      .then(r => r.json() as Promise<any>)
      .then(d => { setSuggestions(Array.isArray(d) ? d : []); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    suggestions.forEach(s => parseTags(s.tags).forEach(t => set.add(t)));
    return [...set].sort();
  }, [suggestions]);

  const filtered = useMemo(() => {
    const q = normalizeStr(recherche);
    return suggestions.filter(s => {
      if (activeTags.length > 0) { const st = parseTags(s.tags); if (!activeTags.every(t => st.includes(t))) return false; }
      if (!q) return true;
      return normalizeStr(s.titre).includes(q) || normalizeStr(searchBlocks(s.contenu)).includes(q);
    });
  }, [suggestions, recherche, activeTags]);

  const handleSaved = (s: Suggestion) => {
    setSuggestions(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = s; return next; }
      return [s, ...prev];
    });
  };

  const handleDeleted = (id: string) => setSuggestions(prev => prev.filter(s => s.id !== id));

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)' }}>
      <NavBar current="suggestions" />

      <div className="pop-page" style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 84 }}>

        {/* Titre */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="bc" style={{ fontSize: 72, lineHeight: 0.9, textTransform: 'uppercase', letterSpacing: '-1px', background: 'linear-gradient(135deg, #0d0d0d 40%, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Suggestions
            </div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', fontWeight: 500, marginTop: 6 }}>
              Idées et pistes d&apos;amélioration du logiciel
            </div>
          </div>
          <button onClick={() => setModal(null)} className="pop-btn pop-btn-dark" style={{ fontSize: 15, padding: '10px 20px' }}>
            + Nouvelle suggestion
          </button>
        </div>

        {/* Recherche */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
            <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher dans les suggestions…"
              className="pop-input" style={{ width: '100%', paddingLeft: 38 }} />
          </div>
          <span className="pop-sticker" style={{ background: 'var(--cream2)' }}>
            {filtered.length}/{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Filtres tags */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Tags</span>
            {allTags.map(tag => {
              const active = activeTags.includes(tag);
              return (
                <button key={tag} onClick={() => setActiveTags(prev => active ? prev.filter(t => t !== tag) : [...prev, tag])}
                  style={{ background: active ? 'var(--ink)' : 'rgba(0,0,0,0.06)', color: active ? 'white' : 'rgba(0,0,0,0.55)', border: `1.5px solid ${active ? 'var(--ink)' : 'transparent'}`, borderRadius: 20, padding: '3px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                  #{tag}
                </button>
              );
            })}
            {activeTags.length > 0 && <button onClick={() => setActiveTags([])} style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', fontFamily: 'inherit' }}>✕ effacer</button>}
          </div>
        )}

        {/* Grille de stickers */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'rgba(0,0,0,0.3)', fontWeight: 600, fontSize: 15 }}>Chargement…</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', flexDirection: 'row', gap: 0, paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 28 }}>
            <StickyNoteNew onClick={() => setModal(null)} />
            {filtered.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '60px 0', gap: 10 }}>
                <span style={{ fontSize: 40 }}>💡</span>
                <p style={{ fontWeight: 600, color: 'rgba(0,0,0,0.3)' }}>{suggestions.length === 0 ? 'Aucune suggestion pour l\'instant.' : 'Aucune suggestion trouvée.'}</p>
              </div>
            ) : filtered.map((s, i) => (
              <StickyNote key={s.id} note={s} rotation={NOTE_ROTATIONS[i % NOTE_ROTATIONS.length]} onClick={() => setModal(s)} />
            ))}
          </div>
        )}
      </div>

      {modal !== undefined && (
        <ModalSuggestion
          note={modal}
          onClose={() => setModal(undefined)}
          onSaved={s => { handleSaved(s); setModal(undefined); }}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
