import { env } from '../../env'
import { GoogleBooksProvider } from './google-books'
import { OpenLibraryProvider } from './open-library'
import type { BookMetadataProvider, ProviderId, ProviderInfo } from './types'

export * from './types'

/**
 * Registro de proveedores. La aplicación solo habla con `BookMetadataProvider`:
 * cambiar de proveedor es cambiar BOOK_METADATA_PROVIDER, sin tocar pantallas ni servicios.
 */
let registry: Record<ProviderId, BookMetadataProvider> | undefined

function providers(): Record<ProviderId, BookMetadataProvider> {
  if (!registry) {
    const config = env()
    registry = {
      openlibrary: new OpenLibraryProvider(config.OPENLIBRARY_CONTACT_EMAIL),
      googlebooks: new GoogleBooksProvider(config.GOOGLE_BOOKS_API_KEY),
    }
  }
  return registry
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'openlibrary' || value === 'googlebooks'
}

export function getDefaultProviderId(): ProviderId {
  const preferred = env().BOOK_METADATA_PROVIDER
  return providers()[preferred].info.configured ? preferred : 'openlibrary'
}

export function getMetadataProvider(id?: ProviderId): BookMetadataProvider {
  return providers()[id ?? getDefaultProviderId()]
}

export function listProviders(): ProviderInfo[] {
  return Object.values(providers()).map((p) => p.info)
}
