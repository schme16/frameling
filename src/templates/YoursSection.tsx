// The welcome sheet's sections after Built-in: your templates (and any other source registered later, such as an
// online gallery). Cards look like the built-in examples; yours also have a small menu to share or remove them.
import { useEffect, useState, type ReactNode } from 'react';
import type { Doc } from '../core/format';
import { Icon } from '../ui/icons';
import { importTemplate, removeTemplate, shareTemplate } from './actions';
import { templateSources, userTemplatesVersion, type TemplateCard, type TemplateSource } from './user';
import './templates.css';

function useSource(s: TemplateSource): TemplateCard[] | null {
  const version = userTemplatesVersion.use((v) => v);
  const [list, setList] = useState<TemplateCard[] | null>(null);
  useEffect(() => {
    let live = true;
    s.list()
      .then((l) => live && setList(l))
      .catch(() => live && setList([]));
    return () => void (live = false);
  }, [s, version]);
  return list;
}

export function SourceCards({ source, onPick, thumb }: { source: TemplateSource; onPick: (doc: Doc, name: string) => void; thumb: (t: TemplateCard) => ReactNode }) {
  const list = useSource(source);
  const yours = source.id === 'yours';
  if (!list) return <div className="tpl-loading" aria-busy="true" />;
  return (
    <div className="ui-example-list tpl-list">
      {list.map((t) => (
        <div key={t.id} className="tpl-card-wrap">
          <button type="button" data-wraps className="ui-example" onClick={() => onPick(t.make(), t.name.toLowerCase())} data-tip={t.author ? `By ${t.author}` : undefined} data-tip-desc={t.tags?.length ? t.tags.join(', ') : undefined}>
            <span className="ui-example-art">
              {thumb(t)}
              <span className={`ui-badge ui-badge-${t.kind} ui-example-badge`}>
                <Icon name={t.kind === 'pixel' ? 'pixel' : 'vector'} size={12} />
                {t.kind === 'pixel' ? 'Pixel' : 'Vector'}
              </span>
            </span>
            <span className="ui-example-head">
              <strong>{t.name}</strong>
            </span>
            {t.blurb && <span className="ui-preset-blurb">{t.blurb}</span>}
          </button>
          {yours && (
            <span className="tpl-card-tools">
              <button type="button" className="ui-icon-btn" aria-label={`Share ${t.name} as a file`} data-tip="Save a copy to share" onClick={() => void shareTemplate(t.id, t.name)}>
                <Icon name="export" size={14} />
              </button>
              <button type="button" className="ui-icon-btn" aria-label={`Remove ${t.name}`} data-tip="Remove from your templates" onClick={() => void removeTemplate(t.id, t.name)}>
                <Icon name="trash" size={14} />
              </button>
            </span>
          )}
        </div>
      ))}
      {yours && (
        <button type="button" data-wraps className="ui-example tpl-import" onClick={() => void importTemplate()}>
          <span className="tpl-import-art">
            <Icon name="plus" size={22} />
          </span>
          <strong>Import template...</strong>
          <span className="ui-preset-blurb">{list.length ? 'Add a template someone shared with you.' : source.empty}</span>
        </button>
      )}
      {!yours && !list.length && <p className="tpl-empty">{source.empty}</p>}
    </div>
  );
}

/** Every registered source after Built-in, as stacked sections (picked over tabs; see brand/ab/templates-yours). */
export function MoreTemplates({ onPick, thumb }: { onPick: (doc: Doc, name: string) => void; thumb: (t: TemplateCard) => ReactNode }) {
  return (
    <>
      {templateSources().map((s) => (
        <section key={s.id} className="tpl-section" data-help="templates-yours">
          <h4 className="tpl-section-title">{s.title}</h4>
          <SourceCards source={s} onPick={onPick} thumb={thumb} />
        </section>
      ))}
    </>
  );
}
