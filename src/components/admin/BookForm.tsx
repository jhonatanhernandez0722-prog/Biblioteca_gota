'use client'

import { CircleAlert, CircleCheck, ImagePlus, Info, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { startTransition, useActionState, useEffect, useId, useRef, useState } from 'react'
import { saveBookAction } from '@/actions/admin'
import { DropMark } from '@/components/brand/DropMark'
import { FieldError } from '@/components/ui/FormFeedback'
import { normalizeIsbn } from '@/lib/isbn'
import { LANGUAGE_OPTIONS } from '@/lib/languages'
import type { BookFormValues } from './book-form-values'
import styles from './BookForm.module.css'

interface DuplicateMatch {
  id: number
  slug: string
  title: string
  authors: string[]
  publishedYear: number | null
  status: string
}

type CoverMode = 'keep' | 'provider' | 'upload' | 'none'

export function BookForm({
  bookId,
  initial,
  categories,
  currentCover,
  providerLabel,
}: {
  bookId?: number
  initial: BookFormValues
  categories: { slug: string; name: string }[]
  currentCover?: { url: string } | null
  providerLabel?: string
}) {
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const [state, formAction, pending] = useActionState(saveBookAction, null)
  const [v, setV] = useState<BookFormValues>(initial)
  const [coverMode, setCoverMode] = useState<CoverMode>(
    initial.coverUrl ? 'provider' : currentCover ? 'keep' : 'none',
  )
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<{ exact: DuplicateMatch[]; similar: DuplicateMatch[] }>({
    exact: [],
    similar: [],
  })

  const set = <K extends keyof BookFormValues>(key: K, value: BookFormValues[K]) =>
    setV((current) => ({ ...current, [key]: value }))
  const err = (name: string) => state?.fieldErrors?.[name]
  const id = (name: string) => `${uid}-${name}`
  const described = (name: string, hint?: boolean) =>
    [hint ? `${id(name)}-hint` : null, err(name) ? `${id(name)}-error` : null].filter(Boolean).join(' ') || undefined

  // Comprobación de duplicados mientras se escribe (ISBN, título y autoría).
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      if (!v.isbn.trim() && v.title.trim().length < 3) {
        setDuplicates({ exact: [], similar: [] })
        return
      }
      const params = new URLSearchParams({ isbn: v.isbn, title: v.title, authors: v.authors })
      if (bookId) params.set('excludeId', String(bookId))
      try {
        const response = await fetch(`/api/admin/books/duplicates?${params}`, { signal: controller.signal })
        if (response.ok) setDuplicates(await response.json())
      } catch {
        // Comprobación orientativa: el servidor vuelve a validar al guardar.
      }
    }, 450)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [v.isbn, v.title, v.authors, bookId])

  useEffect(() => {
    if (state && !state.ok) alertRef.current?.focus()
  }, [state])

  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview)
  }, [filePreview])

  const isbnInfo = v.isbn.trim() ? normalizeIsbn(v.isbn) : null
  const isbnInvalid = Boolean(v.isbn.trim()) && !isbnInfo

  const onFile = (file: File | undefined) => {
    setFileError(null)
    if (filePreview) URL.revokeObjectURL(filePreview)
    setFilePreview(null)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFileError('Formato no admitido. Usa JPG, PNG o WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError('La imagen pesa más de 5 MB.')
      return
    }
    setFilePreview(URL.createObjectURL(file))
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (coverMode !== 'upload') data.delete('coverFile')
    startTransition(() => formAction(data))
  }

  const preview =
    coverMode === 'upload'
      ? filePreview
      : coverMode === 'provider'
        ? v.coverUrl || null
        : coverMode === 'keep'
          ? (currentCover?.url ?? null)
          : null

  const addKeyword = (keyword: string) => {
    const list = v.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (!list.some((k) => k.toLowerCase() === keyword.toLowerCase())) set('keywords', [...list, keyword].join(', '))
  }

  const remainingSubjects = v.subjects.filter(
    (s) => !v.keywords.toLowerCase().split(',').map((k) => k.trim()).includes(s.toLowerCase()),
  )

  return (
    <form ref={formRef} onSubmit={onSubmit} className={styles.form} noValidate encType="multipart/form-data">
      {bookId ? <input type="hidden" name="bookId" value={bookId} /> : null}
      <input type="hidden" name="sourceProvider" value={v.sourceProvider} />
      <input type="hidden" name="sourceRef" value={v.sourceRef} />
      <input type="hidden" name="sourceUrl" value={v.sourceUrl} />
      <input type="hidden" name="coverUrl" value={v.coverUrl} />
      <input type="hidden" name="coverMode" value={coverMode} />

      {state && !state.ok && state.message ? (
        <div ref={alertRef} tabIndex={-1} className="alert alert--danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <p>{state.message}</p>
        </div>
      ) : null}

      {v.sourceProvider !== 'manual' ? (
        <div className="alert alert--brand">
          <Info aria-hidden="true" />
          <p>
            Datos importados de <strong>{providerLabel ?? v.sourceProvider}</strong>. Revísalos y corrige lo que haga
            falta antes de guardar: nada se guarda hasta que pulses el botón.
          </p>
        </div>
      ) : null}

      {/* Duplicados en vivo */}
      {duplicates.exact.length ? (
        <div className="alert alert--danger" role="status">
          <CircleAlert aria-hidden="true" />
          <div>
            <p>
              <strong>Este ISBN ya está en el catálogo.</strong> No se puede guardar otra ficha con él.
            </p>
            <ul className={styles.dupList}>
              {duplicates.exact.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/libros/${d.id}`} className="link">
                    {d.title}
                  </Link>{' '}
                  {d.authors.length ? `de ${d.authors.join(', ')}` : ''} — añade ejemplares desde su ficha.
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : duplicates.similar.length ? (
        <div className="alert alert--warning" role="status">
          <TriangleAlert aria-hidden="true" />
          <div>
            <p>
              <strong>Hay fichas muy parecidas.</strong> Comprueba que no sea el mismo libro.
            </p>
            <ul className={styles.dupList}>
              {duplicates.similar.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/libros/${d.id}`} className="link">
                    {d.title}
                  </Link>{' '}
                  {d.authors.length ? `de ${d.authors.join(', ')}` : ''}
                  {d.publishedYear ? ` (${d.publishedYear})` : ''}
                </li>
              ))}
            </ul>
            <label className="check" style={{ marginTop: 12 }}>
              <input type="checkbox" name="confirmDuplicate" aria-describedby={described('confirmDuplicate')} />
              Es otro libro u otra edición: guardar igualmente
            </label>
            <FieldError id={`${id('confirmDuplicate')}-error`} message={err('confirmDuplicate')} />
          </div>
        </div>
      ) : null}

      <div className={styles.grid}>
        {/* Datos principales */}
        <fieldset className={styles.section}>
          <legend className={styles.legend}>Datos del libro</legend>
          <div className="field span-all" data-invalid={Boolean(err('title'))}>
            <label htmlFor={id('title')}>Título</label>
            <input
              id={id('title')}
              name="title"
              className="input"
              required
              maxLength={300}
              value={v.title}
              onChange={(e) => set('title', e.target.value)}
              aria-invalid={Boolean(err('title')) || undefined}
              aria-describedby={described('title')}
            />
            <FieldError id={`${id('title')}-error`} message={err('title')} />
          </div>
          <div className="field span-all">
            <label htmlFor={id('subtitle')}>
              Subtítulo <span className="field-optional">(opcional)</span>
            </label>
            <input
              id={id('subtitle')}
              name="subtitle"
              className="input"
              maxLength={300}
              value={v.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </div>
          <div className="field span-all" data-invalid={Boolean(err('authors'))}>
            <label htmlFor={id('authors')}>Autoría</label>
            <textarea
              id={id('authors')}
              name="authors"
              className="textarea"
              rows={2}
              style={{ minHeight: 76 }}
              value={v.authors}
              onChange={(e) => set('authors', e.target.value)}
              aria-invalid={Boolean(err('authors')) || undefined}
              aria-describedby={described('authors', true)}
            />
            <p id={`${id('authors')}-hint`} className="field-hint">
              Una persona por línea, con nombre y apellidos.
            </p>
            <FieldError id={`${id('authors')}-error`} message={err('authors')} />
          </div>
          <div className="field" data-invalid={isbnInvalid || Boolean(err('isbn'))}>
            <label htmlFor={id('isbn')}>
              ISBN <span className="field-optional">(opcional)</span>
            </label>
            <input
              id={id('isbn')}
              name="isbn"
              className="input"
              inputMode="numeric"
              maxLength={20}
              value={v.isbn}
              onChange={(e) => set('isbn', e.target.value)}
              aria-invalid={isbnInvalid || Boolean(err('isbn')) || undefined}
              aria-describedby={`${id('isbn')}-status`}
            />
            <p id={`${id('isbn')}-status`} className={isbnInvalid ? 'field-error' : 'field-hint'}>
              {isbnInvalid ? (
                <>
                  <CircleAlert aria-hidden="true" />
                  No es un ISBN válido: revisa los dígitos.
                </>
              ) : isbnInfo ? (
                <>
                  <CircleCheck aria-hidden="true" width={14} height={14} style={{ display: 'inline', verticalAlign: -2 }} />{' '}
                  ISBN-13 {isbnInfo.isbn13}
                </>
              ) : (
                '10 o 13 dígitos; los guiones no importan.'
              )}
            </p>
            <FieldError id={`${id('isbn')}-error`} message={err('isbn')} />
          </div>
          <div className="field">
            <label htmlFor={id('publisher')}>Editorial</label>
            <input
              id={id('publisher')}
              name="publisher"
              className="input"
              maxLength={200}
              value={v.publisher}
              onChange={(e) => set('publisher', e.target.value)}
            />
          </div>
          <div className="field" data-invalid={Boolean(err('publishedYear'))}>
            <label htmlFor={id('publishedYear')}>Año de la edición</label>
            <input
              id={id('publishedYear')}
              name="publishedYear"
              className="input"
              inputMode="numeric"
              maxLength={4}
              value={v.publishedYear}
              onChange={(e) => set('publishedYear', e.target.value.replace(/\D/g, ''))}
              aria-invalid={Boolean(err('publishedYear')) || undefined}
              aria-describedby={described('publishedYear')}
            />
            <FieldError id={`${id('publishedYear')}-error`} message={err('publishedYear')} />
          </div>
          <div className="field" data-invalid={Boolean(err('pageCount'))}>
            <label htmlFor={id('pageCount')}>Páginas</label>
            <input
              id={id('pageCount')}
              name="pageCount"
              className="input"
              inputMode="numeric"
              maxLength={5}
              value={v.pageCount}
              onChange={(e) => set('pageCount', e.target.value.replace(/\D/g, ''))}
              aria-invalid={Boolean(err('pageCount')) || undefined}
              aria-describedby={described('pageCount', true)}
            />
            <p id={`${id('pageCount')}-hint`} className="field-hint">
              Activa la calculadora de ritmo de lectura.
            </p>
            <FieldError id={`${id('pageCount')}-error`} message={err('pageCount')} />
          </div>
          <div className="field">
            <label htmlFor={id('language')}>Idioma</label>
            <select
              id={id('language')}
              name="language"
              className="select"
              value={v.language}
              onChange={(e) => set('language', e.target.value)}
            >
              <option value="">Sin indicar</option>
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={id('callNumber')}>
              Signatura <span className="field-optional">(opcional)</span>
            </label>
            <input
              id={id('callNumber')}
              name="callNumber"
              className="input"
              maxLength={40}
              placeholder="Se genera sola si la dejas vacía"
              value={v.callNumber}
              onChange={(e) => set('callNumber', e.target.value)}
            />
          </div>
        </fieldset>

        {/* Portada */}
        <fieldset className={styles.section}>
          <legend className={styles.legend}>Portada</legend>
          <div className={`span-all ${styles.coverRow}`}>
            <div className={styles.coverPreview}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local o del proveedor
                <img src={preview} alt="Vista previa de la portada" />
              ) : (
                <div className={styles.coverGenerated}>
                  <span>{v.title || 'Título'}</span>
                  <DropMark size={20} spine="var(--paper-deep)" />
                </div>
              )}
            </div>
            <div className={styles.coverOptions} role="radiogroup" aria-label="Origen de la portada">
              {currentCover ? (
                <label className="check">
                  <input type="radio" name="coverChoice" checked={coverMode === 'keep'} onChange={() => setCoverMode('keep')} />
                  Mantener la portada actual
                </label>
              ) : null}
              {v.coverUrl ? (
                <label className="check">
                  <input
                    type="radio"
                    name="coverChoice"
                    checked={coverMode === 'provider'}
                    onChange={() => setCoverMode('provider')}
                  />
                  Usar la portada de {providerLabel ?? 'el proveedor'}
                </label>
              ) : null}
              <label className="check">
                <input type="radio" name="coverChoice" checked={coverMode === 'upload'} onChange={() => setCoverMode('upload')} />
                {currentCover || v.coverUrl ? 'Subir otra imagen' : 'Subir una imagen'}
              </label>
              <label className="check">
                <input type="radio" name="coverChoice" checked={coverMode === 'none'} onChange={() => setCoverMode('none')} />
                Sin imagen: portada tipográfica
              </label>
              {coverMode === 'upload' ? (
                <div className="field" data-invalid={Boolean(fileError || err('coverFile'))}>
                  <label htmlFor={id('coverFile')} className={styles.fileLabel}>
                    <ImagePlus aria-hidden="true" />
                    Elegir imagen
                  </label>
                  <input
                    id={id('coverFile')}
                    name="coverFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={styles.file}
                    onChange={(e) => onFile(e.target.files?.[0])}
                    aria-describedby={`${id('coverFile')}-hint`}
                  />
                  <p id={`${id('coverFile')}-hint`} className="field-hint">
                    JPG, PNG o WebP de hasta 5 MB. Se reduce a 800 × 1200 px y se eliminan sus metadatos.
                  </p>
                  <FieldError id={`${id('coverFile')}-error`} message={fileError ?? err('coverFile')} />
                </div>
              ) : null}
              <FieldError id={`${id('coverMode')}-error`} message={err('coverMode')} />
            </div>
          </div>
        </fieldset>

        {/* Clasificación */}
        <fieldset className={styles.section}>
          <legend className={styles.legend}>Clasificación</legend>
          <div className="field span-all">
            <span className="field-label" id={id('categories')}>
              Categorías
            </span>
            <div className={styles.checks} role="group" aria-labelledby={id('categories')}>
              {categories.map((c) => (
                <label key={c.slug} className="check">
                  <input
                    type="checkbox"
                    name="categories"
                    value={c.name}
                    checked={v.categories.includes(c.name)}
                    onChange={(e) =>
                      set(
                        'categories',
                        e.target.checked ? [...v.categories, c.name] : v.categories.filter((n) => n !== c.name),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor={id('newCategories')}>Categorías nuevas</label>
            <input
              id={id('newCategories')}
              name="newCategories"
              className="input"
              maxLength={300}
              value={v.newCategories}
              onChange={(e) => set('newCategories', e.target.value)}
              aria-describedby={`${id('newCategories')}-hint`}
            />
            <p id={`${id('newCategories')}-hint`} className="field-hint">
              Separadas por comas. Se crean al guardar.
            </p>
          </div>
          <div className="field">
            <label htmlFor={id('keywords')}>Temas y palabras clave</label>
            <input
              id={id('keywords')}
              name="keywords"
              className="input"
              maxLength={500}
              value={v.keywords}
              onChange={(e) => set('keywords', e.target.value)}
              aria-describedby={`${id('keywords')}-hint`}
            />
            <p id={`${id('keywords')}-hint`} className="field-hint">
              Separados por comas. Ayudan a encontrar el libro.
            </p>
          </div>
          {remainingSubjects.length ? (
            <div className="span-all">
              <p className="field-hint" style={{ marginBottom: 8 }}>
                Temas sugeridos por el proveedor (pulsa para añadirlos):
              </p>
              <div className={styles.suggestions}>
                {remainingSubjects.slice(0, 10).map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => addKeyword(s)}>
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>

        {/* Descripción */}
        <fieldset className={styles.section}>
          <legend className={styles.legend}>Sinopsis</legend>
          {v.descriptionSource ? (
            <div className="alert alert--warning span-all">
              <TriangleAlert aria-hidden="true" />
              <p>
                El proveedor indica que esta descripción procede de <strong>{v.descriptionSource}</strong>. Si es de
                Wikipedia, su licencia (CC BY-SA) obliga a citar la fuente: conserva esa línea o escribe una sinopsis
                propia.
              </p>
            </div>
          ) : null}
          <div className="field span-all" data-invalid={Boolean(err('description'))}>
            <label htmlFor={id('description')}>
              Descripción <span className="field-optional">(opcional)</span>
            </label>
            <textarea
              id={id('description')}
              name="description"
              className="textarea"
              rows={6}
              maxLength={8000}
              value={v.description}
              onChange={(e) => set('description', e.target.value)}
              aria-describedby={described('description')}
            />
            <FieldError id={`${id('description')}-error`} message={err('description')} />
          </div>
        </fieldset>

        {!bookId ? (
          <fieldset className={styles.section}>
            <legend className={styles.legend}>Ejemplares físicos</legend>
            <div className="field" data-invalid={Boolean(err('copies'))}>
              <label htmlFor={id('copies')}>Ejemplares que registras ahora</label>
              <input
                id={id('copies')}
                name="copies"
                type="number"
                min={0}
                max={50}
                defaultValue={1}
                className="input"
                aria-describedby={`${id('copies')}-hint`}
              />
              <p id={`${id('copies')}-hint`} className="field-hint">
                Cada uno recibe su código (GG-000123). Puedes añadir más después.
              </p>
              <FieldError id={`${id('copies')}-error`} message={err('copies')} />
            </div>
            <div className="field">
              <label htmlFor={id('location')}>Ubicación</label>
              <input
                id={id('location')}
                name="location"
                className="input"
                maxLength={100}
                placeholder="Sala general, estante C"
              />
            </div>
          </fieldset>
        ) : null}

        <fieldset className={styles.section}>
          <legend className={styles.legend}>En la portada de la web</legend>
          <label className="check span-all">
            <input
              type="checkbox"
              name="featured"
              checked={v.featured}
              onChange={(e) => set('featured', e.target.checked)}
            />
            Mostrar en «Selección de la biblioteca»
          </label>
          <label className="check span-all">
            <input
              type="checkbox"
              name="editorialPick"
              checked={v.editorialPick}
              onChange={(e) => set('editorialPick', e.target.checked)}
            />
            Recomendación del momento (sustituye a la actual)
          </label>
          {v.editorialPick ? (
            <>
              <div className="field span-all">
                <label htmlFor={id('editorialQuote')}>Cita del libro</label>
                <textarea
                  id={id('editorialQuote')}
                  name="editorialQuote"
                  className="textarea"
                  rows={2}
                  style={{ minHeight: 76 }}
                  maxLength={600}
                  value={v.editorialQuote}
                  onChange={(e) => set('editorialQuote', e.target.value)}
                  aria-describedby={`${id('editorialQuote')}-hint`}
                />
                <p id={`${id('editorialQuote')}-hint`} className="field-hint">
                  Un fragmento breve. Si la obra no es de dominio público, cítalo con moderación.
                </p>
              </div>
              <div className="field span-all">
                <label htmlFor={id('editorialNote')}>Por qué lo recomendamos</label>
                <textarea
                  id={id('editorialNote')}
                  name="editorialNote"
                  className="textarea"
                  rows={3}
                  maxLength={1000}
                  value={v.editorialNote}
                  onChange={(e) => set('editorialNote', e.target.value)}
                />
              </div>
            </>
          ) : null}
        </fieldset>
      </div>

      <div className={styles.submitBar}>
        <button type="submit" className="btn" data-pending={pending} aria-disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {pending ? 'Guardando…' : bookId ? 'Guardar cambios' : 'Guardar en el catálogo'}
        </button>
        <Link href={bookId ? `/admin/libros/${bookId}` : '/admin/libros'} className="btn btn--ghost">
          Cancelar
        </Link>
        {pending && coverMode === 'provider' ? (
          <p className="meta" role="status">
            Descargando y procesando la portada…
          </p>
        ) : null}
      </div>
    </form>
  )
}
