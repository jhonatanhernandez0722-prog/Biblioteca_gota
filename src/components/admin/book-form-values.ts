import type { BookDetail } from '@/lib/types'

/** Valores del formulario de ficha. Módulo compartido (servidor y cliente): sin 'use client'. */
export interface BookFormValues {
  title: string
  subtitle: string
  authors: string
  isbn: string
  publisher: string
  publishedYear: string
  pageCount: string
  language: string
  callNumber: string
  keywords: string
  description: string
  categories: string[]
  newCategories: string
  featured: boolean
  editorialPick: boolean
  editorialNote: string
  editorialQuote: string
  sourceProvider: 'manual' | 'openlibrary' | 'googlebooks'
  sourceRef: string
  sourceUrl: string
  coverUrl: string
  descriptionSource: string
  subjects: string[]
}

export const EMPTY_BOOK: BookFormValues = {
  title: '',
  subtitle: '',
  authors: '',
  isbn: '',
  publisher: '',
  publishedYear: '',
  pageCount: '',
  language: 'es',
  callNumber: '',
  keywords: '',
  description: '',
  categories: [],
  newCategories: '',
  featured: false,
  editorialPick: false,
  editorialNote: '',
  editorialQuote: '',
  sourceProvider: 'manual',
  sourceRef: '',
  sourceUrl: '',
  coverUrl: '',
  descriptionSource: '',
  subjects: [],
}

const PROVIDERS = new Set(['manual', 'openlibrary', 'googlebooks'])

export function valuesFromBook(book: BookDetail): BookFormValues {
  return {
    ...EMPTY_BOOK,
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join('\n'),
    isbn: book.isbn13 ?? book.isbn10 ?? '',
    publisher: book.publisher ?? '',
    publishedYear: book.publishedYear ? String(book.publishedYear) : '',
    pageCount: book.pageCount ? String(book.pageCount) : '',
    language: book.language ?? '',
    callNumber: book.callNumber ?? '',
    keywords: book.keywords ?? '',
    description: book.description ?? '',
    categories: book.categories.map((c) => c.name),
    featured: book.featured,
    editorialPick: book.editorialPick,
    editorialNote: book.editorialNote ?? '',
    editorialQuote: book.editorialQuote ?? '',
    sourceProvider: (PROVIDERS.has(book.sourceProvider) ? book.sourceProvider : 'manual') as BookFormValues['sourceProvider'],
    sourceRef: book.sourceRef ?? '',
    sourceUrl: book.sourceUrl ?? '',
  }
}
